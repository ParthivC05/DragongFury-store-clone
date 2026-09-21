'use strict';

const {
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta
} = require('../gitslotpark/callbacks/gitslotparkCallbackWallet.service');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');
const { resolvePlayCoin } = require('../playCoin/playCoinSession.service');

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
  const coinType = await resolvePlayCoin({ userId, provider: 'scorpio' });
  return money(await getPlayableBalance(userId, transaction, coinType));
}

async function applyScorpioDebit(userId, amount, key, extra, transaction) {
  const debit = money(amount);
  const playable = await getScorpioBalance(userId, transaction);
  if (playable + 0.0001 < debit) {
    const err = new Error('Insufficient funds');
    err.code = 'ERR_NOT_ENOUGH_MONEY';
    throw err;
  }
  const coinType = await resolvePlayCoin({ userId, provider: 'scorpio' });
  return applyBalanceDelta(
    userId,
    -debit,
    walletMeta('bet', key, extra),
    transaction,
    { betAmount: debit, coinType }
  );
}

async function applyScorpioCredit(userId, amount, key, extra, transaction) {
  const credit = money(amount);
  const coinType = await resolvePlayCoin({ userId, provider: 'scorpio' });
  if (Math.abs(credit) < 0.0001) {
    return getScorpioBalance(userId, transaction);
  }
  return applyBalanceDelta(
    userId,
    credit,
    walletMeta(extra?.kind || 'win', key, extra),
    transaction,
    { winAmount: credit, coinType }
  );
}

async function applyScorpioRollback(userId, originalTransactionId, reverseDelta, key, extra, transaction) {
  const coinType = await resolvePlayCoin({ userId, provider: 'scorpio' });
  return applyRollbackDelta(
    userId,
    originalTransactionId,
    money(reverseDelta),
    walletMeta('cancel', key, extra),
    transaction,
    { coinType }
  );
}

module.exports = {
  money,
  getScorpioBalance,
  applyScorpioDebit,
  applyScorpioCredit,
  applyScorpioRollback
};
