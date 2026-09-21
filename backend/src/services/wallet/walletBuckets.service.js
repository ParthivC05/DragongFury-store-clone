'use strict';

const crypto = require('crypto');
const db = require('../../db/models');
const {
  DEFAULT_CURRENCY,
  PURCHASED_CURRENCY_CODE,
  BONUS_CURRENCY_CODE,
  REDEEMABLE_CURRENCY_CODE
} = require('./getCurrencySetting.service');
const {
  PHONE_VERIFY_REQUIRED_CODE,
  PHONE_VERIFY_REQUIRED_MESSAGE,
  resolveLockedBonusSc
} = require('./bonusScLock.service');

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function assertPlayableCoversAmount(need, split, bonusLock) {
  if (split.total + 0.0001 >= need) return;
  const locked = roundMoney(Number(bonusLock?.lockedAmount) || 0);
  if (bonusLock?.locked && roundMoney(split.total + locked) + 0.0001 >= need) {
    const err = new Error(PHONE_VERIFY_REQUIRED_MESSAGE);
    err.statusCode = 403;
    err.code = PHONE_VERIFY_REQUIRED_CODE;
    throw err;
  }
  const err = new Error('Insufficient wallet balance for this deposit.');
  err.statusCode = 400;
  throw err;
}

function usableOf(wallet) {
  if (!wallet) return 0;
  const balance = Number(wallet.balance) || 0;
  const frozen = Number(wallet.frozenBalance) || 0;
  return Math.max(0, roundMoney(balance - frozen));
}

/**
 * RSC available to cash out or send to games.
 * Play-through does not apply to redeemable SC — only frozen pending withdrawals reduce this.
 */
function rscAvailableToWithdraw(wallet) {
  return usableOf(wallet);
}

/**
 * RSC available to pay an already-frozen withdrawal.
 * Frozen funds were checked at request time; leftover playBalance may only
 * consume unfrozen RSC so it cannot block the locked payout.
 */
function redeemableForFrozenWithdrawal(wallet) {
  if (!wallet) return 0;
  const balance = Number(wallet.balance) || 0;
  const playBalance = Number(wallet.playBalance) || 0;
  const frozenBalance = Number(wallet.frozenBalance) || 0;
  const unfrozen = Math.max(0, roundMoney(balance - frozenBalance));
  const playOnUnfrozen = Math.min(Math.max(0, playBalance), unfrozen);
  return Math.max(0, roundMoney(balance - playOnUnfrozen));
}

async function ensureWallet(userId, currencyCode, transaction) {
  let wallet = await db.Wallet.findOne({
    where: { userId, currencyCode },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });
  if (!wallet) {
    wallet = await db.Wallet.create(
      {
        userId,
        currencyCode,
        balance: 0,
        playBalance: 0,
        frozenBalance: 0
      },
      { transaction }
    );
    if (transaction) {
      wallet = await db.Wallet.findOne({
        where: { userId, currencyCode },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
    }
  }
  return wallet;
}

/**
 * Create PSC + BSC + RSC (and legacy SC at 0) for a new user.
 */
async function ensureUserWalletSet(userId, transaction) {
  await ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction);
  await ensureWallet(userId, BONUS_CURRENCY_CODE, transaction);
  await ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction);
  await ensureWallet(userId, DEFAULT_CURRENCY, transaction);
}

async function appendLedger(params) {
  const { recordWalletChange } = require('./scLedger.service');
  return recordWalletChange(params);
}

/**
 * Credit a wallet bucket. Uses SQL increment so concurrent credits cannot overwrite spendable balance.
 * playBalance increases with the credit by default (play-through tracking).
 * Pass `ledger` to classify the row (purchase, welcome bonus, etc.).
 */
async function creditBucket(userId, currencyCode, amount, { transaction, withPlayBalance = true, ledger, skipLedger = false } = {}) {
  const credit = roundMoney(amount);
  if (!(credit > 0)) return null;

  const wallet = await ensureWallet(userId, currencyCode, transaction);
  const fields = { balance: credit };
  if (withPlayBalance) fields.playBalance = credit;
  await wallet.increment(fields, { transaction });
  await wallet.reload({ transaction });
  if (!skipLedger) {
    await appendLedger({
      userId,
      currencyCode,
      direction: 'CREDIT',
      amount: credit,
      wallet,
      ledger,
      transaction
    });
  }
  return wallet;
}

async function creditPurchasedSc(userId, amount, opts = {}) {
  return creditBucket(userId, PURCHASED_CURRENCY_CODE, amount, opts);
}

async function creditBonusSc(userId, amount, opts = {}) {
  return creditBucket(userId, BONUS_CURRENCY_CODE, amount, opts);
}

async function creditRedeemableSc(userId, amount, opts = {}) {
  return creditBucket(userId, REDEEMABLE_CURRENCY_CODE, amount, { withPlayBalance: false, ...opts });
}

/** Spend from a locked wallet: reduce spendable balance and play-through by the same debit. */
async function decrementBalanceAndPlay(wallet, amount, transaction, ledgerMeta = null) {
  const debit = roundMoney(amount);
  if (!(debit > 0) || !wallet) return wallet;
  const playCut = roundMoney(Math.min(Number(wallet.playBalance) || 0, debit));
  await wallet.decrement({ balance: debit }, { transaction });
  if (playCut > 0) {
    await wallet.decrement({ playBalance: playCut }, { transaction });
  }
  await wallet.reload({ transaction });
  if (ledgerMeta && !ledgerMeta.skipLedger) {
    await appendLedger({
      userId: wallet.userId,
      currencyCode: wallet.currencyCode,
      direction: 'DEBIT',
      amount: debit,
      wallet,
      ledger: ledgerMeta,
      transaction
    });
  }
  return wallet;
}

/**
 * Split a play debit across PSC → BSC → RSC.
 */
function splitPlayDebit(amount, { pscUsable = 0, bscUsable = 0, rscUsable = 0 } = {}) {
  const need = roundMoney(amount);
  const psc = roundMoney(Math.min(Math.max(0, pscUsable), need));
  const afterPsc = roundMoney(need - psc);
  const bsc = roundMoney(Math.min(Math.max(0, bscUsable), afterPsc));
  const afterBsc = roundMoney(afterPsc - bsc);
  const rsc = roundMoney(Math.min(Math.max(0, rscUsable), afterBsc));
  return { psc, bsc, rsc, total: roundMoney(psc + bsc + rsc) };
}

/**
 * Deduct playable funds PSC → BSC → RSC. Throws statusCode 400 if insufficient.
 * @returns {{ psc: number, bsc: number, rsc: number }}
 */
async function deductPlayable(userId, amount, transaction, ledgerMeta = null) {
  const need = roundMoney(amount);
  if (!(need > 0)) return { psc: 0, bsc: 0, rsc: 0 };

  const [pscWallet, bscWallet, rscWallet, legacyWallet] = await Promise.all([
    ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction),
    ensureWallet(userId, BONUS_CURRENCY_CODE, transaction),
    ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction),
    ensureWallet(userId, DEFAULT_CURRENCY, transaction)
  ]);

  // Any leftover legacy SC is treated as PSC for spend (post-migration residual).
  const legacyUsable = usableOf(legacyWallet);
  const pscUsable = roundMoney(usableOf(pscWallet) + legacyUsable);
  const bonusLock = await resolveLockedBonusSc(userId, usableOf(bscWallet), { transaction });
  const bscUsable = bonusLock.spendableBsc;
  const rscUsable = usableOf(rscWallet);
  const split = splitPlayDebit(need, { pscUsable, bscUsable, rscUsable });
  assertPlayableCoversAmount(need, split, bonusLock);

  const ledger = ledgerMeta && typeof ledgerMeta === 'object'
    ? { ...ledgerMeta, nonce: ledgerMeta.nonce || crypto.randomBytes(8).toString('hex') }
    : null;

  let remainingPscDebit = split.psc;
  if (legacyUsable > 0 && remainingPscDebit > 0) {
    const fromLegacy = roundMoney(Math.min(legacyUsable, remainingPscDebit));
    if (fromLegacy > 0) {
      await decrementBalanceAndPlay(legacyWallet, fromLegacy, transaction, ledger);
      remainingPscDebit = roundMoney(remainingPscDebit - fromLegacy);
    }
  }
  if (remainingPscDebit > 0) {
    await decrementBalanceAndPlay(pscWallet, remainingPscDebit, transaction, ledger);
  }
  if (split.bsc > 0) {
    await decrementBalanceAndPlay(bscWallet, split.bsc, transaction, ledger);
  }
  if (split.rsc > 0) {
    await decrementBalanceAndPlay(rscWallet, split.rsc, transaction, ledger);
  }

  return { psc: split.psc, bsc: split.bsc, rsc: split.rsc };
}

/**
 * Freeze playable funds PSC → BSC → RSC without spending them yet.
 * Increases frozenBalance only (usable drops; balance stays until capture/release).
 * @returns {{ psc: number, bsc: number, rsc: number }}
 */
async function freezePlayable(userId, amount, transaction) {
  const need = roundMoney(amount);
  if (!(need > 0)) return { psc: 0, bsc: 0, rsc: 0 };

  const [pscWallet, bscWallet, rscWallet, legacyWallet] = await Promise.all([
    ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction),
    ensureWallet(userId, BONUS_CURRENCY_CODE, transaction),
    ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction),
    ensureWallet(userId, DEFAULT_CURRENCY, transaction)
  ]);

  const legacyUsable = usableOf(legacyWallet);
  const pscUsable = roundMoney(usableOf(pscWallet) + legacyUsable);
  const bonusLock = await resolveLockedBonusSc(userId, usableOf(bscWallet), { transaction });
  const bscUsable = bonusLock.spendableBsc;
  const rscUsable = usableOf(rscWallet);
  const split = splitPlayDebit(need, { pscUsable, bscUsable, rscUsable });
  assertPlayableCoversAmount(need, split, bonusLock);

  let remainingPsc = split.psc;
  if (legacyUsable > 0 && remainingPsc > 0) {
    const fromLegacy = roundMoney(Math.min(legacyUsable, remainingPsc));
    if (fromLegacy > 0) {
      await legacyWallet.increment({ frozenBalance: fromLegacy }, { transaction });
      remainingPsc = roundMoney(remainingPsc - fromLegacy);
    }
  }
  if (remainingPsc > 0) {
    await pscWallet.increment({ frozenBalance: remainingPsc }, { transaction });
  }
  if (split.bsc > 0) {
    await bscWallet.increment({ frozenBalance: split.bsc }, { transaction });
  }
  if (split.rsc > 0) {
    await rscWallet.increment({ frozenBalance: split.rsc }, { transaction });
  }

  return { psc: split.psc, bsc: split.bsc, rsc: split.rsc };
}

async function releaseFrozenOnWallet(wallet, amount, transaction) {
  const amt = roundMoney(amount);
  if (!(amt > 0) || !wallet) return;
  await wallet.reload({ transaction, lock: transaction.LOCK.UPDATE });
  const frozen = Number(wallet.frozenBalance) || 0;
  const cut = roundMoney(Math.min(frozen, amt));
  if (cut > 0) {
    await wallet.decrement({ frozenBalance: cut }, { transaction });
  }
}

/**
 * Release a prior freeze (no spend). Restores usable balance.
 */
async function releaseFrozenPlayable(userId, funding, transaction = null) {
  const psc = roundMoney(Number(funding?.psc ?? funding?.primary) || 0);
  const bsc = roundMoney(Number(funding?.bsc) || 0);
  const rsc = roundMoney(Number(funding?.rsc) || 0);
  if (psc <= 0 && bsc <= 0 && rsc <= 0) return;

  const run = async (t) => {
    if (psc > 0) {
      const [pscWallet, legacyWallet] = await Promise.all([
        ensureWallet(userId, PURCHASED_CURRENCY_CODE, t),
        ensureWallet(userId, DEFAULT_CURRENCY, t)
      ]);
      const legacyFrozen = Number(legacyWallet.frozenBalance) || 0;
      let remaining = psc;
      if (legacyFrozen > 0 && remaining > 0) {
        const fromLegacy = roundMoney(Math.min(legacyFrozen, remaining));
        await releaseFrozenOnWallet(legacyWallet, fromLegacy, t);
        remaining = roundMoney(remaining - fromLegacy);
      }
      if (remaining > 0) {
        await releaseFrozenOnWallet(pscWallet, remaining, t);
      }
    }
    if (bsc > 0) {
      const bscWallet = await ensureWallet(userId, BONUS_CURRENCY_CODE, t);
      await releaseFrozenOnWallet(bscWallet, bsc, t);
    }
    if (rsc > 0) {
      const rscWallet = await ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, t);
      await releaseFrozenOnWallet(rscWallet, rsc, t);
    }
  };

  if (transaction) return run(transaction);
  return db.sequelize.transaction(run);
}

/**
 * Convert a freeze into a real spend: reduce balance + frozen, write ledger debit.
 */
async function captureFrozenPlayable(userId, funding, transaction, ledgerMeta = null) {
  const psc = roundMoney(Number(funding?.psc ?? funding?.primary) || 0);
  const bsc = roundMoney(Number(funding?.bsc) || 0);
  const rsc = roundMoney(Number(funding?.rsc) || 0);
  if (psc <= 0 && bsc <= 0 && rsc <= 0) return { psc: 0, bsc: 0, rsc: 0 };

  const ledger = ledgerMeta && typeof ledgerMeta === 'object'
    ? { ...ledgerMeta, nonce: ledgerMeta.nonce || crypto.randomBytes(8).toString('hex') }
    : null;

  async function captureOne(wallet, amount, meta) {
    const amt = roundMoney(amount);
    if (!(amt > 0) || !wallet) return;
    await wallet.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const balance = Number(wallet.balance) || 0;
    const frozen = Number(wallet.frozenBalance) || 0;
    const playBal = Number(wallet.playBalance) || 0;
    if (amt > balance + 0.0001) {
      const err = new Error('Insufficient wallet balance to complete this deposit.');
      err.statusCode = 400;
      throw err;
    }
    const frozenCut = roundMoney(Math.min(frozen, amt));
    const playCut = roundMoney(Math.min(playBal, amt));
    await wallet.update({
      balance: roundMoney(balance - amt),
      frozenBalance: roundMoney(frozen - frozenCut),
      playBalance: roundMoney(playBal - playCut)
    }, { transaction });
    await wallet.reload({ transaction });
    if (meta && !meta.skipLedger) {
      await appendLedger({
        userId: wallet.userId,
        currencyCode: wallet.currencyCode,
        direction: 'DEBIT',
        amount: amt,
        wallet,
        ledger: meta,
        transaction
      });
    }
  }

  let remainingPsc = psc;
  if (remainingPsc > 0) {
    const legacyWallet = await ensureWallet(userId, DEFAULT_CURRENCY, transaction);
    const legacyFrozen = Number(legacyWallet.frozenBalance) || 0;
    if (legacyFrozen > 0 && remainingPsc > 0) {
      const fromLegacy = roundMoney(Math.min(legacyFrozen, remainingPsc));
      await captureOne(legacyWallet, fromLegacy, ledger ? { ...ledger, suffix: 'legacy' } : null);
      remainingPsc = roundMoney(remainingPsc - fromLegacy);
    }
    if (remainingPsc > 0) {
      const pscWallet = await ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction);
      await captureOne(pscWallet, remainingPsc, ledger ? { ...ledger, suffix: 'psc' } : null);
    }
  }
  if (bsc > 0) {
    const bscWallet = await ensureWallet(userId, BONUS_CURRENCY_CODE, transaction);
    await captureOne(bscWallet, bsc, ledger ? { ...ledger, suffix: 'bsc' } : null);
  }
  if (rsc > 0) {
    const rscWallet = await ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction);
    await captureOne(rscWallet, rsc, ledger ? { ...ledger, suffix: 'rsc' } : null);
  }

  return { psc, bsc, rsc };
}

/**
 * Refund a prior play debit. Legacy `primary` maps to PSC.
 */
async function refundPlayable(userId, funding, transaction, ledgerMeta = null) {
  const psc = roundMoney(Number(funding?.psc ?? funding?.primary) || 0);
  const bsc = roundMoney(Number(funding?.bsc) || 0);
  const rsc = roundMoney(Number(funding?.rsc) || 0);
  if (psc <= 0 && bsc <= 0 && rsc <= 0) return;

  const run = async (t) => {
    const ledger = {
      eventType: 'REFUND',
      ...(ledgerMeta && typeof ledgerMeta === 'object' ? ledgerMeta : {}),
      nonce: (ledgerMeta && ledgerMeta.nonce) || crypto.randomBytes(8).toString('hex')
    };
    if (psc > 0) {
      const wallet = await ensureWallet(userId, PURCHASED_CURRENCY_CODE, t);
      await wallet.increment('balance', { by: psc, transaction: t });
      await wallet.reload({ transaction: t });
      await appendLedger({
        userId,
        currencyCode: PURCHASED_CURRENCY_CODE,
        direction: 'CREDIT',
        amount: psc,
        wallet,
        ledger: { ...ledger, suffix: 'psc' },
        transaction: t
      });
    }
    if (bsc > 0) {
      const wallet = await ensureWallet(userId, BONUS_CURRENCY_CODE, t);
      await wallet.increment('balance', { by: bsc, transaction: t });
      await wallet.reload({ transaction: t });
      await appendLedger({
        userId,
        currencyCode: BONUS_CURRENCY_CODE,
        direction: 'CREDIT',
        amount: bsc,
        wallet,
        ledger: { ...ledger, suffix: 'bsc', bonusType: 'OTHER_BONUS', remarks: `${ledger.remarks || 'Refund'} (bonus restored)` },
        transaction: t
      });
    }
    if (rsc > 0) {
      const wallet = await ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, t);
      await wallet.increment('balance', { by: rsc, transaction: t });
      await wallet.reload({ transaction: t });
      await appendLedger({
        userId,
        currencyCode: REDEEMABLE_CURRENCY_CODE,
        direction: 'CREDIT',
        amount: rsc,
        wallet,
        ledger: { ...ledger, suffix: 'rsc' },
        transaction: t
      });
    }
  };

  if (transaction) return run(transaction);
  return db.sequelize.transaction(run);
}

function buildDepositFundingNotes({ psc = 0, bsc = 0, rsc = 0 } = {}) {
  const fromPsc = roundMoney(psc);
  const fromBsc = roundMoney(bsc);
  const fromRsc = roundMoney(rsc);
  return JSON.stringify({
    funding: {
      psc: fromPsc,
      bsc: fromBsc,
      rsc: fromRsc,
      // Legacy field: PSC+BSC so older refund parsers still restore to primary bucket.
      primary: roundMoney(fromPsc + fromBsc)
    }
  });
}

/**
 * Parse game-deposit funding notes. Supports new {psc,bsc,rsc} and legacy {primary,rsc}.
 */
function parseDepositFundingFromNotes(notes, amount) {
  const total = roundMoney(amount || 0);
  let psc = total;
  let bsc = 0;
  let rsc = 0;

  if (notes) {
    try {
      const parsed = JSON.parse(notes);
      const funding = parsed?.funding || {};
      const hasNew =
        funding.psc != null || funding.bsc != null;
      if (hasNew) {
        const p = roundMoney(Number(funding.psc) || 0);
        const b = roundMoney(Number(funding.bsc) || 0);
        const r = roundMoney(Number(funding.rsc) || 0);
        if (p >= 0 && b >= 0 && r >= 0) {
          const sum = roundMoney(p + b + r);
          if (Math.abs(sum - total) <= 0.01) {
            psc = p;
            bsc = b;
            rsc = r;
          }
        }
      } else {
        const p = roundMoney(Number(funding.primary) || 0);
        const r = roundMoney(Number(funding.rsc) || 0);
        if (p >= 0 && r >= 0) {
          const sum = roundMoney(p + r);
          if (Math.abs(sum - total) <= 0.01) {
            // Legacy primary was SC → restore as PSC after migration.
            psc = p;
            bsc = 0;
            rsc = r;
          }
        }
      }
    } catch (_) { /* use full amount as PSC */ }
  }

  return {
    psc,
    bsc,
    rsc,
    primary: roundMoney(psc + bsc)
  };
}

module.exports = {
  roundMoney,
  usableOf,
  rscAvailableToWithdraw,
  redeemableForFrozenWithdrawal,
  ensureWallet,
  ensureUserWalletSet,
  creditBucket,
  creditPurchasedSc,
  creditBonusSc,
  creditRedeemableSc,
  splitPlayDebit,
  deductPlayable,
  freezePlayable,
  releaseFrozenPlayable,
  captureFrozenPlayable,
  refundPlayable,
  buildDepositFundingNotes,
  parseDepositFundingFromNotes,
  PURCHASED_CURRENCY_CODE,
  BONUS_CURRENCY_CODE,
  REDEEMABLE_CURRENCY_CODE,
  DEFAULT_CURRENCY
};
