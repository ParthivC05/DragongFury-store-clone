'use strict';

const db = require('../../db/models');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');
const {
  getPlayableBalance,
  applyBalanceDelta
} = require('../gitslotpark/callbacks/gitslotparkCallbackWallet.service');

function platformTxId() {
  return `bona_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function recordSlotsTransaction(row, transaction) {
  if (!db.GitslotparkTransaction) return null;
  return db.GitslotparkTransaction.create(
    {
      provider: 'bona',
      ...row,
      platformTransactionId: row.platformTransactionId || platformTxId(),
      status: row.status || 'completed'
    },
    { transaction }
  );
}

/**
 * Debit platform playable SC/RSC and return the amount transferred.
 */
async function debitPlayableToBona(userId, amount, meta, transaction) {
  const need = formatBalance(amount);
  if (need <= 0) {
    const err = new Error('Transfer amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  const playable = await getPlayableBalance(userId, transaction);
  if (playable + 0.0001 < need) {
    const err = new Error('Insufficient SC balance to launch this game');
    err.statusCode = 400;
    err.code = 'INSUFFICIENT_FUNDS';
    throw err;
  }

  const balanceAfter = await applyBalanceDelta(
    userId,
    -need,
    {
      type: 'bona_transfer_out',
      description: meta?.description || 'Bona Games wallet deposit',
      metadata: meta?.metadata || {}
    },
    transaction
  );

  return { amount: need, balanceAfter };
}

/**
 * Credit platform wallet after withdrawing from Bona (wins → RSC per slots rules).
 */
async function creditPlayableFromBona(userId, amount, meta, transaction) {
  const credit = formatBalance(amount);
  if (credit <= 0) {
    return getPlayableBalance(userId, transaction);
  }

  return applyBalanceDelta(
    userId,
    credit,
    {
      type: 'bona_transfer_in',
      description: meta?.description || 'Bona Games wallet withdraw',
      metadata: meta?.metadata || {}
    },
    transaction
  );
}

module.exports = {
  platformTxId,
  recordSlotsTransaction,
  debitPlayableToBona,
  creditPlayableFromBona,
  getPlayableBalance
};
