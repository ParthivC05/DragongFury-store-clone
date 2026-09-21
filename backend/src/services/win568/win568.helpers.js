'use strict';

const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');
const { ERROR } = require('./win568.constants');
const { resolveWin568Config } = require('./win568.config');

function fieldMap(body) {
  const map = {};
  if (!body || typeof body !== 'object') return map;
  for (const key of Object.keys(body)) {
    map[String(key).toLowerCase()] = body[key];
  }
  return map;
}

function pick(body, ...names) {
  const map = fieldMap(body);
  for (const name of names) {
    const value = map[String(name).toLowerCase()];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function pickString(body, ...names) {
  const value = pick(body, ...names);
  return value == null ? '' : String(value).trim();
}

function pickNumber(body, ...names) {
  const value = pick(body, ...names);
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pickBool(body, ...names) {
  const value = pick(body, ...names);
  if (value === true || value === false) return value;
  if (value == null || value === '') return null;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return null;
}

function money(value) {
  return formatBalance(value);
}

function parseRequest(body) {
  return {
    companyKey: pickString(body, 'companyKey'),
    userName: pickString(body, 'userName', 'username', 'accountName'),
    productType: pickNumber(body, 'productType'),
    gameType: pickNumber(body, 'gameType'),
    gameId: pickNumber(body, 'gameId'),
    gpid: pickNumber(body, 'gpid'),
    amount: pickNumber(body, 'amount'),
    transferCode: pickString(body, 'transferCode'),
    transactionId: pickString(body, 'transactionId'),
    winloss: pickNumber(body, 'winloss', 'winLoss'),
    resultType: pickNumber(body, 'resultType'),
    isCancelAll: pickBool(body, 'isCancelAll'),
    currentStake: pickNumber(body, 'currentStake'),
    transferRefno: pickString(body, 'transferRefno', 'transferRefNo'),
    transferType: pickNumber(body, 'transferType'),
    extraInfo: pick(body, 'extraInfo') || null
  };
}

function toPascalKey(key) {
  const map = {
    accountName: 'AccountName',
    balance: 'Balance',
    errorCode: 'ErrorCode',
    errorMessage: 'ErrorMessage',
    betAmount: 'BetAmount',
    transferCode: 'TransferCode',
    transactionId: 'TransactionId',
    status: 'Status',
    winloss: 'WinLoss',
    stake: 'Stake',
    transferStatus: 'TransferStatus',
    amount: 'Amount'
  };
  return map[key] || (key.charAt(0).toUpperCase() + key.slice(1));
}

function shapeResponse(payload) {
  const { usePascal } = resolveWin568Config();
  const pascal = {};
  for (const [key, value] of Object.entries(payload)) {
    pascal[toPascalKey(key)] = value;
  }
  if (usePascal) return pascal;
  return { ...payload, ...pascal };
}

function okResponse(userName, balance, extra = {}) {
  return shapeResponse({
    accountName: userName || '',
    balance: money(balance),
    errorCode: 0,
    errorMessage: ERROR.NO_ERROR.errorMessage,
    ...extra
  });
}

function errorResponse(userName, error, extra = {}) {
  const balance = extra.balance != null ? extra.balance : 0;
  const rest = { ...extra };
  delete rest.balance;
  return shapeResponse({
    accountName: userName || '',
    balance: money(balance),
    errorCode: error.errorCode,
    errorMessage: error.errorMessage,
    ...rest
  });
}

function betStatusResponse(parsed, bet, error) {
  if (error) {
    return shapeResponse({
      transferCode: parsed.transferCode || '',
      transactionId: parsed.transactionId || parsed.transferCode || '',
      status: '',
      winloss: 0,
      stake: 0,
      errorCode: error.errorCode,
      errorMessage: error.errorMessage
    });
  }
  const status = String(bet.status || '').toLowerCase();
  return shapeResponse({
    transferCode: parsed.transferCode || bet.transferCode || '',
    transactionId: parsed.transactionId || bet.transactionId || '',
    errorCode: 0,
    status,
    winloss: status === 'settled' ? money(bet.winloss) : 0,
    stake: money(bet.stake),
    errorMessage: ERROR.NO_ERROR.errorMessage
  });
}

function opKey(kind, transferCode, transactionId) {
  return `win568:${kind}:${transferCode}:${transactionId || ''}`;
}

module.exports = {
  pick,
  pickString,
  pickNumber,
  parseRequest,
  money,
  okResponse,
  errorResponse,
  betStatusResponse,
  opKey
};
