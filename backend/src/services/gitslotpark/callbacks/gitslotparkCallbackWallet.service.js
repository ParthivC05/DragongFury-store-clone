'use strict';

const { Op } = require('sequelize');
const db = require('../../../db/models');
const {
  PURCHASED_CURRENCY_CODE,
  BONUS_CURRENCY_CODE,
  REDEEMABLE_CURRENCY_CODE,
  DEFAULT_CURRENCY
} = require('../../wallet/getCurrencySetting.service');
const {
  ensureWallet,
  usableOf,
  splitPlayDebit,
  roundMoney
} = require('../../wallet/walletBuckets.service');
const { resolveLockedBonusSc } = require('../../wallet/bonusScLock.service');
const { formatBalance } = require('../gitslotparkSign.helpers');
const { RESULT } = require('./gitslotparkCallback.helpers');
const { createLogger } = require('../../../libs/logger');
const { isGcCoin } = require('../../../lib/normalizePlayCoinType');
const { getGcBalance, applyGcDelta } = require('../../wallet/gcWallet.service');

const log = createLogger('slotsCallbackWallet');

function ledgerIntegerGameId(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

async function spendableBonusOf(userId, bscWallet, options = {}) {
  const resolved = await resolveLockedBonusSc(userId, usableOf(bscWallet), options);
  return resolved.spendableBsc;
}

function insufficientFundsError() {
  const err = new Error('Insufficient funds');
  err.code = RESULT.INSUFFICIENT_FUNDS;
  return err;
}

/**
 * Slots playable = usable PSC + BSC + RSC (+ leftover legacy SC).
 * Gold Coins (DragonFury) use a separate entertainment wallet.
 */
async function getPlayableBalance(userId, transaction, coinType = 'SC') {
  if (isGcCoin(coinType)) {
    return getGcBalance(userId, transaction);
  }
  const [pscWallet, bscWallet, rscWallet, legacyWallet] = await Promise.all([
    ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction),
    ensureWallet(userId, BONUS_CURRENCY_CODE, transaction),
    ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction),
    ensureWallet(userId, DEFAULT_CURRENCY, transaction)
  ]);
  const spendableBsc = await spendableBonusOf(userId, bscWallet, { transaction });
  return formatBalance(
    usableOf(pscWallet) + spendableBsc + usableOf(rscWallet) + usableOf(legacyWallet)
  );
}

async function recordWalletTransactions(userId, type, description, baseMetadata, walletImpact, transaction) {
  if (!db.UserTransaction) return;

  const metadata = {
    ...(baseMetadata || {}),
    walletImpact: {
      psc: formatBalance(walletImpact.psc || 0),
      bsc: formatBalance(walletImpact.bsc || 0),
      rsc: formatBalance(walletImpact.rsc || 0),
      // Legacy alias for older UIs
      sc: formatBalance(roundMoney((walletImpact.psc || 0) + (walletImpact.bsc || 0)))
    }
  };

  const rows = [];
  if (walletImpact.psc) {
    rows.push({
      userId,
      type: type || 'gitslotpark',
      amount: formatBalance(Math.abs(walletImpact.psc)),
      currencyCode: PURCHASED_CURRENCY_CODE,
      description: description || 'GitSlotPark',
      metadata: { ...metadata, wallet: PURCHASED_CURRENCY_CODE }
    });
  }
  if (walletImpact.bsc) {
    rows.push({
      userId,
      type: type || 'gitslotpark',
      amount: formatBalance(Math.abs(walletImpact.bsc)),
      currencyCode: BONUS_CURRENCY_CODE,
      description: description || 'GitSlotPark',
      metadata: { ...metadata, wallet: BONUS_CURRENCY_CODE }
    });
  }
  if (walletImpact.rsc) {
    rows.push({
      userId,
      type: type || 'gitslotpark',
      amount: formatBalance(Math.abs(walletImpact.rsc)),
      currencyCode: REDEEMABLE_CURRENCY_CODE,
      description: description || 'GitSlotPark',
      metadata: { ...metadata, wallet: REDEEMABLE_CURRENCY_CODE }
    });
  }

  if (!rows.length) {
    rows.push({
      userId,
      type: type || 'gitslotpark',
      amount: 0,
      currencyCode: PURCHASED_CURRENCY_CODE,
      description: description || 'GitSlotPark',
      metadata
    });
  }

  for (const row of rows) {
    await db.UserTransaction.create(row, { transaction });
  }
}

async function writeSlotsLedger(userId, {
  pscWallet,
  bscWallet,
  rscWallet,
  remainingPscDebit,
  legacyDebit,
  pscDelta,
  bscDelta,
  rscDelta,
  meta,
  transaction
}) {
  const { recordWalletChange, recordRscWin } = require('../../wallet/scLedger.service');
  const rawGameId = meta?.gameId ?? meta?.metadata?.gameId ?? null;
  const numericGameId = ledgerIntegerGameId(rawGameId);
  const ledgerBase = {
    sourceType: meta?.sourceType || meta?.metadata?.provider || 'GITSLOTPARK',
    sourceId: meta?.sourceId || meta?.metadata?.transactionId || meta?.metadata?.roundId || null,
    productId: 'DIRECT',
    productType: 'DIRECT',
    providerId: meta?.providerId || meta?.metadata?.providerId || 'KA',
    gameId: numericGameId,
    roundId: meta?.roundId || meta?.metadata?.roundId || meta?.metadata?.transactionId || null,
    remarks: meta?.description || 'Direct game',
    metadata: numericGameId == null && rawGameId != null ? { providerGameId: String(rawGameId) } : undefined
  };

  if (remainingPscDebit > 0 || pscDelta < 0 || legacyDebit > 0) {
    const debitPsc = formatBalance((remainingPscDebit || 0) + (legacyDebit || 0) || (-pscDelta));
    if (debitPsc > 0) {
      await recordWalletChange({
        userId,
        currencyCode: PURCHASED_CURRENCY_CODE,
        direction: 'DEBIT',
        amount: debitPsc,
        wallet: pscWallet,
        ledger: { ...ledgerBase, eventType: 'USED_DIRECT', suffix: 'psc' },
        transaction
      });
    }
  } else if (pscDelta > 0) {
    await recordWalletChange({
      userId,
      currencyCode: PURCHASED_CURRENCY_CODE,
      direction: 'CREDIT',
      amount: pscDelta,
      wallet: pscWallet,
      ledger: { ...ledgerBase, eventType: 'REFUND', suffix: 'psc' },
      transaction
    });
  }

  if (bscDelta < 0) {
    await recordWalletChange({
      userId,
      currencyCode: BONUS_CURRENCY_CODE,
      direction: 'DEBIT',
      amount: formatBalance(-bscDelta),
      wallet: bscWallet,
      ledger: { ...ledgerBase, eventType: 'USED_DIRECT', suffix: 'bsc' },
      transaction
    });
  } else if (bscDelta > 0) {
    await recordWalletChange({
      userId,
      currencyCode: BONUS_CURRENCY_CODE,
      direction: 'CREDIT',
      amount: bscDelta,
      wallet: bscWallet,
      ledger: { ...ledgerBase, eventType: 'REFUND', bonusType: 'OTHER_BONUS', suffix: 'bsc' },
      transaction
    });
  }

  if (rscDelta < 0) {
    await recordWalletChange({
      userId,
      currencyCode: REDEEMABLE_CURRENCY_CODE,
      direction: 'DEBIT',
      amount: formatBalance(-rscDelta),
      wallet: rscWallet,
      ledger: { ...ledgerBase, eventType: 'USED_DIRECT', suffix: 'rsc' },
      transaction
    });
  } else if (rscDelta > 0) {
    await rscWallet.update(
      { balance: formatBalance((Number(rscWallet.balance) || 0) - rscDelta) },
      { transaction }
    );
    const win = await recordRscWin({
      userId,
      grossAmount: rscDelta,
      creditWallet: true,
      ledger: { ...ledgerBase, eventType: 'WIN_DIRECT' },
      transaction
    });
    if (win.voided > 0) {
      await rscWallet.reload({ transaction });
    }
  }
}

async function applyWalletImpact(userId, walletImpact, meta, transaction) {
  const [pscWallet, bscWallet, rscWallet, legacyWallet] = await Promise.all([
    ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction),
    ensureWallet(userId, BONUS_CURRENCY_CODE, transaction),
    ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction),
    ensureWallet(userId, DEFAULT_CURRENCY, transaction)
  ]);

  const pscDelta = formatBalance(walletImpact.psc || 0);
  const bscDelta = formatBalance(walletImpact.bsc || 0);
  const rscDelta = formatBalance(walletImpact.rsc || 0);

  // Debits against PSC may consume leftover legacy SC first.
  let remainingPscDebit = pscDelta < 0 ? formatBalance(-pscDelta) : 0;
  const legacyUsable = usableOf(legacyWallet);
  let legacyDebit = 0;
  if (remainingPscDebit > 0 && legacyUsable > 0) {
    legacyDebit = formatBalance(Math.min(legacyUsable, remainingPscDebit));
    remainingPscDebit = formatBalance(remainingPscDebit - legacyDebit);
  }

  const nextPscPlayable = usableOf(pscWallet) - remainingPscDebit + (pscDelta > 0 ? pscDelta : 0);
  const nextBscPlayable = usableOf(bscWallet) + bscDelta;
  const nextRscPlayable = usableOf(rscWallet) + rscDelta;
  if (nextPscPlayable < -0.0001 || nextBscPlayable < -0.0001 || nextRscPlayable < -0.0001) {
    throw insufficientFundsError();
  }

  if (legacyDebit > 0) {
    await legacyWallet.update(
      { balance: formatBalance((Number(legacyWallet.balance) || 0) - legacyDebit) },
      { transaction }
    );
  }
  if (remainingPscDebit > 0 || pscDelta > 0) {
    const appliedPsc = pscDelta > 0 ? pscDelta : -remainingPscDebit;
    await pscWallet.update(
      { balance: formatBalance((Number(pscWallet.balance) || 0) + appliedPsc) },
      { transaction }
    );
  }
  if (bscDelta !== 0) {
    await bscWallet.update(
      { balance: formatBalance((Number(bscWallet.balance) || 0) + bscDelta) },
      { transaction }
    );
  }
  if (rscDelta !== 0) {
    await rscWallet.update(
      { balance: formatBalance((Number(rscWallet.balance) || 0) + rscDelta) },
      { transaction }
    );
  }

  await pscWallet.reload({ transaction });
  await bscWallet.reload({ transaction });
  await rscWallet.reload({ transaction });

  const savepoint = `sp_slots_led_${Date.now().toString(36)}`;
  try {
    if (transaction) {
      await db.sequelize.query(`SAVEPOINT ${savepoint}`, { transaction });
    }
    await writeSlotsLedger(userId, {
      pscWallet,
      bscWallet,
      rscWallet,
      remainingPscDebit,
      legacyDebit,
      pscDelta,
      bscDelta,
      rscDelta,
      meta,
      transaction
    });
    if (transaction) {
      await db.sequelize.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction });
    }
  } catch (err) {
    if (transaction) {
      try {
        await db.sequelize.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, { transaction });
      } catch (_) { /* already aborted */ }
    }
    log.error('Slots wallet ledger write failed; play credit/debit was kept', {
      userId,
      err: err?.message || String(err)
    });
    if (rscDelta > 0) {
      await rscWallet.reload({ transaction });
    }
  }

  await recordWalletTransactions(
    userId,
    meta?.type,
    meta?.description,
    meta?.metadata,
    { psc: pscDelta, bsc: bscDelta, rsc: rscDelta },
    transaction
  );

  await rscWallet.reload({ transaction });
  return formatBalance(
    Math.max(0, nextPscPlayable) + Math.max(0, nextBscPlayable) + Math.max(0, usableOf(rscWallet))
  );
}

/**
 * Build PSC/BSC/RSC impact for a slots wallet mutation.
 * - Debits: PSC → BSC → RSC
 * - Credits (wins): RSC only
 * - betwin: debit bet from PSC→BSC→RSC, credit win to RSC
 */
function buildSlotsWalletImpact({ delta, betAmount, winAmount, pscUsable, bscUsable, rscUsable, scUsable }) {
  // Backward-compat: older callers passed scUsable (= PSC+BSC combined).
  const purchased = pscUsable != null ? Number(pscUsable) : Number(scUsable) || 0;
  const bonus = Number(bscUsable) || 0;
  const redeemable = Number(rscUsable) || 0;

  if (betAmount != null && winAmount != null) {
    const bet = formatBalance(betAmount);
    const win = formatBalance(winAmount);
    if (purchased + bonus + redeemable < bet - 0.0001) {
      throw insufficientFundsError();
    }
    const split = splitPlayDebit(bet, {
      pscUsable: purchased,
      bscUsable: bonus,
      rscUsable: redeemable
    });
    return {
      psc: formatBalance(-split.psc),
      bsc: formatBalance(-split.bsc),
      rsc: formatBalance(-split.rsc + win),
      // legacy
      sc: formatBalance(-(split.psc + split.bsc))
    };
  }

  const amount = formatBalance(delta || 0);
  if (amount < 0) {
    const need = formatBalance(-amount);
    if (purchased + bonus + redeemable < need - 0.0001) {
      throw insufficientFundsError();
    }
    const split = splitPlayDebit(need, {
      pscUsable: purchased,
      bscUsable: bonus,
      rscUsable: redeemable
    });
    return {
      psc: formatBalance(-split.psc),
      bsc: formatBalance(-split.bsc),
      rsc: formatBalance(-split.rsc),
      sc: formatBalance(-(split.psc + split.bsc))
    };
  }

  if (amount > 0) {
    return { psc: 0, bsc: 0, rsc: amount, sc: 0 };
  }

  return { psc: 0, bsc: 0, rsc: 0, sc: 0 };
}

/**
 * Apply a GitSlotPark balance delta under PSC→BSC→RSC slots rules.
 * Gold Coins stay on the GC wallet (wins are not redeemable).
 */
async function applyBalanceDelta(userId, delta, meta, transaction, options = {}) {
  if (isGcCoin(options.coinType)) {
    return applyGcDelta(userId, delta, meta, transaction);
  }
  const [pscWallet, bscWallet, rscWallet, legacyWallet] = await Promise.all([
    ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction),
    ensureWallet(userId, BONUS_CURRENCY_CODE, transaction),
    ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction),
    ensureWallet(userId, DEFAULT_CURRENCY, transaction)
  ]);

  const walletImpact = buildSlotsWalletImpact({
    delta,
    betAmount: options.betAmount,
    winAmount: options.winAmount,
    pscUsable: usableOf(pscWallet) + usableOf(legacyWallet),
    bscUsable: await spendableBonusOf(userId, bscWallet, { transaction }),
    rscUsable: usableOf(rscWallet)
  });

  return applyWalletImpact(userId, walletImpact, meta, transaction);
}

/**
 * Reverse a prior mutation using stored walletImpact when available.
 */
async function applyRollbackDelta(userId, originalTransactionId, reverseDelta, meta, transaction, options = {}) {
  if (isGcCoin(options.coinType)) {
    return applyGcDelta(userId, reverseDelta, meta, transaction);
  }
  let storedImpact = null;

  if (db.UserTransaction && originalTransactionId) {
    const prior = await db.UserTransaction.findOne({
      where: {
        userId,
        [Op.and]: [
          db.sequelize.where(
            db.sequelize.literal(`metadata->>'transactionId'`),
            String(originalTransactionId)
          )
        ]
      },
      order: [['id', 'ASC']],
      transaction
    });
    const impact = prior?.metadata?.walletImpact;
    if (impact && (impact.psc != null || impact.bsc != null || impact.rsc != null || impact.sc != null)) {
      const psc = impact.psc != null ? Number(impact.psc) || 0 : Number(impact.sc) || 0;
      const bsc = Number(impact.bsc) || 0;
      const rsc = Number(impact.rsc) || 0;
      storedImpact = {
        psc: formatBalance(-psc),
        bsc: formatBalance(-bsc),
        rsc: formatBalance(-rsc)
      };
    }
  }

  if (storedImpact) {
    return applyWalletImpact(userId, storedImpact, meta, transaction);
  }

  // Legacy rows only touched SC — reverse onto PSC.
  const pscWallet = await ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction);
  const balance = Number(pscWallet.balance) || 0;
  const frozen = Number(pscWallet.frozenBalance) || 0;
  const playable = balance - frozen;
  const nextPlayable = playable + reverseDelta;
  if (nextPlayable < -0.0001) {
    throw insufficientFundsError();
  }
  await pscWallet.update({ balance: formatBalance(balance + reverseDelta) }, { transaction });
  await recordWalletTransactions(
    userId,
    meta?.type,
    meta?.description,
    meta?.metadata,
    { psc: formatBalance(reverseDelta), bsc: 0, rsc: 0 },
    transaction
  );
  const [bscWallet, rscWallet] = await Promise.all([
    ensureWallet(userId, BONUS_CURRENCY_CODE, transaction),
    ensureWallet(userId, REDEEMABLE_CURRENCY_CODE, transaction)
  ]);
  return formatBalance(Math.max(0, nextPlayable) + usableOf(bscWallet) + usableOf(rscWallet));
}

module.exports = {
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta,
  buildSlotsWalletImpact
};
