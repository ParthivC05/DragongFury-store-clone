'use strict';

const {
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta
} = require('../gitslotpark/callbacks/gitslotparkCallbackWallet.service');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');

function money(value) {
  return formatBalance(value);
}

function walletMeta(kind, key, extra) {
  return {
    type: `scorpio_${kind}`,
    description: `Scorpio Play ${kind}`,
    metadata: {
      provider: 'scorpio',
      transactionId: key,
      ...(extra || {})
    }
  };
}

async function getScorpioBalance(userId, transaction) {
  return money(await getPlayableBalance(userId, transaction));
}

async function applyScorpioDebit(userId, amount, key, extra, transaction) {
  const debit = money(amount);
  const playable = await getScorpioBalance(userId, transaction);
  if (playable + 0.0001 < debit) {
    const err = new Error('Insufficient funds');
    err.code = 'ERR_NOT_ENOUGH_MONEY';
    throw err;
  }
  return applyBalanceDelta(
    userId,
    -debit,
    walletMeta('bet', key, extra),
    transaction,
    { betAmount: debit }
  );
}

async function applyScorpioCredit(userId, amount, key, extra, transaction) {
  const credit = money(amount);
  if (Math.abs(credit) < 0.0001) {
    return getScorpioBalance(userId, transaction);
  }
  return applyBalanceDelta(
    userId,
    credit,
    walletMeta(extra?.kind || 'win', key, extra),
    transaction,
    { winAmount: credit }
  );
}

async function applyScorpioRollback(userId, originalTransactionId, reverseDelta, key, extra, transaction) {
  return applyRollbackDelta(
    userId,
    originalTransactionId,
    money(reverseDelta),
    walletMeta('cancel', key, extra),
    transaction
  );
}

module.exports = {
  money,
  getScorpioBalance,
  applyScorpioDebit,
  applyScorpioCredit,
  applyScorpioRollback
};
