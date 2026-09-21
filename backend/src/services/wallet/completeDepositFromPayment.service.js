'use strict';

const db = require('../../db/models');
const payment = require('../payment');
const { processProviderTransaction } = require('./depositV2Workflow.service');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

/**
 * When payment API reports a successful payment, credit the user's wallet (SC) and record
 * the transaction so we never double-credit. Call this from deposit/complete endpoint
 * (user sends transactionId after paying).
 *
 * @param {number} userId - Partner platform user id (from JWT)
 * @param {string} transactionId - Payment API transaction id
 * @param {{ transactionPayload?: object }} [options] - If `transactionPayload` is set (e.g. row from GET /payments/transactions list), skip GET /payments/transactions/:id (avoids 401 when list is authorized but single-tx is not).
 * @returns {Promise<{ message: string, balance_sc?: number, play_balance_sc?: number, alreadyProcessed?: boolean }>}
 */
async function completeDepositFromPayment(userId, transactionId, options = {}) {
  paymentLog('--- completeDepositFromPayment ---');
  paymentLog('userId:', userId, 'transactionId:', transactionId);
  if (!transactionId || typeof transactionId !== 'string') {
    const err = new Error('Transaction ID is required');
    err.statusCode = 400;
    throw err;
  }

  let t;
  const preloaded = options?.transactionPayload && typeof options.transactionPayload === 'object';
  if (preloaded) {
    t = options.transactionPayload;
    paymentLog('--- completeDepositFromPayment: using provided transaction payload (skipping getTransactionStatus) ---');
  } else {
    let tx;
    try {
      tx = await payment.getTransactionStatus(transactionId.trim());
    } catch (err) {
      paymentErrorLog('completeDepositFromPayment: getTransactionStatus failed', transactionId, err.message, err.response || err.statusCode);
      throw err;
    }
    paymentLog('--- completeDepositFromPayment: getTransactionStatus response ---');
    paymentLog('transaction from API:', tx);

    // API may return { success, data: transaction }; normalize to transaction object
    t = tx?.data != null ? tx.data : tx;
  }
  const processed = await processProviderTransaction(userId, t, { throwOnNonSuccess: true });
  if (processed.alreadyProcessed) {
    return { message: 'Deposit already credited for this payment.', alreadyProcessed: true };
  }

  const { getBalance } = require('./getBalance.service');
  const balancePayload = await getBalance(userId, { skipCache: true });
  paymentLog('--- completeDepositFromPayment: result (wallet credited) ---');
  return {
    message: 'Deposit completed.',
    ...balancePayload
  };
}

module.exports = { completeDepositFromPayment };
