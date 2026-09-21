'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const dollarpay = require('../paymentProviders/dollarpay/dollarpay.client');
const { completeDepositFromDollarpay } = require('./completeDepositFromDollarpay.service');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');
const {
  AUTO_EXPIRE_MS,
  EXPIRED_POLL_MAX_AGE_MS,
  ACTIVE_ORDER_STATUSES,
  EXPIRED_ORDER_STATUS
} = require('./syncProcessingDollarpayDeposits.service');

const PROVIDER = 'dollarpay';

/**
 * Query DollarPay for this user's recent open deposits and credit / fail / expire as needed.
 * Credentials come from store frontend headers (same as payin).
 *
 * Aligns with cron rules:
 * - Poll PENDING/LINK_CREATED and EXPIRED only within last 24h
 * - Do not mark EXPIRED until unpaid past 3 hours (final provider check first)
 *
 * @param {number} userId
 * @param {{ merchantId: string, apiKey: string }} creds
 * @returns {Promise<{ processed: number, errors: Array, depositRefresh: Array }>}
 */
async function syncDollarpayDeposits(userId, creds) {
  const result = { processed: 0, errors: [], depositRefresh: [] };
  if (!creds?.merchantId || !creds?.apiKey) return result;

  const now = Date.now();
  const expiredMinCreatedAt = new Date(now - EXPIRED_POLL_MAX_AGE_MS);

  const openOrders = await db.DepositOrder.findAll({
    where: {
      userId,
      provider: PROVIDER,
      created_at: { [Op.gte]: expiredMinCreatedAt },
      [Op.or]: [
        { status: { [Op.in]: ACTIVE_ORDER_STATUSES } },
        { status: EXPIRED_ORDER_STATUS }
      ]
    },
    order: [['created_at', 'DESC']],
    limit: 40
  });

  for (const order of openOrders) {
    const outerOrderSn = String(order.paymentLinkToken || '').trim();
    if (!outerOrderSn) continue;

    const meta = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
    const merchantId = String(meta.merchantId || creds.merchantId).trim();
    const createdRaw = order.createdAt || order.get?.('created_at') || order.dataValues?.created_at;
    const createdMs = new Date(createdRaw).getTime();
    const ageMs = Number.isFinite(createdMs) ? now - createdMs : 0;
    const pastAutoExpire = ageMs >= AUTO_EXPIRE_MS;
    const statusUpper = String(order.status || '').toUpperCase();
    const isAlreadyExpired = statusUpper === EXPIRED_ORDER_STATUS;

    try {
      const data = await dollarpay.queryPayin({
        merchantId,
        apiKey: creds.apiKey,
        outerOrderSn
      });
      const payStatus = String(data?.pay_status ?? '').trim();
      const transactionId = String(data?.transaction_id || outerOrderSn).trim();
      const amount = Number(data?.amount ?? data?.primary_amount ?? order.requestedAmount);

      if (payStatus === '1') {
        const credited = await completeDepositFromDollarpay({
          userId,
          amount: Number(order.requestedAmount),
          transactionId,
          outerOrderSn,
          paymentType: meta.paymentType || 'cashapp'
        });
        if (!credited?.alreadyProcessed) result.processed += 1;
        result.depositRefresh.push({
          depositId: order.id,
          status: 'completed',
          amount: amount != null ? String(amount) : null,
          method: meta.paymentType || null,
          createdAt: null,
          feeCharged: null
        });
        continue;
      }

      if (payStatus === '4' || payStatus === '5') {
        await order.update({ status: 'FAILED', lastSyncedAt: new Date() });
        await db.PaymentPendingDeposit.update(
          { status: 'failed' },
          { where: { provider: PROVIDER, providerSessionId: outerOrderSn, status: { [Op.in]: ['pending', 'expired'] } } }
        ).catch(() => {});
        result.depositRefresh.push({
          depositId: order.id,
          status: 'failed',
          amount: amount != null ? String(amount) : null,
          method: meta.paymentType || null,
          createdAt: null,
          feeCharged: null
        });
        continue;
      }

      // Unpaid / processing
      if (!isAlreadyExpired && pastAutoExpire) {
        await order.update({
          status: EXPIRED_ORDER_STATUS,
          lastSyncedAt: new Date(),
          syncAttemptCount: (order.syncAttemptCount || 0) + 1
        });
        await db.PaymentPendingDeposit.update(
          { status: 'expired' },
          { where: { provider: PROVIDER, providerSessionId: outerOrderSn, status: { [Op.in]: ['pending', 'expired'] } } }
        ).catch(() => {});
        result.depositRefresh.push({
          depositId: order.id,
          status: 'expired',
          amount: null,
          method: meta.paymentType || null,
          createdAt: null,
          feeCharged: null
        });
        continue;
      }

      // Still awaiting payment (incl. legacy EXPIRED rows inside the 3h window).
      result.depositRefresh.push({
        depositId: order.id,
        status: pastAutoExpire ? 'expired' : 'pending',
        amount: null,
        method: meta.paymentType || null,
        createdAt: null,
        feeCharged: null
      });
    } catch (err) {
      paymentErrorLog('syncDollarpayDeposits query failed', outerOrderSn, err.message);
      result.errors.push({ transactionId: outerOrderSn, message: err.message || 'DollarPay query failed.' });
      result.depositRefresh.push({
        depositId: order.id,
        status: isAlreadyExpired ? 'expired' : null,
        amount: null,
        method: null,
        createdAt: null,
        feeCharged: null
      });
    }
  }

  paymentLog('syncDollarpayDeposits done', {
    userId,
    open: openOrders.length,
    processed: result.processed,
    errors: result.errors.length
  });
  return result;
}

module.exports = { syncDollarpayDeposits };
