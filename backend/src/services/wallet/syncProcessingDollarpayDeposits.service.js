'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const dollarpay = require('../paymentProviders/dollarpay/dollarpay.client');
const { completeDepositFromDollarpay } = require('./completeDepositFromDollarpay.service');
const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
const { logger, paymentLog, paymentErrorLog } = require('../../libs/logger');

const PROVIDER = 'dollarpay';

/** Still open — waiting for payment / webhook. */
const ACTIVE_ORDER_STATUSES = ['PENDING', 'LINK_CREATED'];
/** Closed locally but still polled briefly for late DollarPay confirmation. */
const EXPIRED_ORDER_STATUS = 'EXPIRED';

/** Skip brand-new orders so the webhook can credit first (avoids extra provider load). */
const MIN_AGE_MS = 60 * 1000;
/**
 * After this age with no success/fail from DollarPay, do a final status query then mark EXPIRED
 * (matches DollarPay dashboard closing unpaid links ~3 hours).
 */
const AUTO_EXPIRE_MS = 3 * 60 * 60 * 1000;
/**
 * Keep polling EXPIRED orders only within this window (late provider confirmation).
 * Older expired orders are ignored so they cannot block the cron queue.
 */
const EXPIRED_POLL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/**
 * Safety bound for stuck PENDING/LINK_CREATED (should normally expire at 3h).
 * Prevents infinite growth if expire updates fail.
 */
const ACTIVE_POLL_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const BATCH_LIMIT = 100;

/** @deprecated Use ACTIVE_POLL_MAX_AGE_MS / EXPIRED_POLL_MAX_AGE_MS. Kept for callers that imported MAX_AGE_MS. */
const MAX_AGE_MS = ACTIVE_POLL_MAX_AGE_MS;

/**
 * Resolve DollarPay merchant + API key for a deposit order from pending metadata
 * (per-store credentials stored at payin create time).
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

  const merchantId = String(meta.merchantId || '').trim();
  const enc = meta.dollarpayKeyEncrypted;
  if (!merchantId || !enc) return null;

  let apiKey;
  try {
    apiKey = decryptPaymentPassword(enc);
  } catch {
    return null;
  }
  if (!apiKey) return null;

  return {
    merchantId,
    apiKey,
    outerOrderSn,
    paymentType: meta.paymentType || 'cashapp',
    pending
  };
}

/**
 * Mark deposit order (+ matching pending row) as expired/closed after final unpaid check.
 */
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
          status: { [Op.in]: ['pending', 'expired'] }
        }
      }
    ).catch(() => {});
  }
}

/**
 * Build the Sequelize where clause for DollarPay deposit reconcile candidates.
 * - Active (PENDING/LINK_CREATED): last 48h, at least MIN_AGE old
 * - EXPIRED: only last 24h (ignore ancient expired backlog)
 */
function buildReconcileWhere(now = Date.now()) {
  const maxCreatedAt = new Date(now - MIN_AGE_MS);
  const activeMinCreatedAt = new Date(now - ACTIVE_POLL_MAX_AGE_MS);
  const expiredMinCreatedAt = new Date(now - EXPIRED_POLL_MAX_AGE_MS);

  // Use DB column names (created_at): nested Op.or + camelCase createdAt can emit invalid SQL.
  return {
    provider: PROVIDER,
    created_at: { [Op.lte]: maxCreatedAt },
    [Op.or]: [
      {
        status: { [Op.in]: ACTIVE_ORDER_STATUSES },
        created_at: { [Op.gte]: activeMinCreatedAt }
      },
      {
        status: EXPIRED_ORDER_STATUS,
        created_at: { [Op.gte]: expiredMinCreatedAt }
      }
    ]
  };
}

/**
 * Reconcile open DollarPay deposits across all stores/users.
 * Backup to webhook: query provider and credit SC when pay_status=1.
 *
 * Priority: newest first (so recent payers are not stuck behind old expired backlog).
 * After 3h unpaid: final DollarPay check, then mark EXPIRED locally.
 * EXPIRED older than 24h: never queried.
 *
 * Safe to run on a 1–2 minute cron; idempotent via PaymentDepositCompletion.
 */
async function syncProcessingDollarpayDeposits() {
  const now = Date.now();

  const orders = await db.DepositOrder.findAll({
    where: buildReconcileWhere(now),
    // Newest first — recent deposits get status checks before old backlog.
    order: [['created_at', 'DESC']],
    limit: BATCH_LIMIT
  });

  let checked = 0;
  let credited = 0;
  let alreadyProcessed = 0;
  let failed = 0;
  let pending = 0;
  let expired = 0;
  let skippedNoCreds = 0;
  let errors = 0;

  for (const order of orders) {
    checked += 1;
    const outerOrderSn = String(order.paymentLinkToken || '').trim();
    const createdRaw = order.createdAt || order.get?.('created_at') || order.dataValues?.created_at;
    const createdMs = new Date(createdRaw).getTime();
    const ageMs = Number.isFinite(createdMs) ? now - createdMs : 0;
    const pastAutoExpire = ageMs >= AUTO_EXPIRE_MS;
    const statusUpper = String(order.status || '').toUpperCase();
    const isAlreadyExpired = statusUpper === EXPIRED_ORDER_STATUS;

    try {
      const creds = await resolveDepositCreds(order);
      if (!creds) {
        skippedNoCreds += 1;
        // Still close stuck active orders past 3h so they leave the active queue.
        if (!isAlreadyExpired && pastAutoExpire) {
          await markDepositOrderExpired(order, outerOrderSn, order.syncAttemptCount);
          expired += 1;
        } else {
          await order
            .update({
              lastSyncedAt: new Date(),
              syncAttemptCount: (order.syncAttemptCount || 0) + 1,
              lastSyncError: 'Missing DollarPay merchantId or encrypted key for cron reconcile'
            })
            .catch(() => {});
        }
        continue;
      }

      const data = await dollarpay.queryPayin({
        merchantId: creds.merchantId,
        apiKey: creds.apiKey,
        outerOrderSn: creds.outerOrderSn
      });
      const payStatus = String(data?.pay_status ?? '').trim();
      const transactionId = String(data?.transaction_id || outerOrderSn).trim();

      if (payStatus === '1') {
        const result = await completeDepositFromDollarpay({
          userId: order.userId,
          amount: Number(order.requestedAmount),
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
        continue;
      }

      if (payStatus === '4' || payStatus === '5') {
        await order.update({
          status: 'FAILED',
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
              status: { [Op.in]: ['pending', 'expired'] }
            }
          }
        ).catch(() => {});
        failed += 1;
        continue;
      }

      // Still unpaid / processing on DollarPay.
      if (!isAlreadyExpired && pastAutoExpire) {
        // Final check already done above — close locally (DollarPay ~3h close).
        await markDepositOrderExpired(order, creds.outerOrderSn, order.syncAttemptCount);
        expired += 1;
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
      paymentErrorLog('syncProcessingDollarpayDeposits failed', outerOrderSn, err.message);
      logger.warn(
        { err: err.message, orderId: order.id, userId: order.userId, outerOrderSn },
        'DollarPay deposit reconcile failed'
      );

      // On query error past 3h, still expire so one bad order cannot block forever.
      if (!isAlreadyExpired && pastAutoExpire) {
        try {
          await markDepositOrderExpired(order, outerOrderSn, order.syncAttemptCount);
          expired += 1;
          continue;
        } catch (_) {
          /* fall through to sync error stamp */
        }
      }

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
    skippedNoCreds,
    errors
  };
  paymentLog('syncProcessingDollarpayDeposits done', summary);
  return summary;
}

module.exports = {
  syncProcessingDollarpayDeposits,
  buildReconcileWhere,
  resolveDepositCreds,
  markDepositOrderExpired,
  MIN_AGE_MS,
  MAX_AGE_MS,
  AUTO_EXPIRE_MS,
  EXPIRED_POLL_MAX_AGE_MS,
  ACTIVE_POLL_MAX_AGE_MS,
  BATCH_LIMIT,
  ACTIVE_ORDER_STATUSES,
  EXPIRED_ORDER_STATUS
};
