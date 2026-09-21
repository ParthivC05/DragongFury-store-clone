'use strict';

const { signParams, verifySign } = require('./xxpay.sign');
const {
  DEPOSIT_WAY_CODE,
  PAYOUT_WAY_CODE,
  dollarsToCents,
  buildDepositWayParam,
  buildPayoutWayParam
} = require('./xxpay.wayCodes');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');

function resolveBaseUrl(override) {
  const fromEnv = (process.env.XXPAY_BASE_URL || '').toString().trim().replace(/\/+$/, '');
  const fromOverride = (override || '').toString().trim().replace(/\/+$/, '');
  return fromOverride || fromEnv || '';
}

async function postJson(path, params, { apiKey, baseUrl } = {}) {
  const root = resolveBaseUrl(baseUrl);
  if (!root) {
    const err = new Error(
      'XXPay base URL missing. Set VITE_XXPAY_BASE_URL on the store frontend or XXPAY_BASE_URL on the backend.'
    );
    err.statusCode = 503;
    throw err;
  }

  const signed = signParams({ ...params, signType: params.signType || 'MD5' }, apiKey, params.signType || 'MD5');
  const url = `${root}${path.startsWith('/') ? path : `/${path}`}`;

  paymentLog('XXPay request', {
    path,
    mchNo: params.mchNo,
    mchOrderNo: params.mchOrderNo
  });
  console.log('[XXPay] REQUEST', {
    url,
    body: { ...signed, sign: signed.sign ? `${String(signed.sign).slice(0, 8)}…` : undefined }
  });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed)
    });
  } catch (err) {
    paymentErrorLog('XXPay network error', path, err.message);
    const e = new Error('XXPay request failed. Please try again.');
    e.statusCode = 502;
    throw e;
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    paymentErrorLog('XXPay bad response', path, text?.slice?.(0, 200));
    const e = new Error('XXPay returned an invalid response.');
    e.statusCode = 502;
    throw e;
  }

  console.log('[XXPay] RESPONSE', { path, httpStatus: res.status, body: data });
  paymentLog('XXPay response', {
    path,
    httpStatus: res.status,
    code: data?.code,
    msg: data?.msg || data?.message || null,
    mchOrderNo: params.mchOrderNo,
    payOrderNo: data?.data?.payOrderNo || null,
    transferOrderNo: data?.data?.transferOrderNo || null,
    hasCashierUrl: Boolean(data?.data?.cashierUrl || data?.data?.payUrl)
  });
  return data;
}

function assertOk(data, fallback) {
  if (Number(data?.code) === 0) return data;
  const rawMsg = (data?.msg || data?.message || fallback || 'XXPay failed').toString();
  const err = new Error(rawMsg);
  err.statusCode = 400;
  err.xxpayCode = data?.code;
  err.raw = data;
  throw err;
}

async function createPayin({
  mchNo,
  apiKey,
  baseUrl,
  mchOrderNo,
  amount,
  paymentType,
  currency = 'usd',
  notifyUrl,
  returnUrl,
  clientIp,
  clientId,
  deviceId,
  extParam,
  expiredTime = 7200
}) {
  const wayCode = DEPOSIT_WAY_CODE[(paymentType || '').toLowerCase()];
  if (!wayCode) {
    const err = new Error('XXPay deposit does not support this payment method.');
    err.statusCode = 400;
    throw err;
  }
  const cents = dollarsToCents(amount);
  if (cents == null) {
    const err = new Error('Invalid deposit amount.');
    err.statusCode = 400;
    throw err;
  }
  const wayParam = buildDepositWayParam(paymentType, { clientId, deviceId });
  const data = await postJson(
    '/api/pay/create',
    {
      mchNo: String(mchNo),
      mchOrderNo: String(mchOrderNo).slice(0, 100),
      amount: cents,
      currency: String(currency || 'usd').toLowerCase(),
      wayCode,
      clientIp: clientIp ? String(clientIp).slice(0, 32) : undefined,
      notifyUrl: notifyUrl || undefined,
      returnUrl: returnUrl || undefined,
      expiredTime,
      extParam: extParam != null ? String(extParam).slice(0, 2000) : undefined,
      wayParam,
      timestamp: Date.now(),
      signType: 'MD5'
    },
    { apiKey, baseUrl }
  );
  return assertOk(data, 'XXPay pay-in failed.');
}

async function queryPayin({ mchNo, apiKey, baseUrl, mchOrderNo, payOrderNo }) {
  const params = {
    mchNo: String(mchNo),
    timestamp: Date.now(),
    signType: 'MD5'
  };
  if (mchOrderNo) params.mchOrderNo = String(mchOrderNo);
  if (payOrderNo) params.payOrderNo = String(payOrderNo);
  const data = await postJson('/api/pay/query', params, { apiKey, baseUrl });
  return assertOk(data, 'XXPay pay-in query failed.');
}

async function createTransfer({
  mchNo,
  apiKey,
  baseUrl,
  mchOrderNo,
  amount,
  payoutType,
  destinationUsername,
  destinationMeta,
  currency = 'usd',
  notifyUrl,
  clientIp,
  reason,
  extParam,
  expiredTime = 7200
}) {
  const wayCode = PAYOUT_WAY_CODE[(payoutType || '').toLowerCase()];
  if (!wayCode) {
    const err = new Error('XXPay payout does not support this method.');
    err.statusCode = 400;
    throw err;
  }
  const cents = dollarsToCents(amount);
  if (cents == null) {
    const err = new Error('Invalid payout amount.');
    err.statusCode = 400;
    throw err;
  }
  const wayParam = buildPayoutWayParam(payoutType, destinationUsername, destinationMeta);
  if (!wayParam) {
    const err = new Error('Invalid payout destination for XXPay.');
    err.statusCode = 400;
    throw err;
  }
  if (wayCode === 'card' && (!wayParam.cardNumber || !wayParam.cardValid)) {
    const err = new Error('Card number and expiry (MM/YYYY) are required for card payout.');
    err.statusCode = 400;
    throw err;
  }
  if (wayCode === 'ach' && (!wayParam.accountNumber || !wayParam.routingNumber)) {
    const err = new Error('Account number and routing number are required for ACH payout.');
    err.statusCode = 400;
    throw err;
  }

  const data = await postJson(
    '/api/transfer/create',
    {
      mchNo: String(mchNo),
      mchOrderNo: String(mchOrderNo).slice(0, 100),
      amount: cents,
      currency: String(currency || 'usd').toLowerCase(),
      wayCode,
      clientIp: clientIp ? String(clientIp).slice(0, 32) : undefined,
      notifyUrl: notifyUrl || undefined,
      reason: reason || undefined,
      expiredTime,
      extParam: extParam != null ? String(extParam).slice(0, 2000) : undefined,
      wayParam,
      timestamp: Date.now(),
      signType: 'MD5'
    },
    { apiKey, baseUrl }
  );
  return assertOk(data, 'XXPay payout failed.');
}

async function queryTransfer({ mchNo, apiKey, baseUrl, mchOrderNo, transferOrderNo }) {
  const params = {
    mchNo: String(mchNo),
    timestamp: Date.now(),
    signType: 'MD5'
  };
  if (mchOrderNo) params.mchOrderNo = String(mchOrderNo);
  if (transferOrderNo) params.transferOrderNo = String(transferOrderNo);
  const data = await postJson('/api/transfer/query', params, { apiKey, baseUrl });
  return assertOk(data, 'XXPay transfer query failed.');
}

module.exports = {
  createPayin,
  queryPayin,
  createTransfer,
  queryTransfer,
  verifySign,
  DEPOSIT_WAY_CODE,
  PAYOUT_WAY_CODE,
  dollarsToCents
};
