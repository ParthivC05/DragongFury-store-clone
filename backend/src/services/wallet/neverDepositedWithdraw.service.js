'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');

/** Per-request withdraw cap for players who have never completed a cash deposit. */
const NEVER_DEPOSITED_WITHDRAW_MAX = 30;

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * True when the user has completed a real cash deposit (not bonus / courtesy).
 */
async function hasCompletedCashDeposit(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return false;

  const txOpts = options.transaction ? { transaction: options.transaction } : {};

  const depositTx = await db.UserTransaction.findOne({
    where: {
      userId: uid,
      type: 'deposit',
      amount: { [Op.gt]: 0 }
    },
    attributes: ['id'],
    ...txOpts
  });
  if (depositTx) return true;

  if (db.DepositRequest) {
    const depositRequest = await db.DepositRequest.findOne({
      where: {
        userId: uid,
        status: 'completed',
        amount: { [Op.gt]: 0 }
      },
      attributes: ['id'],
      ...txOpts
    });
    if (depositRequest) return true;
  }

  if (db.DepositOrder) {
    const order = await db.DepositOrder.findOne({
      where: {
        userId: uid,
        status: 'SUCCESS',
        requestedAmount: { [Op.gt]: 0 }
      },
      attributes: ['id'],
      ...txOpts
    });
    if (order) return true;
  }

  return false;
}

/**
 * @param {number[]} userIds
 * @returns {Promise<Set<number>>}
 */
async function findUserIdsWithCompletedCashDeposit(userIds) {
  const ids = [...new Set((userIds || []).map((id) => parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))];
  const deposited = new Set();
  if (!ids.length) return deposited;

  const txRows = await db.UserTransaction.findAll({
    where: { userId: { [Op.in]: ids }, type: 'deposit', amount: { [Op.gt]: 0 } },
    attributes: ['userId'],
    raw: true
  });
  for (const row of txRows) {
    const id = Number(row.userId ?? row.user_id);
    if (Number.isInteger(id)) deposited.add(id);
  }
  if (deposited.size === ids.length) return deposited;

  if (db.DepositRequest) {
    const reqRows = await db.DepositRequest.findAll({
      where: { userId: { [Op.in]: ids }, status: 'completed', amount: { [Op.gt]: 0 } },
      attributes: ['userId'],
      raw: true
    });
    for (const row of reqRows) {
      const id = Number(row.userId ?? row.user_id);
      if (Number.isInteger(id)) deposited.add(id);
    }
  }
  if (deposited.size === ids.length) return deposited;

  if (db.DepositOrder) {
    const orderRows = await db.DepositOrder.findAll({
      where: { userId: { [Op.in]: ids }, status: 'SUCCESS', requestedAmount: { [Op.gt]: 0 } },
      attributes: ['userId'],
      raw: true
    });
    for (const row of orderRows) {
      const id = Number(row.userId ?? row.user_id);
      if (Number.isInteger(id)) deposited.add(id);
    }
  }

  return deposited;
}

function applyNeverDepositedWithdrawCap(limits, neverDeposited) {
  const out = { ...(limits || {}), neverDeposited: Boolean(neverDeposited) };
  if (!neverDeposited) return out;
  const cap = NEVER_DEPOSITED_WITHDRAW_MAX;
  out.neverDepositedWithdrawMax = cap;
  const currentMax = Number(out.withdrawMax);
  out.withdrawMax = Math.min(Number.isFinite(currentMax) && currentMax > 0 ? currentMax : cap, cap);
  const currentMin = Number(out.withdrawMin);
  if (Number.isFinite(currentMin) && currentMin > out.withdrawMax) {
    out.withdrawMin = out.withdrawMax;
  }
  return out;
}

function neverDepositedWithdrawMaxError() {
  const err = new Error(
    `Maximum withdrawal is ${NEVER_DEPOSITED_WITHDRAW_MAX} RSC because you haven't deposited yet.`
  );
  err.statusCode = 400;
  err.code = 'NEVER_DEPOSITED_WITHDRAW_MAX';
  return err;
}

/**
 * After a never-deposited withdrawal is approved (or submitted to provider),
 * clear leftover platform wallet balances. Optionally keep frozen RSC for an
 * in-flight automated payout.
 */
async function zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return { zeroed: false };

  const neverDeposited = !(await hasCompletedCashDeposit(uid, options));
  if (!neverDeposited) return { zeroed: false };

  const keepFrozenRsc = Math.max(0, roundMoney(options.keepFrozenRsc || 0));
  const txOpts = options.transaction
    ? { transaction: options.transaction, lock: options.transaction.LOCK.UPDATE }
    : {};

  const wallets = await db.Wallet.findAll({
    where: { userId: uid },
    ...txOpts
  });

  for (const wallet of wallets) {
    const isRsc = String(wallet.currencyCode || '').toUpperCase() === REDEEMABLE_CURRENCY_CODE;
    const keepThis = isRsc ? keepFrozenRsc : 0;
    const balance = roundMoney(wallet.balance);
    const playBalance = roundMoney(wallet.playBalance);
    const frozenBalance = roundMoney(wallet.frozenBalance);
    if (balance === keepThis && playBalance === 0 && frozenBalance === keepThis) continue;

    const cleared = roundMoney(Math.max(0, balance - keepThis) + playBalance);
    const patch = {
      balance: keepThis,
      playBalance: 0,
      frozenBalance: keepThis
    };
    await wallet.update(patch, options.transaction ? { transaction: options.transaction } : undefined);

    if (cleared > 0) {
      const { recordWalletChange } = require('./scLedger.service');
      await wallet.reload(options.transaction ? { transaction: options.transaction } : undefined);
      await recordWalletChange({
        userId: uid,
        currencyCode: wallet.currencyCode,
        direction: 'DEBIT',
        amount: roundMoney(Math.max(0, balance - keepThis)),
        wallet,
        ledger: {
          eventType: 'NEVER_DEPOSITED_CLEAR',
          sourceType: 'NEVER_DEPOSITED_WITHDRAW',
          sourceId: uid,
          remarks: 'Remaining wallet cleared after never-deposited withdrawal'
        },
        transaction: options.transaction
      });
    }

    if (cleared > 0 && db.UserTransaction) {
      await db.UserTransaction.create(
        {
          userId: uid,
          type: 'admin_deduct',
          amount: cleared,
          currencyCode: wallet.currencyCode,
          description: 'Remaining wallet cleared after never-deposited withdrawal'
        },
        options.transaction ? { transaction: options.transaction } : undefined
      );
    }
  }

  return { zeroed: true };
}

module.exports = {
  NEVER_DEPOSITED_WITHDRAW_MAX,
  hasCompletedCashDeposit,
  findUserIdsWithCompletedCashDeposit,
  applyNeverDepositedWithdrawCap,
  neverDepositedWithdrawMaxError,
  zeroRemainingWalletsAfterNeverDepositedWithdraw
};
