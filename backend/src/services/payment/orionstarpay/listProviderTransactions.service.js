'use strict';

const client = require('./client');
const { loginUser } = require('./login.service');
const { isPaymentConfigured } = require('../payment.config');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');

async function listPaymentTransactions(userAuthToken, centryosUserId, options = {}) {
  if (!isPaymentConfigured()) {
    paymentErrorLog('listPaymentTransactions: Payment API not configured');
    const err = new Error('Payment API is not configured');
    err.statusCode = 503;
    throw err;
  }

  if (!userAuthToken || typeof userAuthToken !== 'string') {
    const err = new Error('User auth token is required');
    err.statusCode = 400;
    throw err;
  }

  if (centryosUserId == null || centryosUserId === '') {
    const err = new Error('CentryOS user id is required');
    err.statusCode = 400;
    throw err;
  }

  const limit = Math.min(Math.max(1, Number(options.limit) || 20), 200);
  const offset = Math.max(0, Number(options.offset) || 0);
  const eventType = (options.eventType && String(options.eventType).trim()) || 'COLLECTION';
  const params = new URLSearchParams({
    userId: String(centryosUserId),
    eventType,
    limit: String(limit),
    offset: String(offset)
  });

  const path = `/payments/transactions?${params.toString()}`;
  paymentLog('listPaymentTransactions: GET', path);
  const response = await client.request('GET', path, { authToken: userAuthToken });
  const list = Array.isArray(response?.data)
    ? response.data
    : (Array.isArray(response?.data?.data) ? response.data.data : []);
  const total = response?.total != null ? Number(response.total) : list.length;
  return { data: list, total };
}

async function listPaymentTransactionsWithAuthRetry(userAuthToken, centryosUserId, options, retryWithLogin) {
  try {
    return await listPaymentTransactions(userAuthToken, centryosUserId, options);
  } catch (err) {
    if (err.statusCode === 401 && retryWithLogin?.email && retryWithLogin?.password) {
      paymentLog('listPaymentTransactions: 401, re-login and retry');
      const fresh = await loginUser(
        retryWithLogin.email,
        retryWithLogin.password,
        retryWithLogin.partnerCode
      );
      return listPaymentTransactions(fresh.token, centryosUserId, options);
    }
    throw err;
  }
}

module.exports = {
  listPaymentTransactions,
  listPaymentTransactionsWithAuthRetry
};
