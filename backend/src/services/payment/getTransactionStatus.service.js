'use strict';

const paymentClient = require('./paymentClient');
const { isPaymentConfigured } = require('./payment.config');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

/**
 * Get a single transaction by ID from the Payment API.
 * No auth required per API docs.
 *
 * @param {string} transactionId - Transaction ID from the payment API
 * @returns {Promise<object>} - Transaction object (status, amount, etc.)
 */
async function getTransactionStatus(transactionId) {
  if (!isPaymentConfigured()) {
    paymentErrorLog('getTransactionStatus: Payment API not configured');
    const err = new Error('Payment API is not configured (PAYMENT_API_BASE_URL)');
    err.statusCode = 503;
    throw err;
  }
  if (!transactionId || typeof transactionId !== 'string') {
    paymentErrorLog('getTransactionStatus: missing transactionId');
    const err = new Error('Transaction ID is required');
    err.statusCode = 400;
    throw err;
  }
  const path = `/payments/transactions/${encodeURIComponent(transactionId)}`;
  paymentLog('--- getTransactionStatus ---');
  paymentLog('transactionId:', transactionId);
  const response = await paymentClient.request('GET', path);
  // Payment API (CentryOS) returns { success: true, data: transaction }; unwrap so callers get the transaction object
  if (response && response.success === true && response.data != null) {
    return response.data;
  }
  return response;
}

module.exports = { getTransactionStatus };
