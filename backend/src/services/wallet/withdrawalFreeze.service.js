'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');

const HOLD_STATUSES = ['pending', 'processing'];

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Frozen SC held by other pending/processing withdrawals for this user.
 * Pass excludeChimeId / excludeLegacyId for the request being settled.
 */
async function reservedFrozenByOtherWithdrawals(userId, options = {}) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid) || uid < 1) return 0;

  const { excludeChimeId = null, excludeLegacyId = null, transaction } = options;
  const tx = transaction ? { transaction } : {};
  let total = 0;

  if (db.ChimeCashappWithdrawalRequest) {
    const where = { userId: uid, status: { [Op.in]: HOLD_STATUSES } };
    if (excludeChimeId != null) where.id = { [Op.ne]: excludeChimeId };
    total += Number(await db.ChimeCashappWithdrawalRequest.sum('amount', { where, ...tx })) || 0;
  }

  if (db.WithdrawalRequest) {
    const where = { userId: uid, status: { [Op.in]: HOLD_STATUSES } };
    if (excludeLegacyId != null) where.id = { [Op.ne]: excludeLegacyId };
    total += Number(await db.WithdrawalRequest.sum('amount', { where, ...tx })) || 0;
  }

  return roundMoney(total);
}

/** Frozen that still belongs to this request (never other requests' holds). */
function thisRequestFrozenSlice(wallet, amount, othersReserved) {
  const frozen = roundMoney(wallet?.frozenBalance);
  const others = Math.max(0, roundMoney(othersReserved));
  const owned = Math.max(0, roundMoney(frozen - others));
  return Math.min(Math.max(0, roundMoney(amount)), owned);
}

/**
 * Reject / provider fail: unfreeze only this request. Does not add SC.
 * Frozen never drops below other pending/processing holds.
 */
async function releaseThisWithdrawalFreeze(wallet, { amount, othersReserved, transaction } = {}) {
  if (!wallet) return { released: 0, newFrozen: 0 };
  const frozen = roundMoney(wallet.frozenBalance);
  const others = Math.max(0, roundMoney(othersReserved));
  const release = thisRequestFrozenSlice(wallet, amount, others);
  const newFrozen = Math.max(others, roundMoney(frozen - release));
  if (newFrozen !== frozen) {
    await wallet.update({ frozenBalance: newFrozen }, transaction ? { transaction } : undefined);
  }
  return { released: release, newFrozen };
}

/**
 * Provider paid: take only this request's freeze (then unreserved SC).
 * Never steal another request's hold. Never debit twice if this freeze was already cleared.
 */
async function captureThisWithdrawalFreeze(wallet, { amount, othersReserved, transaction } = {}) {
  if (!wallet) {
    const err = new Error('User wallet not found.');
    err.statusCode = 404;
    throw err;
  }

  const amt = Math.max(0, roundMoney(amount));
  const others = Math.max(0, roundMoney(othersReserved));
  const balance = roundMoney(wallet.balance);
  const playBalance = roundMoney(wallet.playBalance);
  const frozen = roundMoney(wallet.frozenBalance);
  const thisSlice = thisRequestFrozenSlice(wallet, amt, others);
  const unreserved = Math.max(0, roundMoney(balance - frozen));

  const debit = Math.min(amt, roundMoney(thisSlice + unreserved));
  const newBalance = Math.max(0, roundMoney(balance - debit));
  let newFrozen = Math.max(others, roundMoney(frozen - thisSlice));
  newFrozen = Math.max(0, Math.min(newFrozen, newBalance));
  const newPlay = Math.min(playBalance, Math.max(0, roundMoney(newBalance - newFrozen)));

  await wallet.update(
    { balance: newBalance, frozenBalance: newFrozen, playBalance: newPlay },
    transaction ? { transaction } : undefined
  );

  return { debit, newBalance, newFrozen, thisSlice };
}

module.exports = {
  roundMoney,
  reservedFrozenByOtherWithdrawals,
  thisRequestFrozenSlice,
  releaseThisWithdrawalFreeze,
  captureThisWithdrawalFreeze
};
