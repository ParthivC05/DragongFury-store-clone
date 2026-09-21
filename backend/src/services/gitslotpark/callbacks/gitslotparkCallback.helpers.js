'use strict';

const RESULT = {
  SUCCESS: 0,
  GENERAL: 1,
  INVALID_PARAMS: 2,
  INVALID_SIGN: 3,
  INVALID_AGENT: 4,
  USER_NOT_FOUND: 5,
  INSUFFICIENT_FUNDS: 6,
  REF_NOT_FOUND: 8,
  ALREADY_ROLLED_BACK: 9,
  DUPLICATE: 11
};

function pickString(body, ...keys) {
  if (!body || typeof body !== 'object') return '';
  for (const key of keys) {
    const value = body[key];
    if (value != null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function pickInt(body, ...keys) {
  const raw = pickString(body, ...keys);
  if (!raw) return null;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) ? num : null;
}

function pickAmount(body, ...keys) {
  const raw = pickString(body, ...keys);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function successPayload(payload = {}) {
  return { code: RESULT.SUCCESS, message: '', ...payload };
}

function errorPayload(code, message, extra = {}) {
  return { code, message: message || '', ...extra };
}

function parseCallbackBody(body) {
  return {
    agentID: pickString(body, 'agentID', 'agentId'),
    sign: pickString(body, 'sign'),
    userID: pickString(body, 'userID', 'userid', 'userId'),
    gameID: pickInt(body, 'gameID', 'gameid', 'gameId'),
    betAmount: pickAmount(body, 'betAmount', 'betamount'),
    winAmount: pickAmount(body, 'winAmount', 'winamount'),
    amount: pickAmount(body, 'amount'),
    transactionID: pickString(body, 'transactionID', 'transactionId', 'transactionid'),
    refTransactionID: pickString(body, 'refTransactionID', 'refTransactionId', 'reftransactionid'),
    roundID: pickString(body, 'roundID', 'roundId', 'roundid')
  };
}

module.exports = {
  RESULT,
  pickString,
  pickInt,
  pickAmount,
  successPayload,
  errorPayload,
  parseCallbackBody
};
