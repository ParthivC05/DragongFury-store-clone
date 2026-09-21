'use strict';

const client = require('./client');
const { isPaymentConfigured } = require('../payment.config');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');

async function getMyPaymentTransactions(userAuthToken, options = {}) {
  if (!isPaymentConfigured()) {
    paymentErrorLog('getMyPaymentTransactions: Payment API not configured');
    const err = new Error('Payment API is not configured');
    err.statusCode = 503;
    throw err;
  }

  if (!userAuthToken || typeof userAuthToken !== 'string') {
    const err = new Error('User auth token is required');
    err.statusCode = 400;
    throw err;
  }

  const limit = Math.min(Math.max(1, Number(options.limit) || 100), 200);
  const offset = Math.max(0, Number(options.offset) || 0);
  const params = new URLSearchParams({ limit, offset });
  if (options.eventType) params.set('eventType', options.eventType);
  if (options.status) params.set('status', options.status);

  const path = `/payments/my-transactions?${params.toString()}`;
  paymentLog('getMyPaymentTransactions: fetching', { eventType: options.eventType, limit, offset });
  const response = await client.request('GET', path, { authToken: userAuthToken });
  const list = Array.isArray(response?.data) ? response.data : (Array.isArray(response?.data?.data) ? response.data.data : []);
  const transactions = Array.isArray(list) ? list : [];
  paymentLog('getMyPaymentTransactions: received', transactions.length, 'transactions');
  return transactions;
}

module.exports = { getMyPaymentTransactions };
