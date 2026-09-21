'use strict';

const paymentClient = require('./paymentClient');
const { getPaymentConfig, resolvePaymentPartnerCode, isPaymentConfigured } = require('./payment.config');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');
const logger = require('../../libs/logger').logger;

/**
 * Create a verified user account on the Payment API (CentryOS) without OTP.
 * POST /auth/signup/direct — direct signup, email treated as verified.
 *
 * @param {object} params - firstName, lastName, email, password, partnerCode?
 * @returns {Promise<{ token: string }>}
 */
async function signupUserDirect(params) {
  if (!isPaymentConfigured()) {
    paymentErrorLog('signupUserDirect: Payment API not configured');
    const err = new Error('Payment API is not configured (PAYMENT_API_BASE_URL)');
    err.statusCode = 503;
    throw err;
  }
  const { firstName, lastName, email, password, partnerCode: partnerCodeParam } = params || {};
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    paymentErrorLog('signupUserDirect: email and password required');
    const err = new Error('Email and password are required for Payment API signup');
    err.statusCode = 400;
    throw err;
  }
  const { baseUrl } = getPaymentConfig();
  const partnerCode = resolvePaymentPartnerCode(partnerCodeParam);
  const path = '/auth/signup/direct';
  const body = {
    firstName: (firstName && String(firstName).trim()) || '',
    lastName: (lastName && String(lastName).trim()) || '',
    email: email.trim().toLowerCase(),
    password,
    partnerCode
  };
  paymentLog('--- signupUserDirect: calling Payment API', path, '---');
  paymentLog('signupUserDirect: full URL=', (baseUrl || '').replace(/\/+$/, '') + path);
  paymentLog('signupUserDirect: request body (password hidden):', { ...body, password: '***' });
  logger.info('[signupUserDirect] Calling Payment API', { path, email: body.email });
  let data;
  try {
    data = await paymentClient.request('POST', path, { body });
  } catch (err) {
    logger.warn('[signupUserDirect] Payment API request failed', {
      path,
      statusCode: err.statusCode,
      message: err.message,
      responseMessage: err.response?.message || err.response?.error
    });
    throw err;
  }
  paymentLog('signupUserDirect: response received, token:', data?.token ? '(present)' : '(missing)');
  const token = data?.token;
  if (!token) {
    paymentErrorLog('signupUserDirect: no token in response', data);
    const err = new Error('Payment API did not return a token');
    err.statusCode = 502;
    throw err;
  }
  return { token };
}

module.exports = { signupUserDirect };
