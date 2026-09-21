'use strict';

const db = require('../../db/models');
const paymentClient = require('./paymentClient');
const { loginUser } = require('./loginUser.service');
const { isPaymentConfigured } = require('./payment.config');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

/**
 * Create a withdrawal request on the Payment API (CentryOS).
 * Logs in with the user's stored payment credentials, then calls POST /payments/linked-accounts/withdraw.
 *
 * @param {number} userId - Partner platform user id
 * @param {{ linkedAccountId: string, amount: number, currency?: string, reason?: string, routingType?: string, gameName?: string, gameUsername?: string }} body
 * @param {string} [explicitPartnerCode] - From X-Payment-Partner-Code (same store as login)
 * @returns {Promise<{ success: boolean, message: string, data?: object }>}
 */
async function createPaymentWithdrawalRequest(userId, body, explicitPartnerCode) {
  if (!isPaymentConfigured()) {
    const err = new Error('Payment API is not configured');
    err.statusCode = 503;
    throw err;
  }

  const linkedAccountId = (body?.linkedAccountId ?? body?.linked_account_id ?? '').toString().trim();
  if (!linkedAccountId) {
    const err = new Error('linkedAccountId is required');
    err.statusCode = 400;
    throw err;
  }

  const amount = body?.amount != null ? Number(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < 10) {
    const err = new Error('Amount must be a valid number and at least $10');
    err.statusCode = 400;
    throw err;
  }

  const user = await db.User.findByPk(userId, {
    attributes: ['paymentApiEmail', 'paymentApiPasswordEncrypted'],
    raw: true
  });

  if (!user?.paymentApiPasswordEncrypted || !user?.paymentApiEmail) {
    const err = new Error('Payment account not set up. Please link or create your Orionstar payment account first.');
    err.statusCode = 400;
    throw err;
  }

  const { decryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
  if (!isPaymentPasswordEncryptionConfigured()) {
    const err = new Error('Payment encryption not configured. Please contact support.');
    err.statusCode = 503;
    throw err;
  }

  let password;
  try {
    password = decryptPaymentPassword(user.paymentApiPasswordEncrypted);
  } catch (e) {
    paymentErrorLog('createPaymentWithdrawalRequest: decrypt failed', e.message);
    const err = new Error('Your payment account needs to be reconnected. Please link your payment account again.');
    err.statusCode = 409;
    err.code = 'PAYMENT_ACCOUNT_RELINK_REQUIRED';
    throw err;
  }
  if (!password) {
    const err = new Error('Your payment account needs to be reconnected. Please link your payment account again.');
    err.statusCode = 409;
    err.code = 'PAYMENT_ACCOUNT_RELINK_REQUIRED';
    throw err;
  }

  const emailNorm = user.paymentApiEmail.trim().toLowerCase();
  let paymentToken;
  try {
    const loginRes = await loginUser(emailNorm, password, explicitPartnerCode);
    paymentToken = loginRes.token;
  } catch (loginErr) {
    const message = loginErr.response?.message || loginErr.message || 'Payment login failed. Please try again.';
    const err = new Error(message);
    err.statusCode = loginErr.statusCode || 401;
    throw err;
  }

  // Payment API linked accounts are stored with currency USD; use USD for the API call regardless of platform display currency
  const currency = 'USD';
  const reason = (body?.reason ?? 'Withdrawal').toString().trim().slice(0, 2000) || 'Withdrawal';
  const routingType = (body?.routingType ?? body?.routing_type ?? 'RTP').toString().trim().slice(0, 64) || 'RTP';
  const gameName = (body?.gameName ?? body?.game_name ?? '').toString().trim().slice(0, 255) || '';
  const gameUsername = (body?.gameUsername ?? body?.game_username ?? '').toString().trim().slice(0, 255) || '';

  const requestBody = {
    linkedAccountId,
    amount: Number(amount),
    currency,
    reason,
    routingType,
    gameName,
    gameUsername
  };

  paymentLog('createPaymentWithdrawalRequest: POST payments/linked-accounts/withdraw', { linkedAccountId, amount: requestBody.amount, currency: requestBody.currency });

  const data = await paymentClient.request('POST', 'payments/linked-accounts/withdraw', {
    authToken: paymentToken,
    body: requestBody
  });

  paymentLog('createPaymentWithdrawalRequest: success', data);
  return data;
}

module.exports = { createPaymentWithdrawalRequest };
