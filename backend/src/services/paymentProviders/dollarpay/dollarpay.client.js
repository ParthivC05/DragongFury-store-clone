'use strict';

const { signParams } = require('./dollarpay.sign');
const { sanitizeDollarpayClientMessage } = require('./dollarpay.amounts');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');

const DEFAULT_BASE = 'https://mh.dollarpaywallet.com';
const IS_PAY = { cashapp: '1', apple_pay: '2', google_pay: '3', card: '4', credit_card: '4' };
const PAYOUT_PATH = {
  cashapp: '/api/pay/pay',
  chime: '/api/pay/chimepay',
  paypal: '/api/pay/palpalpay'
};

function baseUrl() {
  return (process.env.DOLLARPAY_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
}

function formatAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}

async function postForm(path, params, apiKey) {
  const bodyParams = { ...params, sign: signParams(params, apiKey) };
  const body = new URLSearchParams();
  Object.entries(bodyParams).forEach(([k, v]) => {
    if (v != null) body.append(k, String(v));
  });

  console.log('[DollarPayWallet] REQUEST', {
    url: `${baseUrl()}${path}`,
    path,
    body: {
      ...bodyParams,
      sign: bodyParams.sign ? `${String(bodyParams.sign).slice(0, 8)}…` : undefined
    }
  });
  paymentLog('DollarPay request', {
    path,
    merchant_id: params.merchant_id,
    order_sn: params.order_sn || params.outer_order_sn
  });

  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
  } catch (err) {
    console.log('[DollarPayWallet] NETWORK ERROR', { path, message: err.message });
    paymentErrorLog('DollarPay network error', path, err.message);
    const e = new Error('DollarPay request failed. Please try again.');
    e.statusCode = 502;
    throw e;
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log('[DollarPayWallet] INVALID RESPONSE', {
      path,
      httpStatus: res.status,
      raw: text?.slice?.(0, 500)
    });
    paymentErrorLog('DollarPay bad response', path, text?.slice?.(0, 200));
    const e = new Error('DollarPay returned an invalid response.');
    e.statusCode = 502;
    throw e;
  }

  console.log('[DollarPayWallet] RESPONSE', {
    path,
    httpStatus: res.status,
    body: data
  });

  return data;
}

function assertOk(data, fallback, { sanitize = true } = {}) {
  if (String(data?.status) === '00000') return data;
  console.log('[DollarPayWallet] API ERROR', { status: data?.status, msg: data?.msg || data?.message, body: data });
  const rawMsg = (data?.msg || data?.message || fallback || 'DollarPay failed').toString();
  const err = new Error(sanitize ? sanitizeDollarpayClientMessage(rawMsg) : rawMsg);
  err.statusCode = 400;
  err.dollarpayStatus = data?.status;
  err.rawMessage = rawMsg;
  err.raw = data;
  throw err;
}

async function createPayin({ merchantId, apiKey, orderSn, amount, paymentType, notifyUrl, userName, ip, deviceId }) {
  const isPay = IS_PAY[(paymentType || '').toLowerCase()];
  if (!isPay) {
    const err = new Error('DollarPay deposit supports card, cashapp, apple_pay, or google_pay.');
    err.statusCode = 400;
    throw err;
  }
  const amountStr = formatAmount(amount);
  if (!amountStr) {
    const err = new Error('Invalid deposit amount.');
    err.statusCode = 400;
    throw err;
  }
  const data = await postForm(
    '/api/payment/pay',
    {
      merchant_id: String(merchantId),
      order_sn: String(orderSn),
      user_name: String(userName || 'user').slice(0, 64),
      is_cash: '1',
      is_pay: isPay,
      amount: amountStr,
      notify_url: String(notifyUrl),
      ip: String(ip || '127.0.0.1').slice(0, 64),
      device_id: String(deviceId || 'web').slice(0, 128)
    },
    apiKey
  );
  return assertOk(data, 'DollarPay payin failed.');
}

/** Payin query: POST /api/payment/query — merchant_id + outer_order_sn */
async function queryPayin({ merchantId, apiKey, outerOrderSn }) {
  const data = await postForm(
    '/api/payment/query',
    {
      merchant_id: String(merchantId),
      outer_order_sn: String(outerOrderSn)
    },
    apiKey
  );
  return assertOk(data, 'DollarPay payin query failed.');
}

async function createPayout({ merchantId, apiKey, orderSn, amount, payoutType, accountNo, notifyUrl }) {
  const path = PAYOUT_PATH[(payoutType || '').toLowerCase()];
  if (!path) {
    const err = new Error('DollarPay payout supports cashapp, chime, or paypal.');
    err.statusCode = 400;
    throw err;
  }
  const amountStr = formatAmount(amount);
  if (!amountStr) {
    const err = new Error('Invalid payout amount.');
    err.statusCode = 400;
    throw err;
  }
  const data = await postForm(
    path,
    {
      merchant_id: String(merchantId),
      order_sn: String(orderSn),
      account_no: String(accountNo).trim(),
      amount: amountStr,
      notify_url: String(notifyUrl)
    },
    apiKey
  );
  return assertOk(data, 'DollarPay payout failed.', { sanitize: false });
}

/** Payout query: POST /api/pay/query — merchant_id + outer_order_sn */
async function queryPayout({ merchantId, apiKey, outerOrderSn }) {
  const data = await postForm(
    '/api/pay/query',
    {
      merchant_id: String(merchantId),
      outer_order_sn: String(outerOrderSn)
    },
    apiKey
  );
  return assertOk(data, 'DollarPay payout query failed.', { sanitize: false });
}

module.exports = { createPayin, queryPayin, createPayout, queryPayout, IS_PAY, PAYOUT_PATH, formatAmount };
