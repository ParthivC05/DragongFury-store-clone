'use strict';

const client = require('./client');
const { resolvePaymentPartnerCode, isPaymentConfigured } = require('../payment.config');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');

function getCentryosUserIdFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
    if (payload.userId != null) return Number(payload.userId);
    if (payload.user_id != null) return Number(payload.user_id);
    return null;
  } catch {
    return null;
  }
}

async function loginUser(email, password, explicitPartnerCode) {
  if (!isPaymentConfigured()) {
    const err = new Error('Payment API is not configured (PAYMENT_API_BASE_URL)');
    err.statusCode = 503;
    throw err;
  }

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    paymentErrorLog('loginUser: email and password required');
    const err = new Error('Email and password are required for Payment API login');
    err.statusCode = 400;
    throw err;
  }

  const body = {
    email: email.trim(),
    password,
    partnerCode: resolvePaymentPartnerCode(explicitPartnerCode)
  };

  paymentLog('--- loginUser: calling Payment API login ---');
  paymentLog('request body (password hidden):', { ...body, password: '***' });

  const data = await client.request('POST', '/auth/login/direct', { body });
  const token = data?.token;

  if (!token) {
    paymentErrorLog('loginUser: no token in response', data);
    const err = new Error('Payment API did not return a token');
    err.statusCode = 502;
    throw err;
  }

  paymentLog('loginUser: response received, token:', '(present)');
  const user = data?.user && typeof data.user === 'object' ? data.user : undefined;
  return { token, ...(user && { user }) };
}

module.exports = {
  loginUser,
  getCentryosUserIdFromToken
};
