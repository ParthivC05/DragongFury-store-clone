'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const payment = require('../payment');
const { getDeposits } = require('./getDeposits.service');
const { processProviderTransaction, extractLinkToken, extractApplicationId } = require('./depositV2Workflow.service');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

function mapTxToDepositRefreshFields(tx) {
  const payload = tx?.rawPayload?.payload;
  const feeRaw = payload?.feeCharged;
  const createdAt = tx?.createdAt;
  let createdAtIso = null;
  if (createdAt != null) {
    createdAtIso = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
  }
  return {
    method: tx?.method != null ? String(tx.method) : null,
    status: tx?.status != null ? String(tx.status) : null,
    createdAt: createdAtIso,
    amount: tx?.amount != null ? String(tx.amount) : null,
    feeCharged: feeRaw != null ? String(feeRaw) : null
  };
}

/**
 * Run sync: fetch COLLECTION transactions from Payment API and complete any successful
 * rows not yet credited. Returns refresh fields for pending/expired deposits matched by
 * payment link token or application id.
 *
 * OrionStars iframe orders are stored as EXPIRED until provider SUCCESS credits the wallet.
 *
 * @param {number} userId - Partner Platform user id
 * @param {string} paymentToken - JWT from payment.loginUser
 * @param {{ centryosUserId?: number|string, paymentEmail?: string, paymentPassword?: string, partnerCode?: string }} [options] - centryosUserId from login user.id; credentials for 401 retry on list API
 * @returns {Promise<{ processed: number, errors: Array<{ transactionId: string, message: string }>, deposits?: object, depositRefresh?: object[] }>}
 */
async function syncDepositsFromPaymentApi(userId, paymentToken, options = {}) {
  const result = { processed: 0, errors: [], depositRefresh: [] };
  paymentLog('syncDepositsFromPaymentApi: start', { userId });

  if (!paymentToken || typeof paymentToken !== 'string') {
    const err = new Error('Payment token is required. User must have a linked payment account.');
    err.statusCode = 400;
    throw err;
  }

  let centryosUserId = options.centryosUserId;
  if (centryosUserId == null || centryosUserId === '') {
    centryosUserId = payment.getCentryosUserIdFromToken(paymentToken);
  }
  if (centryosUserId == null || Number.isNaN(Number(centryosUserId))) {
    const err = new Error('Could not resolve CentryOS user id from payment session.');
    err.statusCode = 400;
    throw err;
  }

  let transactions = [];
  try {
    const listRes = await payment.listPaymentTransactionsWithAuthRetry(
      paymentToken,
      centryosUserId,
      { eventType: 'COLLECTION', limit: 100, offset: 0 },
      options.paymentEmail && options.paymentPassword
        ? {
            email: options.paymentEmail,
            password: options.paymentPassword,
            partnerCode: options.partnerCode
          }
        : undefined
    );
    transactions = Array.isArray(listRes?.data) ? listRes.data : [];
  } catch (err) {
    paymentErrorLog('syncDepositsFromPaymentApi: listPaymentTransactions failed', err.message);
    throw err;
  }

  if (!Array.isArray(transactions)) {
    paymentLog('syncDepositsFromPaymentApi: no transactions array', typeof transactions);
    result.deposits = await getDeposits(userId, { limit: 50, offset: 0 }).catch(() => ({ deposits: [], pendingDeposits: [], total: 0 }));
    return result;
  }

  // 1) Credit any SUCCESS transactions matched by applicationId / link token (works for EXPIRED orders too).
  for (const tx of transactions) {
    const transactionId = (tx.transactionId || tx.id || '').toString().trim();
    if (!transactionId) continue;

    try {
      const processed = await processProviderTransaction(userId, tx);
      if (processed.success && (processed.credited || processed.alreadyProcessed)) {
        result.processed += 1;
      }
    } catch (completeErr) {
      paymentErrorLog('syncDepositsFromPaymentApi: processProviderTransaction failed', transactionId, completeErr.message);
      result.errors.push({ transactionId, message: 'Unable to process this transaction.' });
    }
  }

  // 2) Auto-expire unpaid Orion iframe orders older than 24h (keep recent ones PENDING for UI).
  try {
    const expireBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [expiredCount] = await db.DepositOrder.update(
      { status: 'EXPIRED' },
      {
        where: {
          userId,
          provider: 'orionstarspay',
          status: { [Op.in]: ['LINK_CREATED', 'PENDING'] },
          created_at: { [Op.lt]: expireBefore }
        }
      }
    );
    if (expiredCount > 0) {
      paymentLog('syncDepositsFromPaymentApi: marked unpaid iframe orders expired', { userId, expiredCount });
    }
  } catch (e) {
    paymentErrorLog('syncDepositsFromPaymentApi: expire pending orders failed', e.message);
  }

  try {
    const openRows = await db.DepositOrder.findAll({
      where: {
        userId,
        provider: 'orionstarspay',
        status: { [Op.in]: ['LINK_CREATED', 'PENDING', 'EXPIRED'] }
      },
      order: [['created_at', 'DESC']],
      limit: 40,
      attributes: ['id', 'providerApplicationId', 'paymentLinkToken', 'status', 'metadata', 'created_at']
    });
    for (const row of openRows) {
      const match = transactions.find((t) => {
        const token = extractLinkToken(t);
        const appId = extractApplicationId(t);
        if (token && row.paymentLinkToken && String(token) === String(row.paymentLinkToken)) return true;
        if (appId && row.providerApplicationId && String(appId) === String(row.providerApplicationId)) return true;
        return false;
      });
      const statusUpper = String(row.status || '').toUpperCase();
      const awaitingPending =
        statusUpper === 'PENDING'
        || statusUpper === 'LINK_CREATED'
        || (statusUpper === 'EXPIRED' && row.metadata?.awaitingProviderConfirmation
          && (Date.now() - new Date(row.created_at || row.createdAt).getTime()) < 24 * 60 * 60 * 1000);
      result.depositRefresh.push({
        depositId: row.id,
        applicationId: row.providerApplicationId || null,
        ...(match
          ? mapTxToDepositRefreshFields(match)
          : {
              method: null,
              status: awaitingPending ? 'pending' : (statusUpper === 'EXPIRED' ? 'expired' : null),
              createdAt: null,
              amount: null,
              feeCharged: null
            })
      });
    }
  } catch (e) {
    paymentErrorLog('syncDepositsFromPaymentApi: depositRefresh build failed', e.message);
  }

  paymentLog('syncDepositsFromPaymentApi: done', { processed: result.processed, errors: result.errors.length });
  try {
    result.deposits = await getDeposits(userId, { limit: 50, offset: 0 });
  } catch (e) {
    result.deposits = { deposits: [], pendingDeposits: [], total: 0 };
  }
  return result;
}

module.exports = { syncDepositsFromPaymentApi };
