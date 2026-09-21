'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const xxpay = require('../paymentProviders/xxpay/xxpay.client');
const { completeDepositFromXxpay } = require('./completeDepositFromXxpay.service');
const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
const {
  XXPAY_ALLOWED_STORE_CODES,
  storeAllowsXxpay
} = require('../paymentProviders/xxpay/xxpay.storeAccess');
const { logger, paymentLog, paymentErrorLog } = require('../../libs/logger');

const PROVIDER = 'xxpay';
const ALLOWED_STORES = [...XXPAY_ALLOWED_STORE_CODES];

const ACTIVE_ORDER_STATUSES = ['PENDING', 'LINK_CREATED'];
const EXPIRED_ORDER_STATUS = 'EXPIRED';
const CLOSED_ORDER_STATUS = 'CLOSED';
const FAILED_ORDER_STATUS = 'FAILED';

const MIN_AGE_MS = 60 * 1000;
const AUTO_EXPIRE_MS = 3 * 60 * 60 * 1000;
const EXPIRED_POLL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ACTIVE_POLL_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Remap legacy FAILED (old closed→failed mapping) by re-querying XXPay within this window. */
const FAILED_REMAP_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

/**
 * Resolve XXPay mchNo + API key + baseUrl from pending metadata (stored at pay-in create).
 */
async function resolveDepositCreds(order) {
  const outerOrderSn = String(order.paymentLinkToken || '').trim();
  if (!outerOrderSn) return null;

  const pending = await db.PaymentPendingDeposit.findOne({
    where: {
      provider: PROVIDER,
      providerSessionId: outerOrderSn,
      userId: order.userId
    },
    order: [['id', 'DESC']],
    attributes: ['id', 'providerMetadata', 'status', 'amount']
  });

  const meta =
    (pending?.providerMetadata && typeof pending.providerMetadata === 'object'
      ? pending.providerMetadata
      : null) ||
    (order.metadata && typeof order.metadata === 'object' ? order.metadata : null) ||
    {};

  const mchNo = String(meta.mchNo || '').trim();
  const enc = meta.xxpayKeyEncrypted;
  if (!mchNo || !enc) return null;

  let apiKey;
  try {
    apiKey = decryptPaymentPassword(enc);
  } catch {
    return null;
  }
  if (!apiKey) return null;

  return {
    mchNo,
    apiKey,
    baseUrl: meta.xxpayBaseUrl || null,
    outerOrderSn,
    payOrderNo: meta.payOrderNo || order.providerTransactionId || null,
    paymentType: meta.paymentType || 'cashapp',
    pending
  };
}

async function markDepositOrderExpired(order, outerOrderSn, syncAttemptCount) {
  await order.update({
    status: EXPIRED_ORDER_STATUS,
    lastSyncedAt: new Date(),
    syncAttemptCount: (syncAttemptCount || 0) + 1,
    lastSyncError: null
  });
  if (outerOrderSn) {
    await db.PaymentPendingDeposit.update(
      { status: 'expired' },
      {
        where: {
          provider: PROVIDER,
          providerSessionId: outerOrderSn,
          status: { [Op.in]: ['pending', 'expired', 'failed', 'closed'] }
        }
      }
    ).catch(() => {});
  }
}

/** XXPay pay-in state 6 (order closed) — show as Closed, not Expired. */
async function markDepositOrderClosed(order, outerOrderSn, syncAttemptCount) {
  await order.update({
    status: CLOSED_ORDER_STATUS,
    lastSyncedAt: new Date(),
    syncAttemptCount: (syncAttemptCount || 0) + 1,
    lastSyncError: null
  });
  if (outerOrderSn) {
    await db.PaymentPendingDeposit.update(
      { status: 'closed' },
      {
        where: {
          provider: PROVIDER,
          providerSessionId: outerOrderSn,
          status: { [Op.in]: ['pending', 'expired', 'failed', 'closed'] }
        }
      }
    ).catch(() => {});
  }
}

function buildReconcileWhere(now = Date.now()) {
  const maxCreatedAt = new Date(now - MIN_AGE_MS);
  const activeMinCreatedAt = new Date(now - ACTIVE_POLL_MAX_AGE_MS);
  const expiredMinCreatedAt = new Date(now - EXPIRED_POLL_MAX_AGE_MS);
  const failedMinCreatedAt = new Date(now - FAILED_REMAP_MAX_AGE_MS);

  return {
    provider: PROVIDER,
    created_at: { [Op.lte]: maxCreatedAt },
    [Op.or]: [
      {
        status: { [Op.in]: ACTIVE_ORDER_STATUSES },
        created_at: { [Op.gte]: activeMinCreatedAt }
      },
      {
        status: { [Op.in]: [EXPIRED_ORDER_STATUS, CLOSED_ORDER_STATUS] },
        created_at: { [Op.gte]: expiredMinCreatedAt }
      },
      // Legacy: closed (state 6) was stored as FAILED — re-query and remap to CLOSED.
      {
        status: FAILED_ORDER_STATUS,
        created_at: { [Op.gte]: failedMinCreatedAt }
      }
    ]
  };
}

/**
 * Reconcile open XXPay deposits for allowlisted stores only.
 * Backup to webhook: POST /api/pay/query → credit when state=2.
 */
async function syncProcessingXxpayDeposits() {
  const now = Date.now();

  const orders = await db.DepositOrder.findAll({
    where: buildReconcileWhere(now),
    include: [
      {
        model: db.User,
        attributes: ['userId', 'storeCode'],
        required: true,
        where: {
          storeCode: { [Op.in]: ALLOWED_STORES }
        }
      }
    ],
    order: [['created_at', 'DESC']],
    limit: BATCH_LIMIT
  });

  let checked = 0;
  let credited = 0;
  let alreadyProcessed = 0;
  let failed = 0;
  let pending = 0;
  let expired = 0;
  let closed = 0;
  let remappedFailedToClosed = 0;
  let skippedNoCreds = 0;
  let skippedStore = 0;
  let errors = 0;

  paymentLog('XXPay deposit cron start', {
    candidateCount: orders.length,
    allowedStores: ALLOWED_STORES
  });
  console.log('[XXPay] CRON PAYIN START', {
    candidateCount: orders.length,
    allowedStores: ALLOWED_STORES
  });

  for (const order of orders) {
    checked += 1;
    const outerOrderSn = String(order.paymentLinkToken || '').trim();
    const storeCode = order.User?.storeCode || order.User?.get?.('storeCode') || null;

    if (!storeAllowsXxpay(storeCode)) {
      skippedStore += 1;
      continue;
    }

    const createdRaw = order.createdAt || order.get?.('created_at') || order.dataValues?.created_at;
    const createdMs = new Date(createdRaw).getTime();
    const ageMs = Number.isFinite(createdMs) ? now - createdMs : 0;
    const pastAutoExpire = ageMs >= AUTO_EXPIRE_MS;
    const statusUpper = String(order.status || '').toUpperCase();
    const isAlreadyExpired = statusUpper === EXPIRED_ORDER_STATUS;
    const isAlreadyClosed = statusUpper === CLOSED_ORDER_STATUS;
    const isAlreadyFailed = statusUpper === FAILED_ORDER_STATUS;

    try {
      const creds = await resolveDepositCreds(order);
      if (!creds) {
        skippedNoCreds += 1;
        paymentLog('XXPay deposit cron skip: missing creds', {
          orderId: order.id,
          userId: order.userId,
          mchOrderNo: outerOrderSn,
          storeCode
        });
        // Do not remap FAILED without a provider query (could be a real payment failure).
        if (!isAlreadyExpired && !isAlreadyClosed && !isAlreadyFailed && pastAutoExpire) {
          await markDepositOrderExpired(order, outerOrderSn, order.syncAttemptCount);
          expired += 1;
        } else {
          await order
            .update({
              lastSyncedAt: new Date(),
              syncAttemptCount: (order.syncAttemptCount || 0) + 1,
              lastSyncError: 'Missing XXPay mchNo or encrypted key for cron reconcile'
            })
            .catch(() => {});
        }
        continue;
      }

      console.log('[XXPay] CRON PAYIN QUERY', {
        orderId: order.id,
        userId: order.userId,
        storeCode,
        mchOrderNo: creds.outerOrderSn,
        payOrderNo: creds.payOrderNo || null
      });

      const data = await xxpay.queryPayin({
        mchNo: creds.mchNo,
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        mchOrderNo: creds.outerOrderSn,
        payOrderNo: creds.payOrderNo || undefined
      });

      const payload = data?.data && typeof data.data === 'object' ? data.data : data;
      const stateNum = Number(payload?.state);
      const transactionId = String(
        payload?.payOrderNo || payload?.orderNo || creds.payOrderNo || outerOrderSn
      ).trim();
      const hasRealAmount =
        payload?.realAmount != null && String(payload.realAmount).trim() !== '';
      let amountDollars = Number(order.requestedAmount);
      if (hasRealAmount) {
        const cents = Number(payload.realAmount);
        if (Number.isFinite(cents) && cents > 0) amountDollars = cents / 100;
      }

      paymentLog('XXPay deposit cron query result', {
        orderId: order.id,
        mchOrderNo: creds.outerOrderSn,
        state: stateNum,
        payOrderNo: transactionId,
        storeCode
      });

      if (stateNum === 2) {
        const result = await completeDepositFromXxpay({
          userId: order.userId,
          amount: amountDollars,
          overrideAmount: hasRealAmount,
          transactionId,
          outerOrderSn: creds.outerOrderSn,
          paymentType: creds.paymentType
        });
        if (result?.alreadyProcessed) {
          alreadyProcessed += 1;
          await order
            .update({
              status: 'SUCCESS',
              providerTransactionId: transactionId,
              completedAt: order.completedAt || new Date(),
              lastSyncedAt: new Date(),
              syncAttemptCount: (order.syncAttemptCount || 0) + 1,
              lastSyncError: null
            })
            .catch(() => {});
          if (creds.pending && creds.pending.status !== 'completed') {
            await creds.pending.update({ status: 'completed' }).catch(() => {});
          }
        } else {
          credited += 1;
          await order
            .update({
              lastSyncedAt: new Date(),
              syncAttemptCount: (order.syncAttemptCount || 0) + 1,
              lastSyncError: null
            })
            .catch(() => {});
        }
        console.log('[XXPay] CRON PAYIN CREDITED', {
          orderId: order.id,
          userId: order.userId,
          mchOrderNo: creds.outerOrderSn,
          alreadyProcessed: Boolean(result?.alreadyProcessed),
          amount: amountDollars
        });
        continue;
      }

      // Pay-in: 3 = payment failed; 6 = order closed → CLOSED (not expired).
      // Payout transfer states are handled separately and still treat 6 as failed.
      if (stateNum === 3) {
        if (!isAlreadyFailed) {
          await order.update({
            status: FAILED_ORDER_STATUS,
            lastSyncedAt: new Date(),
            syncAttemptCount: (order.syncAttemptCount || 0) + 1,
            lastSyncError: null
          });
          await db.PaymentPendingDeposit.update(
            { status: 'failed' },
            {
              where: {
                provider: PROVIDER,
                providerSessionId: creds.outerOrderSn,
                status: { [Op.in]: ['pending', 'expired', 'closed'] }
              }
            }
          ).catch(() => {});
          failed += 1;
          console.log('[XXPay] CRON PAYIN FAILED', {
            orderId: order.id,
            mchOrderNo: creds.outerOrderSn,
            state: stateNum
          });
        } else {
          // Confirmed real payment failure — leave FAILED, stop remapping churn.
          await order
            .update({
              lastSyncedAt: new Date(),
              syncAttemptCount: (order.syncAttemptCount || 0) + 1,
              lastSyncError: null
            })
            .catch(() => {});
          failed += 1;
        }
        continue;
      }

      if (stateNum === 6) {
        if (!isAlreadyClosed) {
          const wasFailed = isAlreadyFailed;
          const wasExpired = isAlreadyExpired;
          await markDepositOrderClosed(order, creds.outerOrderSn, order.syncAttemptCount);
          closed += 1;
          if (wasFailed || wasExpired) remappedFailedToClosed += 1;
          console.log('[XXPay] CRON PAYIN CLOSED', {
            orderId: order.id,
            mchOrderNo: creds.outerOrderSn,
            state: stateNum,
            reason: wasFailed || wasExpired ? 'remap_to_closed' : 'xxpay_closed'
          });
        } else {
          pending += 1;
          await order
            .update({
              lastSyncedAt: new Date(),
              syncAttemptCount: (order.syncAttemptCount || 0) + 1,
              lastSyncError: null
            })
            .catch(() => {});
        }
        continue;
      }

      // Already FAILED and XXPay still unpaid/unknown — do not re-expire blindly without closed/fail state.
      if (isAlreadyFailed) {
        await order
          .update({
            lastSyncedAt: new Date(),
            syncAttemptCount: (order.syncAttemptCount || 0) + 1,
            lastSyncError: null
          })
          .catch(() => {});
        failed += 1;
        continue;
      }

      if (!isAlreadyExpired && !isAlreadyClosed && pastAutoExpire) {
        await markDepositOrderExpired(order, creds.outerOrderSn, order.syncAttemptCount);
        expired += 1;
        console.log('[XXPay] CRON PAYIN EXPIRED', {
          orderId: order.id,
          mchOrderNo: creds.outerOrderSn,
          state: stateNum,
          ageMs
        });
        continue;
      }

      pending += 1;
      await order
        .update({
          lastSyncedAt: new Date(),
          syncAttemptCount: (order.syncAttemptCount || 0) + 1,
          lastSyncError: null
        })
        .catch(() => {});
    } catch (err) {
      errors += 1;
      paymentErrorLog('syncProcessingXxpayDeposits failed', outerOrderSn, err.message);
      logger.warn(
        { err: err.message, orderId: order.id, userId: order.userId, outerOrderSn, storeCode },
        'XXPay deposit reconcile failed'
      );
      console.log('[XXPay] CRON PAYIN ERROR', {
        orderId: order.id,
        mchOrderNo: outerOrderSn,
        message: err.message
      });

      // Do not auto-expire on query/API errors (e.g. IP whitelist) — only when we
      // successfully see a non-paid state past AUTO_EXPIRE_MS above.
      await order
        .update({
          lastSyncedAt: new Date(),
          syncAttemptCount: (order.syncAttemptCount || 0) + 1,
          lastSyncError: String(err.message || 'query failed').slice(0, 500)
        })
        .catch(() => {});
    }
  }

  const summary = {
    checked,
    credited,
    alreadyProcessed,
    failed,
    pending,
    expired,
    closed,
    remappedFailedToClosed,
    skippedNoCreds,
    skippedStore,
    errors,
    allowedStores: ALLOWED_STORES
  };
  paymentLog('syncProcessingXxpayDeposits done', summary);
  console.log('[XXPay] CRON PAYIN DONE', summary);
  return summary;
}

module.exports = {
  syncProcessingXxpayDeposits,
  buildReconcileWhere,
  resolveDepositCreds,
  markDepositOrderExpired,
  markDepositOrderClosed,
  MIN_AGE_MS,
  AUTO_EXPIRE_MS,
  BATCH_LIMIT
};
