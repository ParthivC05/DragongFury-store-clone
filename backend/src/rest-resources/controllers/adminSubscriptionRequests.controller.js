'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { Op } = require('sequelize');
const { getStoreAdminEmails } = require('../../services/subscriptionNotifications/getStoreAdminEmails.service');
const { sendSubscriptionActivatedEmail } = require('../../utils/email');
const { createLogger } = require('../../libs/logger');
const {
  getStoreSubscriptionBillingMetrics,
  calculatePercentageAmount
} = require('../../services/subscription/getStoreSubscriptionBillingMetrics.service');

const logger = createLogger('adminSubscriptionRequests');

/** List subscription requests.
 * - Distributor admin: requests for stores under their distributor (optional status filter).
 * - Store admin: requests for their store only.
 */
async function list(req, res) {
  try {
    const query = req.query || {};
    const where = {};

    if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
      where.distributorCode = req.distributorCode;
    } else if (req.role === ROLES.STORE_ADMIN) {
      if (!can(req, STORE_FEATURE_KEYS.SUBSCRIPTION)) {
        return sendError(res, 'You do not have access to Subscriptions.', 403);
      }
      where.distributorCode = req.distributorCode;
      where.storeCode = req.storeCode;
    } else if (req.role === ROLES.MASTER_ADMIN) {
      if (query.distributorCode) where.distributorCode = String(query.distributorCode).trim();
      if (query.storeCode) where.storeCode = String(query.storeCode).trim();
    } else {
      return sendError(res, 'Forbidden', 403);
    }

    if (query.status) where.status = String(query.status).trim();

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { rows: list, count: total } = await db.StoreSubscriptionRequest.findAndCountAll({
      where,
      include: [
        {
          model: db.Subscription,
          as: 'Subscription',
          attributes: ['id', 'name', 'priceDisplay', 'durationMonths', 'billingType', 'flatAmountCents', 'percentageValue', 'percentageBase']
        }
      ],
      order: [['requestedAt', 'DESC']],
      limit,
      offset
    });

    const now = new Date();
    const listJson = list.map((r) => {
      const j = r.toJSON();
      if (j.Subscription) {
        j.subscriptionName = j.Subscription.name;
        j.subscriptionPriceDisplay = j.Subscription.priceDisplay;
        j.subscriptionDurationMonths = j.Subscription.durationMonths;
        j.subscriptionBillingType = j.Subscription.billingType;
        j.subscriptionFlatAmountCents = j.Subscription.flatAmountCents;
        j.subscriptionPercentageValue = j.Subscription.percentageValue;
        j.subscriptionPercentageBase = j.Subscription.percentageBase;
        delete j.Subscription;
      }
      if (j.status === 'approved' && j.approvedPeriodStartsAt && j.approvedPeriodEndsAt) {
        const start = new Date(j.approvedPeriodStartsAt).getTime();
        const end = new Date(j.approvedPeriodEndsAt).getTime();
        const totalDays = Math.max(0, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
        j.approvedPlanUsage = {
          startsAt: j.approvedPeriodStartsAt,
          endsAt: j.approvedPeriodEndsAt,
          totalDays,
          isCurrent: now.getTime() >= start && now.getTime() <= end,
          daysRemaining: Math.max(0, Math.ceil((end - now.getTime()) / (24 * 60 * 60 * 1000))),
          daysUsed: Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start) / (24 * 60 * 60 * 1000))))
        };
      } else {
        j.approvedPlanUsage = null;
      }
      return j;
    });

    if (listJson.length > 0 && (req.role === ROLES.DISTRIBUTOR_ADMIN || req.role === ROLES.MASTER_ADMIN)) {
      const pairs = [...new Set(listJson.map((r) => `${r.distributorCode}:${r.storeCode}`))];
      const now = new Date();
      const storeSubs = await db.StoreSubscription.findAll({
        where: {
          status: 'active',
          [Op.and]: [
            { startsAt: { [Op.lte]: now } },
            { endsAt: { [Op.gte]: now } }
          ]
        },
        include: [{ model: db.Subscription, as: 'Subscription', attributes: ['id', 'name'] }]
      });
      const mapByStore = {};
      for (const ss of storeSubs) {
        const key = `${ss.distributorCode}:${ss.storeCode}`;
        const start = new Date(ss.startsAt).getTime();
        const end = new Date(ss.endsAt).getTime();
        const totalDays = Math.max(0, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
        const daysUsed = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start) / (24 * 60 * 60 * 1000))));
        const daysRemaining = Math.max(0, Math.ceil((end - now.getTime()) / (24 * 60 * 60 * 1000)));
        mapByStore[key] = {
          planName: ss.Subscription ? ss.Subscription.name : null,
          endsAt: ss.endsAt,
          daysRemaining,
          daysUsed,
          totalDays,
          isExtended: !!ss.extendedAt
        };
      }
      for (const j of listJson) {
        const key = `${j.distributorCode}:${j.storeCode}`;
        j.currentPlanSummary = mapByStore[key] || null;
      }
    }

    // Billing preview for percentage plans: only for dist_admin (not master_admin)
    if (listJson.length > 0 && req.role === ROLES.DISTRIBUTOR_ADMIN) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = endDate.toISOString().slice(0, 10);
      for (const j of listJson) {
        if (j.subscriptionBillingType !== 'percentage') {
          j.billingPreview = null;
          continue;
        }
        try {
          const metrics = await getStoreSubscriptionBillingMetrics({
            distributorCode: j.distributorCode,
            storeCode: j.storeCode,
            startDate: startStr,
            endDate: endStr
          });
          const plan = {
            billingType: 'percentage',
            percentageValue: j.subscriptionPercentageValue,
            percentageBase: j.subscriptionPercentageBase
          };
          const calculatedAmount = calculatePercentageAmount(
            plan,
            metrics.gameBotDeposit,
            metrics.gameBotNetProfit
          );
          j.billingPreview = {
            gameBotDeposit: metrics.gameBotDeposit,
            gameBotWithdraw: metrics.gameBotWithdraw,
            gameBotNetProfit: metrics.gameBotNetProfit,
            periodStart: startStr,
            periodEnd: endStr,
            calculatedAmount: Math.round(calculatedAmount * 100) / 100,
            percentageValue: j.subscriptionPercentageValue,
            percentageBase: j.subscriptionPercentageBase
          };
        } catch (err) {
          logger.warn({ err: err.message, requestId: j.id }, 'Billing preview failed');
          j.billingPreview = null;
        }
      }
    }

    sendSuccess(res, { list: listJson, total, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to list subscription requests', err.statusCode || 500);
  }
}

/** Create a subscription request (store admin only). Manual process: store requests to buy/upgrade; no payment. */
async function create(req, res) {
  try {
    if (req.role !== ROLES.STORE_ADMIN) {
      return sendError(res, 'Only store admins can request a subscription.', 403);
    }
    if (!can(req, STORE_FEATURE_KEYS.SUBSCRIPTION)) {
      return sendError(res, 'You do not have access to Subscriptions.', 403);
    }
    if (!req.distributorCode || !req.storeCode) {
      return sendError(res, 'Store context is missing.', 400);
    }

    const subscriptionId = parseInt(req.body?.subscriptionId, 10);
    if (!subscriptionId) return sendError(res, 'Subscription is required.', 400);

    const subscription = await db.Subscription.findByPk(subscriptionId);
    if (!subscription || !subscription.isActive) return sendError(res, 'Subscription not found or inactive.', 404);
    if (subscription.distributorCode !== req.distributorCode) {
      return sendError(res, 'This subscription is not available for your distributor.', 403);
    }

    const pending = await db.StoreSubscriptionRequest.findOne({
      where: {
        distributorCode: req.distributorCode,
        storeCode: req.storeCode,
        status: 'pending'
      }
    });
    if (pending) return sendError(res, 'You already have a pending subscription request. Wait for approval or cancel it first.', 400);

    const request = await db.StoreSubscriptionRequest.create({
      distributorCode: req.distributorCode,
      storeCode: req.storeCode,
      subscriptionId,
      status: 'pending',
      requestedAt: new Date(),
      requestedByUserId: req.user?.userId || null,
      notes: req.body?.notes != null ? String(req.body.notes).trim() : null
    });

    const withSub = await db.StoreSubscriptionRequest.findByPk(request.id, {
      include: [{ model: db.Subscription, as: 'Subscription', attributes: ['id', 'name', 'priceDisplay', 'durationMonths'] }]
    });
    const j = withSub.toJSON();
    if (j.Subscription) {
      j.subscriptionName = j.Subscription.name;
      j.subscriptionPriceDisplay = j.Subscription.priceDisplay;
      j.subscriptionDurationMonths = j.Subscription.durationMonths;
      delete j.Subscription;
    }
    sendSuccess(res, j, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create subscription request', err.statusCode || 500);
  }
}

/** Approve a subscription request (distributor admin or master admin). Manually activates the subscription for the store. */
async function approve(req, res) {
  try {
    if (req.role !== ROLES.DISTRIBUTOR_ADMIN && req.role !== ROLES.MASTER_ADMIN) {
      return sendError(res, 'Only distributor or master admin can approve requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const subRequest = await db.StoreSubscriptionRequest.findByPk(id, {
      include: [{ model: db.Subscription, as: 'Subscription' }]
    });
    if (!subRequest) return sendError(res, 'Request not found', 404);
    if (subRequest.status !== 'pending') return sendError(res, 'Request is not pending.', 400);
    if (req.role === ROLES.DISTRIBUTOR_ADMIN && subRequest.distributorCode !== req.distributorCode) {
      return sendError(res, 'Forbidden', 403);
    }

    const subscription = subRequest.Subscription;
    if (!subscription) return sendError(res, 'Subscription not found', 404);

    const sequelize = db.sequelize;
    const durationMonths = subscription.durationMonths || 1;

    const currentActive = await db.StoreSubscription.findOne({
      where: {
        distributorCode: subRequest.distributorCode,
        storeCode: subRequest.storeCode,
        status: 'active'
      },
      order: [['endsAt', 'DESC']]
    });

    const isRenewal = currentActive && currentActive.subscriptionId === subscription.id;
    let activatedStartsAt;
    let activatedEndsAt;
    if (isRenewal) {
      activatedStartsAt = new Date(currentActive.startsAt);
      activatedEndsAt = new Date(currentActive.endsAt);
      activatedEndsAt.setMonth(activatedEndsAt.getMonth() + durationMonths);
    } else {
      const now = new Date();
      activatedStartsAt = now;
      activatedEndsAt = new Date(now);
      activatedEndsAt.setMonth(activatedEndsAt.getMonth() + durationMonths);
    }

    await sequelize.transaction(async (t) => {
      subRequest.status = 'approved';
      subRequest.approvedByUserId = req.user?.userId || null;
      subRequest.approvedAt = new Date();
      subRequest.approvedPeriodStartsAt = activatedStartsAt;
      subRequest.approvedPeriodEndsAt = activatedEndsAt;
      if (req.body?.notes != null) subRequest.notes = String(req.body.notes).trim();
      await subRequest.save({ transaction: t });

      if (isRenewal) {
        await db.StoreSubscription.update(
          { endsAt: activatedEndsAt, extendedAt: new Date() },
          {
            where: { id: currentActive.id },
            transaction: t
          }
        );
      } else {
        const now = new Date();
        if (currentActive) {
          const previousRequest = await db.StoreSubscriptionRequest.findOne({
            where: {
              distributorCode: subRequest.distributorCode,
              storeCode: subRequest.storeCode,
              status: 'approved',
              subscriptionId: currentActive.subscriptionId,
              id: { [Op.ne]: subRequest.id }
            },
            order: [['approvedAt', 'DESC']],
            transaction: t
          });
          if (previousRequest) {
            previousRequest.approvedPeriodEndsAt = now;
            await previousRequest.save({ transaction: t });
          }
          await db.StoreSubscription.update(
            { status: 'expired' },
            {
              where: {
                distributorCode: subRequest.distributorCode,
                storeCode: subRequest.storeCode,
                status: 'active'
              },
              transaction: t
            }
          );
        }
        await db.StoreSubscription.create(
          {
            distributorCode: subRequest.distributorCode,
            storeCode: subRequest.storeCode,
            subscriptionId: subscription.id,
            startsAt: activatedStartsAt,
            endsAt: activatedEndsAt,
            status: 'active'
          },
          { transaction: t }
        );
      }
    });

    const updated = await db.StoreSubscriptionRequest.findByPk(id, {
      include: [{ model: db.Subscription, as: 'Subscription', attributes: ['id', 'name', 'priceDisplay', 'durationMonths'] }]
    });
    const j = updated.toJSON();
    if (j.Subscription) {
      j.subscriptionName = j.Subscription.name;
      delete j.Subscription;
    }

    try {
      const emails = await getStoreAdminEmails(subRequest.distributorCode, subRequest.storeCode);
      for (const email of emails) {
        await sendSubscriptionActivatedEmail(email, {
          planName: subscription.name,
          endsAt: activatedEndsAt,
          isRenewal,
          startsAt: activatedStartsAt
        });
      }
    } catch (emailErr) {
      logger.warn({ err: emailErr.message, storeCode: subRequest.storeCode }, 'Subscription activated email not sent');
    }

    sendSuccess(res, j);
  } catch (err) {
    sendError(res, err.message || 'Failed to approve request', err.statusCode || 500);
  }
}

/** Reject a subscription request (distributor admin or master admin). */
async function reject(req, res) {
  try {
    if (req.role !== ROLES.DISTRIBUTOR_ADMIN && req.role !== ROLES.MASTER_ADMIN) {
      return sendError(res, 'Only distributor or master admin can reject requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const subRequest = await db.StoreSubscriptionRequest.findByPk(id);
    if (!subRequest) return sendError(res, 'Request not found', 404);
    if (subRequest.status !== 'pending') return sendError(res, 'Request is not pending.', 400);
    if (req.role === ROLES.DISTRIBUTOR_ADMIN && subRequest.distributorCode !== req.distributorCode) {
      return sendError(res, 'Forbidden', 403);
    }

    subRequest.status = 'rejected';
    subRequest.approvedByUserId = req.user?.userId || null;
    subRequest.approvedAt = new Date();
    if (req.body?.notes != null) subRequest.notes = String(req.body.notes).trim();
    await subRequest.save();

    sendSuccess(res, subRequest.toJSON());
  } catch (err) {
    sendError(res, err.message || 'Failed to reject request', err.statusCode || 500);
  }
}

/** Cancel (delete) a pending subscription request. Store admin only, only for their store. */
async function cancel(req, res) {
  try {
    if (req.role !== ROLES.STORE_ADMIN) {
      return sendError(res, 'Only store admins can cancel their subscription requests.', 403);
    }
    if (!can(req, STORE_FEATURE_KEYS.SUBSCRIPTION)) {
      return sendError(res, 'You do not have access to Subscriptions.', 403);
    }
    if (!req.distributorCode || !req.storeCode) {
      return sendError(res, 'Store context is missing.', 400);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const subRequest = await db.StoreSubscriptionRequest.findByPk(id);
    if (!subRequest) return sendError(res, 'Request not found', 404);
    if (subRequest.status !== 'pending') return sendError(res, 'Only pending requests can be cancelled.', 400);
    if (subRequest.distributorCode !== req.distributorCode || subRequest.storeCode !== req.storeCode) {
      return sendError(res, 'Forbidden', 403);
    }

    await subRequest.destroy();
    sendSuccess(res, { cancelled: true, id });
  } catch (err) {
    sendError(res, err.message || 'Failed to cancel request', err.statusCode || 500);
  }
}

module.exports = { list, create, approve, reject, cancel };
