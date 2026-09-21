'use strict';

const paymentClient = require('./paymentClient');
const { resolvePaymentPartnerCode, isPaymentConfigured } = require('./payment.config');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

/**
 * Create a user account on the Payment API (CentryOS).
 * POST /auth/signup — same as Postman "Signup". Returns token so user is logged in.
 *
 * @param {object} params - firstName, lastName, email, password, partnerCode?
 * @returns {Promise<{ token: string }>}
 */
async function signupUser(params) {
  if (!isPaymentConfigured()) {
    paymentErrorLog('signupUser: Payment API not configured');
    const err = new Error('Payment API is not configured (PAYMENT_API_BASE_URL)');
    err.statusCode = 503;
    throw err;
  }
  const { firstName, lastName, email, password, partnerCode: partnerCodeParam } = params || {};
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    paymentErrorLog('signupUser: email and password required');
    const err = new Error('Email and password are required for Payment API signup');
    err.statusCode = 400;
    throw err;
  }
  const partnerCode = resolvePaymentPartnerCode(partnerCodeParam);
  const body = {
    firstName: (firstName && String(firstName).trim()) || '',
    lastName: (lastName && String(lastName).trim()) || '',
    email: email.trim().toLowerCase(),
    password,
    partnerCode
  };
  paymentLog('--- signupUser: calling Payment API signup ---');
  paymentLog('request body (password hidden):', { ...body, password: '***' });
  const data = await paymentClient.request('POST', '/auth/signup', { body });
  paymentLog('signupUser: response received, token:', data?.token ? '(present)' : '(missing)');
  const token = data?.token;
  if (!token) {
    paymentErrorLog('signupUser: no token in response', data);
    const err = new Error('Payment API did not return a token');
    err.statusCode = 502;
    throw err;
  }
  return { token };
}

module.exports = { signupUser };
