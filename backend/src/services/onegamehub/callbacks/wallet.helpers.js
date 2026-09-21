'use strict';

const { RESULT } = require('../../gitslotpark/callbacks/gitslotparkCallback.helpers');
const { formatBalance } = require('../../gitslotpark/gitslotparkSign.helpers');
const {
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta
} = require('../../gitslotpark/callbacks/gitslotparkCallbackWallet.service');
const { HUB_CURRENCY } = require('../onegamehub.constants');

function centsToSc(amount) {
  return formatBalance(Number(amount || 0) / 100);
}

function scToCents(balance) {
  return Math.round((Number(balance) || 0) * 100);
}

function isUnsupportedCurrency(currency) {
  return String(currency || '').toUpperCase() !== HUB_CURRENCY;
}

function isInsufficientFundsError(err) {
  return err?.code === RESULT.INSUFFICIENT_FUNDS
    || String(err?.message || '').toLowerCase().includes('insufficient');
}

function success(balanceSc, currency = HUB_CURRENCY) {
  return {
    status: 200,
    balance: scToCents(balanceSc),
    currency
  };
}

module.exports = {
  centsToSc,
  scToCents,
  isUnsupportedCurrency,
  isInsufficientFundsError,
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta,
  success
};
