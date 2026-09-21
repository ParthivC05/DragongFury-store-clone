'use strict';

const { RESULT } = require('../../gitslotpark/callbacks/gitslotparkCallback.helpers');
const { formatBalance } = require('../../gitslotpark/gitslotparkSign.helpers');
const {
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta
} = require('../../gitslotpark/callbacks/gitslotparkCallbackWallet.service');
const { HUB_CURRENCY, SUPPORTED_HUB_CURRENCIES } = require('../onegamehub.constants');
const { coinFromHubCurrency } = require('../../../lib/normalizePlayCoinType');

function centsToSc(amount) {
  return formatBalance(Number(amount || 0) / 100);
}

function scToCents(balance) {
  return Math.round((Number(balance) || 0) * 100);
}

function isUnsupportedCurrency(currency) {
  return !SUPPORTED_HUB_CURRENCIES.has(String(currency || '').toUpperCase());
}

function playCoinFromSession(session) {
  return coinFromHubCurrency(session?.currency);
}

/** Orionstars parity: GOC session must only debit/credit GC, SSC only SC. */
function isCurrencyMismatch(session, currency) {
  if (isUnsupportedCurrency(currency)) return true;
  return playCoinFromSession(session) !== coinFromHubCurrency(currency);
}

async function getSessionPlayableBalance(userId, session, transaction) {
  return getPlayableBalance(userId, transaction, playCoinFromSession(session));
}

async function applySessionBalanceDelta(userId, delta, meta, transaction, session, extra = {}) {
  return applyBalanceDelta(userId, delta, meta, transaction, {
    ...extra,
    coinType: playCoinFromSession(session)
  });
}

async function applySessionRollbackDelta(userId, originalTransactionId, reverseDelta, meta, transaction, session) {
  return applyRollbackDelta(userId, originalTransactionId, reverseDelta, meta, transaction, {
    coinType: playCoinFromSession(session)
  });
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
  isCurrencyMismatch,
  isInsufficientFundsError,
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta,
  getSessionPlayableBalance,
  applySessionBalanceDelta,
  applySessionRollbackDelta,
  playCoinFromSession,
  success
};
