'use strict';

const db = require('../../db/models');
const { GC_CURRENCY_CODE, isGcCoinsStore } = require('../../constants/gcCoins.js');
const { ensureWallet, usableOf, roundMoney } = require('./walletBuckets.service');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');
const { RESULT } = require('../gitslotpark/callbacks/gitslotparkCallback.helpers');
const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');

function insufficientFundsError() {
  const err = new Error('Insufficient funds');
  err.code = RESULT.INSUFFICIENT_FUNDS;
  return err;
}

async function isGcCoinsUser(userId, transaction) {
  if (!userId) return false;
  const user = await db.User.findByPk(userId, {
    attributes: ['storeCode'],
    transaction
  });
  return isGcCoinsStore(user?.storeCode);
}

async function getGcBalance(userId, transaction) {
  const wallet = await ensureWallet(userId, GC_CURRENCY_CODE, transaction);
  return formatBalance(usableOf(wallet));
}

async function recordGcTransaction(userId, type, description, amount, metadata, transaction) {
  if (!db.UserTransaction) return;
  await db.UserTransaction.create(
    {
      userId,
      type: type || 'gc',
      amount: formatBalance(Math.abs(amount)),
      currencyCode: GC_CURRENCY_CODE,
      description: description || 'Gold Coins',
      metadata: { ...(metadata || {}), wallet: GC_CURRENCY_CODE }
    },
    { transaction }
  );
}

/**
 * Entertainment-only Gold Coins: no play-through, not redeemable.
 * Wins stay in GC.
 */
async function applyGcDelta(userId, delta, meta, transaction) {
  const amount = formatBalance(delta || 0);
  const wallet = await ensureWallet(userId, GC_CURRENCY_CODE, transaction);
  const usable = usableOf(wallet);
  const next = formatBalance(usable + amount);
  if (next < -0.0001) {
    throw insufficientFundsError();
  }

  if (amount !== 0) {
    await wallet.increment({ balance: amount }, { transaction });
    await wallet.reload({ transaction });
    await recordGcTransaction(
      userId,
      meta?.type,
      meta?.description,
      amount,
      {
        ...(meta?.metadata || {}),
        walletImpact: { gc: amount, psc: 0, bsc: 0, rsc: 0, sc: 0 }
      },
      transaction
    );
    notifyUserBalanceChanged(userId);
  }

  return formatBalance(Math.max(0, usableOf(wallet)));
}

async function creditGcCoins(userId, amount, { transaction, description, metadata } = {}) {
  const credit = roundMoney(amount);
  if (!(credit > 0)) return null;
  if (!(await isGcCoinsUser(userId, transaction))) return null;
  return applyGcDelta(
    userId,
    credit,
    {
      type: 'deposit',
      description: description || 'Gold Coins package credit',
      metadata: metadata || {}
    },
    transaction
  );
}

module.exports = {
  GC_CURRENCY_CODE,
  isGcCoinsUser,
  getGcBalance,
  applyGcDelta,
  creditGcCoins
};
