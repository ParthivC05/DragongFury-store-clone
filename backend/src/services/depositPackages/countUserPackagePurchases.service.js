'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');

/** Chime in-flight + completed — money may already be sent / awaiting approval. */
const CHIME_COUNT_STATUSES = ['completed', 'pending', 'processing'];

/** Card/crypto catalog purchases that actually credited (or standalone completed sessions). */
const DEPOSIT_ORDER_SUCCESS_STATUSES = ['SUCCESS'];
const PAYMENT_PENDING_COMPLETED_STATUSES = ['completed'];

/**
 * Expire abandoned card/crypto checkouts for a package so a retry (e.g. Chime)
 * is not blocked, and a later orphaned card success is less likely.
 */
async function releaseAbandonedPackageCardCheckouts(userId, packageId) {
  const uid = parseInt(userId, 10);
  const pid = parseInt(packageId, 10);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(pid) || pid < 1) {
    return { expiredPending: 0, expiredOrders: 0 };
  }

  const [expiredPending, expiredOrders] = await Promise.all([
    db.PaymentPendingDeposit.update(
      { status: 'expired' },
      {
        where: {
          userId: uid,
          status: { [Op.in]: ['pending', 'confirming'] },
          [Op.and]: db.sequelize.literal(
            `(provider_metadata->>'packageId')::int = ${pid}`
          )
        }
      }
    ),
    db.DepositOrder.update(
      { status: 'EXPIRED' },
      {
        where: {
          userId: uid,
          status: { [Op.in]: ['PENDING', 'LINK_CREATED'] },
          [Op.and]: db.sequelize.literal(
            `(metadata->>'packageId')::int = ${pid}`
          )
        }
      }
    )
  ]);

  return {
    expiredPending: Array.isArray(expiredPending) ? expiredPending[0] : 0,
    expiredOrders: Array.isArray(expiredOrders) ? expiredOrders[0] : 0
  };
}

/**
 * Count package purchases that consume the per-user limit.
 *
 * - Chime: pending/processing/completed (open Chime still holds a slot)
 * - Card (DepositOrder): SUCCESS only — abandoned PENDING/LINK_CREATED do not count
 * - Standalone PaymentPendingDeposit (e.g. Speed crypto): completed only, and only
 *   when not already represented by a linked DepositOrder (avoids double-counting)
 */
async function countUserPackagePurchases(userId, packageId) {
  const uid = parseInt(userId, 10);
  const pid = parseInt(packageId, 10);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(pid) || pid < 1) {
    return 0;
  }

  const [chimeCount, orderCount, paymentCount] = await Promise.all([
    db.ChimeDepositRequest.count({
      where: {
        userId: uid,
        packageId: pid,
        status: { [Op.in]: CHIME_COUNT_STATUSES }
      }
    }),
    db.DepositOrder.count({
      where: {
        userId: uid,
        status: { [Op.in]: DEPOSIT_ORDER_SUCCESS_STATUSES },
        [Op.and]: db.sequelize.literal(
          `(metadata->>'packageId')::int = ${pid}`
        )
      }
    }),
    db.sequelize.query(
      `SELECT COUNT(*)::int AS cnt
       FROM payment_pending_deposits ppd
       WHERE ppd.user_id = :userId
         AND LOWER(ppd.status) IN ('completed')
         AND (ppd.provider_metadata->>'packageId')::int = :packageId
         AND NOT EXISTS (
           SELECT 1
           FROM deposit_orders o
           WHERE (o.metadata->>'legacyPaymentPendingDepositId') = ppd.id::text
         )`,
      {
        replacements: { userId: uid, packageId: pid },
        type: db.sequelize.QueryTypes.SELECT
      }
    )
  ]);

  const standalonePaymentCount = parseInt(paymentCount?.[0]?.cnt, 10) || 0;
  return chimeCount + orderCount + standalonePaymentCount;
}

/**
 * Completed purchases only (for credit/approve gates).
 * Optionally includes other in-flight Chime requests so a late card success
 * cannot credit while a Chime request for the same package is still open.
 */
async function countCompletedUserPackagePurchases(userId, packageId, {
  excludeChimeRequestId = null,
  includeOtherInFlightChime = false
} = {}) {
  const uid = parseInt(userId, 10);
  const pid = parseInt(packageId, 10);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(pid) || pid < 1) {
    return 0;
  }

  const chimeWhere = {
    userId: uid,
    packageId: pid,
    status: includeOtherInFlightChime
      ? { [Op.in]: ['completed', 'pending', 'processing'] }
      : 'completed'
  };
  const excludeId = excludeChimeRequestId != null ? parseInt(excludeChimeRequestId, 10) : null;
  if (Number.isInteger(excludeId) && excludeId > 0) {
    chimeWhere.id = { [Op.ne]: excludeId };
  }

  const [chimeCount, orderCount, paymentCount] = await Promise.all([
    db.ChimeDepositRequest.count({ where: chimeWhere }),
    db.DepositOrder.count({
      where: {
        userId: uid,
        status: { [Op.in]: DEPOSIT_ORDER_SUCCESS_STATUSES },
        [Op.and]: db.sequelize.literal(
          `(metadata->>'packageId')::int = ${pid}`
        )
      }
    }),
    db.sequelize.query(
      `SELECT COUNT(*)::int AS cnt
       FROM payment_pending_deposits ppd
       WHERE ppd.user_id = :userId
         AND LOWER(ppd.status) IN ('completed')
         AND (ppd.provider_metadata->>'packageId')::int = :packageId
         AND NOT EXISTS (
           SELECT 1
           FROM deposit_orders o
           WHERE (o.metadata->>'legacyPaymentPendingDepositId') = ppd.id::text
         )`,
      {
        replacements: { userId: uid, packageId: pid },
        type: db.sequelize.QueryTypes.SELECT
      }
    )
  ]);

  const standalonePaymentCount = parseInt(paymentCount?.[0]?.cnt, 10) || 0;
  return chimeCount + orderCount + standalonePaymentCount;
}

/**
 * Batch count purchases for many package IDs (catalog filtering).
 * Returns Map<packageId, count>.
 */
async function countUserPackagePurchasesBatch(userId, packageIds) {
  const uid = parseInt(userId, 10);
  const ids = [...new Set(
    (packageIds || [])
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
  const counts = new Map();
  if (!Number.isInteger(uid) || uid < 1 || !ids.length) {
    return counts;
  }

  const idList = ids.join(',');
  const [chimeRows, orderRows, paymentRows] = await Promise.all([
    db.sequelize.query(
      `SELECT package_id AS "packageId", COUNT(*)::int AS cnt
       FROM chime_deposit_requests
       WHERE user_id = :userId
         AND package_id IN (${idList})
         AND LOWER(status) IN ('completed', 'pending', 'processing')
       GROUP BY package_id`,
      { replacements: { userId: uid }, type: db.sequelize.QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `SELECT (metadata->>'packageId')::int AS "packageId", COUNT(*)::int AS cnt
       FROM deposit_orders
       WHERE user_id = :userId
         AND status IN ('SUCCESS')
         AND (metadata->>'packageId')::int IN (${idList})
       GROUP BY (metadata->>'packageId')::int`,
      { replacements: { userId: uid }, type: db.sequelize.QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `SELECT (ppd.provider_metadata->>'packageId')::int AS "packageId", COUNT(*)::int AS cnt
       FROM payment_pending_deposits ppd
       WHERE ppd.user_id = :userId
         AND LOWER(ppd.status) IN ('completed')
         AND (ppd.provider_metadata->>'packageId')::int IN (${idList})
         AND NOT EXISTS (
           SELECT 1
           FROM deposit_orders o
           WHERE (o.metadata->>'legacyPaymentPendingDepositId') = ppd.id::text
         )
       GROUP BY (ppd.provider_metadata->>'packageId')::int`,
      { replacements: { userId: uid }, type: db.sequelize.QueryTypes.SELECT }
    )
  ]);

  ids.forEach((id) => counts.set(id, 0));
  for (const rows of [chimeRows, orderRows, paymentRows]) {
    for (const row of rows || []) {
      const pid = parseInt(row.packageId, 10);
      if (!Number.isInteger(pid)) continue;
      counts.set(pid, (counts.get(pid) || 0) + (parseInt(row.cnt, 10) || 0));
    }
  }
  return counts;
}

module.exports = {
  CHIME_COUNT_STATUSES,
  DEPOSIT_ORDER_SUCCESS_STATUSES,
  PAYMENT_PENDING_COMPLETED_STATUSES,
  releaseAbandonedPackageCardCheckouts,
  countUserPackagePurchases,
  countCompletedUserPackagePurchases,
  countUserPackagePurchasesBatch
};
