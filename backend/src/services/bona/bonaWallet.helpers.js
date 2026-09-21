'use strict';

const db = require('../../db/models');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');
const {
  getPlayableBalance,
  applyBalanceDelta
} = require('../gitslotpark/callbacks/gitslotparkCallbackWallet.service');
const { resolvePlayCoin } = require('../playCoin/playCoinSession.service');

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

async function playCoinForUser(userId, gameId) {
  return resolvePlayCoin({ userId, provider: 'bona', gameId });
}

/**
 * Debit platform playable SC/RSC or GC and return the amount transferred.
 */
async function debitPlayableToBona(userId, amount, meta, transaction) {
  const need = formatBalance(amount);
  if (need <= 0) {
    const err = new Error('Transfer amount must be greater than zero');
    err.statusCode = 400;
    throw err;
  }

  const coinType = await playCoinForUser(userId, meta?.metadata?.gameId);
  const playable = await getPlayableBalance(userId, transaction, coinType);
  if (playable + 0.0001 < need) {
    const err = new Error(
      coinType === 'GC'
        ? 'Insufficient Gold Coin balance to launch this game'
        : 'Insufficient SC balance to launch this game'
    );
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
    transaction,
    { coinType }
  );

  return { amount: need, balanceAfter };
}

/**
 * Credit platform wallet after withdrawing from Bona (wins → RSC per slots rules).
 */
async function creditPlayableFromBona(userId, amount, meta, transaction) {
  const credit = formatBalance(amount);
  const coinType = await playCoinForUser(userId, meta?.metadata?.gameId);
  if (credit <= 0) {
    return getPlayableBalance(userId, transaction, coinType);
  }

  return applyBalanceDelta(
    userId,
    credit,
    {
      type: 'bona_transfer_in',
      description: meta?.description || 'Bona Games wallet withdraw',
      metadata: meta?.metadata || {}
    },
    transaction,
    { coinType }
  );
}

module.exports = {
  platformTxId,
  recordSlotsTransaction,
  debitPlayableToBona,
  creditPlayableFromBona,
  getPlayableBalance
};
