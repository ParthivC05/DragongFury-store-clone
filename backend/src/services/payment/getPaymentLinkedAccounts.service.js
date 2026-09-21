'use strict';

const db = require('../../db/models');
const paymentClient = require('./paymentClient');
const { loginUser } = require('./loginUser.service');
const { isPaymentConfigured } = require('./payment.config');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

const PAYMENT_LINKED_ACCOUNTS_URL = 'https://payment.orionstarsweeps.com/';

/**
 * Get linked payment methods (payout methods) for the user from the Payment API (CentryOS).
 * Uses the user's stored payment account credentials to login and fetch GET /payments/linked-accounts.
 *
 * @param {number} userId - Partner platform user id
 * @param {{ currency?: string }} options - optional currency (default USD)
 * @returns {Promise<{ success: boolean, data: Array, count: number, hasPaymentAccount: boolean }>}
 */
async function getPaymentLinkedAccounts(userId, options = {}) {
  const currency = (options?.currency || 'USD').toString().trim().slice(0, 8) || 'USD';

  if (!isPaymentConfigured()) {
    return { success: true, data: [], count: 0, hasPaymentAccount: false, addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL };
  }

  const user = await db.User.findByPk(userId, {
    attributes: ['paymentApiEmail', 'paymentApiPasswordEncrypted'],
    raw: true
  });

  if (!user?.paymentApiPasswordEncrypted || !user?.paymentApiEmail) {
    return { success: true, data: [], count: 0, hasPaymentAccount: false, addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL };
  }

  const { decryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
  if (!isPaymentPasswordEncryptionConfigured()) {
    return { success: true, data: [], count: 0, hasPaymentAccount: true, addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL };
  }

  let paymentToken;
  try {
    let password;
    try {
      password = decryptPaymentPassword(user.paymentApiPasswordEncrypted);
    } catch {
      return { success: true, data: [], count: 0, hasPaymentAccount: true, addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL };
    }
    if (!password) return { success: true, data: [], count: 0, hasPaymentAccount: true, addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL };
    const loginRes = await loginUser(
      user.paymentApiEmail.trim().toLowerCase(),
      password,
      options?.partnerCode
    );
    paymentToken = loginRes.token;
  } catch (err) {
    paymentErrorLog('getPaymentLinkedAccounts: login failed', err.message);
    return { success: true, data: [], count: 0, hasPaymentAccount: true, addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL };
  }

  try {
    const path = `payments/linked-accounts?currency=${encodeURIComponent(currency)}`;
    paymentLog('getPaymentLinkedAccounts: GET', path);
    const res = await paymentClient.request('GET', path, { authToken: paymentToken });
    const list = Array.isArray(res?.data) ? res.data : [];
    return {
      success: true,
      data: list,
      count: list.length,
      hasPaymentAccount: true,
      addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL
    };
  } catch (err) {
    paymentErrorLog('getPaymentLinkedAccounts: fetch failed', err.message);
    return {
      success: true,
      data: [],
      count: 0,
      hasPaymentAccount: true,
      addPaymentMethodUrl: PAYMENT_LINKED_ACCOUNTS_URL
    };
  }
}

module.exports = { getPaymentLinkedAccounts, PAYMENT_LINKED_ACCOUNTS_URL };
