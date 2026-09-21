'use strict';

const client = require('./client');
const { loginUser } = require('./login.service');
const { isPaymentConfigured } = require('../payment.config');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');

const DEPOSIT_RETURN_PATH = '/deposit';
const DEFAULT_ACCEPTED_PAYMENT_OPTIONS = ['card'];
const PAYMENT_OPTION_MAP = {
  card: 'card',
  cashapp: 'cashapp',
  'apple pay': 'apple_pay',
  apple_pay: 'apple_pay',
  'google pay': 'google_pay',
  google_pay: 'google_pay'
};

function getDefaultRedirectTo() {
  const raw = process.env.FRONTEND_URL;
  if (!raw || typeof raw !== 'string') return null;
  const first = raw.split(',')[0].trim().replace(/\/+$/, '');
  return first ? `${first}${DEPOSIT_RETURN_PATH}` : null;
}

function normalizeAcceptedPaymentOptions(input) {
  const selectedOptions = Array.isArray(input) ? input : [input];
  const mapped = selectedOptions
    .map((option) => {
      if (typeof option !== 'string') return null;
      const normalized = option.trim().toLowerCase();
      return PAYMENT_OPTION_MAP[normalized] ?? null;
    })
    .filter(Boolean);

  return mapped.length > 0 ? [...new Set(mapped)] : DEFAULT_ACCEPTED_PAYMENT_OPTIONS;
}

function resolveAcceptedPaymentInput(params) {
  if (Array.isArray(params?.acceptedPaymentOptions) && params.acceptedPaymentOptions.length > 0) {
    return params.acceptedPaymentOptions;
  }

  if (typeof params?.acceptedPaymentOptions === 'string' && params.acceptedPaymentOptions.trim()) {
    return params.acceptedPaymentOptions;
  }

  if (typeof params?.paymentType === 'string' && params.paymentType.trim()) {
    return params.paymentType;
  }

  if (typeof params?.paymentMethod === 'string' && params.paymentMethod.trim()) {
    return params.paymentMethod;
  }

  return undefined;
}

async function createPayinLink(userAuthToken, params) {
  if (!isPaymentConfigured()) {
    const err = new Error('Payment API is not configured (PAYMENT_API_BASE_URL)');
    err.statusCode = 503;
    throw err;
  }

  if (!userAuthToken || typeof userAuthToken !== 'string') {
    paymentErrorLog('createPayinLink: missing or invalid user auth token');
    const err = new Error('Payment user token is required to create deposit link');
    err.statusCode = 400;
    throw err;
  }

  const amount = params?.amount != null ? Number(params.amount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Valid amount is required');
    err.statusCode = 400;
    throw err;
  }

  const acceptedPaymentOptions = normalizeAcceptedPaymentOptions(resolveAcceptedPaymentInput(params));

  const redirectTo = params?.redirectTo && typeof params.redirectTo === 'string'
    ? params.redirectTo.trim()
    : getDefaultRedirectTo();

  const body = {
    amount,
    currency: params?.currency && typeof params.currency === 'string' ? params.currency.trim() : 'USD',
    name: params?.name && typeof params.name === 'string' ? params.name.trim().slice(0, 256) : 'Deposit',
    expiredAt: params?.expiredAt ?? null,
    customUrlPath: params?.customUrlPath ?? null,
    redirectTo,
    acceptedPaymentOptions
  };

  console.log('redirectTo', redirectTo);

  console.log('body', body);
  paymentLog('--- createPayinLink: calling Payment API payin/v2 ---');
  paymentLog('request body:', body);

  const data = await client.request('POST', '/payments/payin', {
    authToken: userAuthToken,
    body
  });

  paymentLog('createPayinLink: response received');
  return data;
}

async function createPayinLinkWithAuthRetry(userAuthToken, params, retryWithLogin) {
  try {
    return await createPayinLink(userAuthToken, params);
  } catch (err) {
    if (err.statusCode === 401 && retryWithLogin?.email && retryWithLogin?.password) {
      paymentLog('createPayinLink: 401, re-login and retry');
      const fresh = await loginUser(
        retryWithLogin.email,
        retryWithLogin.password,
        retryWithLogin.partnerCode
      );
      return createPayinLink(fresh.token, params);
    }
    throw err;
  }
}

module.exports = {
  createPayinLink,
  createPayinLinkWithAuthRetry
};
