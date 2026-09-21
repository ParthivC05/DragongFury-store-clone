'use strict';

const db = require('../../db/models');
const {
  REDEEMABLE_CURRENCY_CODE,
  PURCHASED_CURRENCY_CODE,
  BONUS_CURRENCY_CODE,
  DEFAULT_CURRENCY
} = require('../wallet/getCurrencySetting.service');
const {
  ensureWallet,
  usableOf,
  roundMoney,
  splitPlayDebit
} = require('../wallet/walletBuckets.service');
const { invalidateBalanceCache } = require('../wallet/balanceCache');
const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');
const { applyGcDelta, isGcCoinsUser } = require('../wallet/gcWallet.service');

const JAR_LABELS = {
  [PURCHASED_CURRENCY_CODE]: 'Purchased SC',
  [BONUS_CURRENCY_CODE]: 'Bonus SC',
  [REDEEMABLE_CURRENCY_CODE]: 'Redeemable SC'
};

/**
 * Deduct from wallet balance (respecting frozen). Reduces play_balance by up to the deducted amount.
 */
async function applyWalletDeduction({ transaction, userId, currencyCode, amount, createdBy, reason, skipLedger = false }) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) {
    const err = new Error('Amount must be greater than zero.');
    err.statusCode = 400;
    throw err;
  }

  let wallet = await db.Wallet.findOne({
    where: { userId, currencyCode },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!wallet) {
    wallet = await db.Wallet.create(
      { userId, currencyCode, balance: 0, playBalance: 0, frozenBalance: 0 },
      { transaction }
    );
  }

  const balance = Number(wallet.balance || 0);
  const frozen = Number(wallet.frozenBalance || 0);
  const playBal = Number(wallet.playBalance || 0);
  const usable = Math.max(0, roundMoney(balance - frozen));

  if (amt > usable) {
    const err = new Error(
      `Not enough ready ${JAR_LABELS[currencyCode] || currencyCode}. Ready: ${usable}.`
    );
    err.statusCode = 400;
    throw err;
  }

  const playReduction = Math.min(amt, playBal);
  const newBalance = roundMoney(balance - amt);
  const newPlay = roundMoney(playBal - playReduction);

  await wallet.update({ balance: newBalance, playBalance: newPlay }, { transaction });
  if (!skipLedger) {
    const { recordWalletChange } = require('../wallet/scLedger.service');
    await wallet.reload({ transaction });
    await recordWalletChange({
      userId,
      currencyCode,
      direction: 'DEBIT',
      amount: amt,
      wallet,
      ledger: {
        eventType: 'MANUAL_DEBIT',
        sourceType: 'ADMIN_ADJUST',
        sourceId: `${userId}:${currencyCode}:debit:${Date.now()}:${Math.round(amt * 100)}`,
        createdBy: createdBy || null,
        remarks: reason || 'Admin removed SC'
      },
      transaction
    });
  }
}

async function applyWalletCredit({ transaction, userId, currencyCode, amount, createdBy, reason, skipLedger = false }) {
  const amt = roundMoney(amount);
  if (!(amt > 0)) {
    const err = new Error('Amount must be greater than zero.');
    err.statusCode = 400;
    throw err;
  }

  let wallet = await db.Wallet.findOne({
    where: { userId, currencyCode },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!wallet) {
    wallet = await db.Wallet.create(
      { userId, currencyCode, balance: 0, playBalance: 0, frozenBalance: 0 },
      { transaction }
    );
  }

  // RSC is cashable immediately (same as a game redeem). PSC/BSC keep play-through.
  const fields = { balance: amt };
  if (currencyCode !== REDEEMABLE_CURRENCY_CODE) {
    fields.playBalance = amt;
  }
  await wallet.increment(fields, { transaction });
  if (!skipLedger) {
    const { recordWalletChange } = require('../wallet/scLedger.service');
    await wallet.reload({ transaction });
    const isBonus = currencyCode === BONUS_CURRENCY_CODE;
    await recordWalletChange({
      userId,
      currencyCode,
      direction: 'CREDIT',
      amount: amt,
      wallet,
      ledger: {
        eventType: isBonus ? 'MANUAL_BONUS' : (currencyCode === REDEEMABLE_CURRENCY_CODE ? 'MANUAL_CREDIT' : 'MANUAL_CREDIT'),
        bonusType: isBonus ? 'MANUAL_BONUS' : null,
        sourceType: 'ADMIN_ADJUST',
        sourceId: `${userId}:${currencyCode}:credit:${Date.now()}:${Math.round(amt * 100)}`,
        createdBy: createdBy || null,
        remarks: reason || 'Admin added SC'
      },
      transaction
    });
  }
}

function mapGcAdjustError(err) {
  if (err?.code === 6 || String(err?.message || '').toLowerCase().includes('insufficient')) {
    const mapped = new Error('Not enough ready Gold Coins.');
    mapped.statusCode = 400;
    throw mapped;
  }
  throw err;
}

async function applyAdminGcDelta(userId, amount, meta, transaction) {
  try {
    await applyGcDelta(userId, amount, meta, transaction);
  } catch (err) {
    mapGcAdjustError(err);
  }
}

function positiveAmount(value) {
  if (value == null || value === '') return 0;
  const n = roundMoney(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Deduct admin combined "SC" from PSC → BSC only (never RSC). */
async function deductNonRedeemableSc({ transaction, userId, amount, createdBy, reason }) {
  const need = roundMoney(amount);
  const [pscWallet, bscWallet, legacyWallet] = await Promise.all([
    ensureWallet(userId, PURCHASED_CURRENCY_CODE, transaction),
    ensureWallet(userId, BONUS_CURRENCY_CODE, transaction),
    ensureWallet(userId, DEFAULT_CURRENCY, transaction)
  ]);

  const pscUsable = roundMoney(usableOf(pscWallet) + usableOf(legacyWallet));
  const bscUsable = usableOf(bscWallet);
  const split = splitPlayDebit(need, { pscUsable, bscUsable, rscUsable: 0 });
  if (split.total + 0.0001 < need) {
    const err = new Error(
      `Not enough Purchased SC + Bonus SC. Ready: ${roundMoney(pscUsable + bscUsable)}.`
    );
    err.statusCode = 400;
    throw err;
  }

  let remainingPsc = split.psc;
  const legacyUsable = usableOf(legacyWallet);
  if (legacyUsable > 0 && remainingPsc > 0) {
    const fromLegacy = roundMoney(Math.min(legacyUsable, remainingPsc));
    if (fromLegacy > 0) {
      await applyWalletDeduction({
        transaction,
        userId,
        currencyCode: DEFAULT_CURRENCY,
        amount: fromLegacy,
        createdBy,
        reason
      });
      remainingPsc = roundMoney(remainingPsc - fromLegacy);
    }
  }
  if (remainingPsc > 0) {
    await applyWalletDeduction({
      transaction,
      userId,
      currencyCode: PURCHASED_CURRENCY_CODE,
      amount: remainingPsc,
      createdBy,
      reason
    });
  }
  if (split.bsc > 0) {
    await applyWalletDeduction({
      transaction,
      userId,
      currencyCode: BONUS_CURRENCY_CODE,
      amount: split.bsc,
      createdBy,
      reason
    });
  }
  return { psc: split.psc, bsc: split.bsc, rsc: 0 };
}

/**
 * Admin deduction: per-jar (psc/bsc/rsc) and/or legacy combined sc (PSC→BSC).
 */
async function adminDeductWallets({
  targetUserId,
  adminUserId,
  pscAmount,
  bscAmount,
  rscAmount,
  scAmount,
  gcAmount,
  reason
}) {
  const psc = positiveAmount(pscAmount);
  const bsc = positiveAmount(bscAmount);
  const rsc = positiveAmount(rscAmount);
  const sc = positiveAmount(scAmount);
  const gc = positiveAmount(gcAmount);

  if (!(psc > 0) && !(bsc > 0) && !(rsc > 0) && !(sc > 0) && !(gc > 0)) {
    const err = new Error('Enter how much to take from at least one wallet.');
    err.statusCode = 400;
    throw err;
  }

  if (gc > 0 && !(await isGcCoinsUser(targetUserId))) {
    const err = new Error('Gold Coins can only be adjusted for DragonFury users.');
    err.statusCode = 400;
    throw err;
  }

  const metaBase = {
    adminUserId,
    reason: reason != null ? String(reason).trim().slice(0, 500) : ''
  };

  await db.sequelize.transaction(async (transaction) => {
    if (sc > 0) {
      const funding = await deductNonRedeemableSc({
        transaction,
        userId: targetUserId,
        amount: sc,
        createdBy: adminUserId,
        reason: metaBase.reason
      });
      await db.UserTransaction.create(
        {
          userId: targetUserId,
          type: 'admin_deduct',
          amount: sc,
          currencyCode: PURCHASED_CURRENCY_CODE,
          description: 'Admin took Purchased SC + Bonus SC',
          metadata: { ...metaBase, wallet: 'SC', funding }
        },
        { transaction }
      );
    }
    if (psc > 0) {
      await applyWalletDeduction({
        transaction,
        userId: targetUserId,
        currencyCode: PURCHASED_CURRENCY_CODE,
        amount: psc,
        createdBy: adminUserId,
        reason: metaBase.reason
      });
      await db.UserTransaction.create(
        {
          userId: targetUserId,
          type: 'admin_deduct',
          amount: psc,
          currencyCode: PURCHASED_CURRENCY_CODE,
          description: 'Admin took Purchased SC',
          metadata: { ...metaBase, wallet: 'PSC', funding: { psc, bsc: 0, rsc: 0 } }
        },
        { transaction }
      );
    }
    if (bsc > 0) {
      await applyWalletDeduction({
        transaction,
        userId: targetUserId,
        currencyCode: BONUS_CURRENCY_CODE,
        amount: bsc,
        createdBy: adminUserId,
        reason: metaBase.reason
      });
      await db.UserTransaction.create(
        {
          userId: targetUserId,
          type: 'admin_deduct',
          amount: bsc,
          currencyCode: BONUS_CURRENCY_CODE,
          description: 'Admin took Bonus SC',
          metadata: { ...metaBase, wallet: 'BSC', funding: { psc: 0, bsc, rsc: 0 } }
        },
        { transaction }
      );
    }
    if (rsc > 0) {
      await applyWalletDeduction({
        transaction,
        userId: targetUserId,
        currencyCode: REDEEMABLE_CURRENCY_CODE,
        amount: rsc,
        createdBy: adminUserId,
        reason: metaBase.reason
      });
      await db.UserTransaction.create(
        {
          userId: targetUserId,
          type: 'admin_deduct',
          amount: rsc,
          currencyCode: REDEEMABLE_CURRENCY_CODE,
          description: 'Admin took Redeemable SC',
          metadata: { ...metaBase, wallet: 'RSC' }
        },
        { transaction }
      );
    }
    if (gc > 0) {
      await applyAdminGcDelta(
        targetUserId,
        -gc,
        {
          type: 'admin_deduct',
          description: metaBase.reason || 'Admin took Gold Coins',
          metadata: { ...metaBase, wallet: 'GC', jar: 'Gold Coins' }
        },
        transaction
      );
    }
  });

  invalidateBalanceCache(targetUserId);
  notifyUserBalanceChanged(targetUserId);
}

/**
 * Admin credit: per-jar psc/bsc/rsc.
 * Legacy: scAmount alone still credits Free coins (BSC).
 */
async function adminAddSc({
  targetUserId,
  adminUserId,
  pscAmount,
  bscAmount,
  rscAmount,
  scAmount,
  gcAmount,
  description
}) {
  let psc = positiveAmount(pscAmount);
  let bsc = positiveAmount(bscAmount);
  let rsc = positiveAmount(rscAmount);
  const sc = positiveAmount(scAmount);
  const gc = positiveAmount(gcAmount);

  // Legacy clients sent only `sc` → Free jar
  if (!(psc > 0) && !(bsc > 0) && !(rsc > 0) && !(gc > 0) && sc > 0) {
    bsc = sc;
  }

  if (!(psc > 0) && !(bsc > 0) && !(rsc > 0) && !(gc > 0)) {
    const err = new Error('Enter how much to give in at least one wallet.');
    err.statusCode = 400;
    throw err;
  }

  if (gc > 0 && !(await isGcCoinsUser(targetUserId))) {
    const err = new Error('Gold Coins can only be adjusted for DragonFury users.');
    err.statusCode = 400;
    throw err;
  }

  const details = description != null ? String(description).trim().slice(0, 500) : '';
  if (!details) {
    const err = new Error('Write why you are giving coins.');
    err.statusCode = 400;
    throw err;
  }

  const credits = [
    { amount: psc, currencyCode: PURCHASED_CURRENCY_CODE, wallet: 'PSC', label: 'Purchased SC' },
    { amount: bsc, currencyCode: BONUS_CURRENCY_CODE, wallet: 'BSC', label: 'Bonus SC' },
    { amount: rsc, currencyCode: REDEEMABLE_CURRENCY_CODE, wallet: 'RSC', label: 'Redeemable SC' }
  ].filter((c) => c.amount > 0);

  await db.sequelize.transaction(async (transaction) => {
    for (const credit of credits) {
      await applyWalletCredit({
        transaction,
        userId: targetUserId,
        currencyCode: credit.currencyCode,
        amount: credit.amount,
        createdBy: adminUserId,
        reason: details
      });
      await db.UserTransaction.create(
        {
          userId: targetUserId,
          type: 'admin_add',
          amount: credit.amount,
          currencyCode: credit.currencyCode,
          description: details,
          metadata: {
            adminUserId,
            wallet: credit.wallet,
            jar: credit.label,
            description: details
          }
        },
        { transaction }
      );
    }
    if (gc > 0) {
      await applyAdminGcDelta(
        targetUserId,
        gc,
        {
          type: 'admin_add',
          description: details,
          metadata: {
            adminUserId,
            wallet: 'GC',
            jar: 'Gold Coins',
            description: details
          }
        },
        transaction
      );
    }
  });

  invalidateBalanceCache(targetUserId);
  notifyUserBalanceChanged(targetUserId);
}

module.exports = { adminDeductWallets, adminAddSc, applyWalletDeduction, applyWalletCredit };
