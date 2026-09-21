'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

const PROVIDER = 'orionstarspay';

/** Unpaid Orionstars Pay deposits older than this become EXPIRED. */
const AUTO_EXPIRE_MS = 24 * 60 * 60 * 1000;

/** Rows per page — DB-only updates, safe to run larger than provider reconcile crons. */
const BATCH_SIZE = 500;

/** Cap pages per cron tick so huge backlogs drain across runs without timing out. */
const MAX_BATCHES_PER_RUN = 20;

/** Soft time budget per run (ms). */
const MAX_RUNTIME_MS = 50 * 1000;

const ACTIVE_ORDER_STATUSES = ['PENDING', 'LINK_CREATED'];
const ACTIVE_PENDING_STATUSES = ['pending', 'confirming'];

/**
 * Expire unpaid Orionstars Pay deposit orders + pending rows older than 24h.
 * Newest first so recent stale deposits clear before ancient backlog.
 * Already EXPIRED / completed / failed rows are never selected again.
 *
 * @returns {Promise<{ expiredOrders: number, expiredPending: number, batches: number, stoppedReason: string }>}
 */
async function expireOrionstarsPendingDeposits() {
  const cutoff = new Date(Date.now() - AUTO_EXPIRE_MS);
  const startedAt = Date.now();
  const summary = {
    expiredOrders: 0,
    expiredPending: 0,
    batches: 0,
    stoppedReason: 'empty'
  };

  try {
    // 1) DepositOrder: PENDING / LINK_CREATED → EXPIRED
    while (summary.batches < MAX_BATCHES_PER_RUN && Date.now() - startedAt < MAX_RUNTIME_MS) {
      const orders = await db.DepositOrder.findAll({
        where: {
          provider: PROVIDER,
          status: { [Op.in]: ACTIVE_ORDER_STATUSES },
          created_at: { [Op.lt]: cutoff }
        },
        order: [['created_at', 'DESC']],
        limit: BATCH_SIZE,
        attributes: ['id', 'paymentLinkToken', 'metadata']
      });

      if (!orders.length) break;

      const orderIds = orders.map((o) => o.id);
      const pendingIds = [];
      for (const order of orders) {
        const legacyId = order.metadata?.legacyPaymentPendingDepositId;
        if (legacyId != null && String(legacyId).trim() !== '') {
          const n = Number(legacyId);
          if (Number.isFinite(n)) pendingIds.push(n);
        }
      }

      const now = new Date();
      const [orderUpdated] = await db.DepositOrder.update(
        {
          status: 'EXPIRED',
          lastSyncedAt: now,
          lastSyncError: null
        },
        {
          where: {
            id: { [Op.in]: orderIds },
            status: { [Op.in]: ACTIVE_ORDER_STATUSES }
          }
        }
      );

      if (pendingIds.length) {
        await db.PaymentPendingDeposit.update(
          { status: 'expired' },
          {
            where: {
              id: { [Op.in]: pendingIds },
              provider: PROVIDER,
              status: { [Op.in]: ACTIVE_PENDING_STATUSES }
            }
          }
        ).catch(() => {});
      }

      summary.expiredOrders += orderUpdated || orderIds.length;
      summary.batches += 1;

      if (orders.length < BATCH_SIZE) break;
      summary.stoppedReason = 'max_batches';
    }

    if (Date.now() - startedAt >= MAX_RUNTIME_MS) {
      summary.stoppedReason = 'time_budget';
    } else if (summary.batches >= MAX_BATCHES_PER_RUN && summary.expiredOrders > 0) {
      summary.stoppedReason = 'max_batches';
    } else if (summary.expiredOrders > 0) {
      summary.stoppedReason = 'empty';
    }

    // 2) Orphan / leftover PaymentPendingDeposit (no DepositOrder or missed link)
    let pendingBatches = 0;
    while (pendingBatches < MAX_BATCHES_PER_RUN && Date.now() - startedAt < MAX_RUNTIME_MS) {
      const pendings = await db.PaymentPendingDeposit.findAll({
        where: {
          provider: PROVIDER,
          status: { [Op.in]: ACTIVE_PENDING_STATUSES },
          created_at: { [Op.lt]: cutoff }
        },
        order: [['created_at', 'DESC']],
        limit: BATCH_SIZE,
        attributes: ['id']
      });

      if (!pendings.length) break;

      const pendingIds = pendings.map((p) => p.id);
      const [pendingUpdated] = await db.PaymentPendingDeposit.update(
        { status: 'expired' },
        {
          where: {
            id: { [Op.in]: pendingIds },
            status: { [Op.in]: ACTIVE_PENDING_STATUSES }
          }
        }
      );

      summary.expiredPending += pendingUpdated || pendingIds.length;
      pendingBatches += 1;
      summary.batches += 1;

      if (pendings.length < BATCH_SIZE) break;
      if (Date.now() - startedAt >= MAX_RUNTIME_MS) {
        summary.stoppedReason = 'time_budget';
        break;
      }
      if (pendingBatches >= MAX_BATCHES_PER_RUN) {
        summary.stoppedReason = 'max_batches';
        break;
      }
    }

    if (summary.expiredOrders > 0 || summary.expiredPending > 0) {
      paymentLog('expireOrionstarsPendingDeposits done', summary);
    }
  } catch (err) {
    paymentErrorLog('expireOrionstarsPendingDeposits failed', err.message);
    throw err;
  }

  return summary;
}

module.exports = {
  expireOrionstarsPendingDeposits,
  AUTO_EXPIRE_MS,
  BATCH_SIZE,
  MAX_BATCHES_PER_RUN,
  PROVIDER
};
