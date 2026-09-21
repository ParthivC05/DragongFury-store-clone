'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { Op } = require('sequelize');

/** Require master_admin or distributor_admin. Distributor admin sees only their distributor's subscriptions. */
function requireSubscriptionsAccess(req) {
  if (req.role === ROLES.MASTER_ADMIN) return;
  if (req.role === ROLES.DISTRIBUTOR_ADMIN && req.distributorCode) return;
  const err = new Error('Forbidden. Master or distributor admin only.');
  err.statusCode = 403;
  throw err;
}

/** List subscriptions: master_admin sees all (optional filter by distributorCode); distributor_admin sees only their distributor; store_admin sees only their distributor's active plans (for request flow). */
async function list(req, res) {
  try {
    const query = req.query || {};
    const where = {};

    if (req.role === ROLES.STORE_ADMIN) {
      if (!req.distributorCode) return sendError(res, 'Store context is missing.', 400);
      where.distributorCode = req.distributorCode;
      where.isActive = true;
    } else {
      requireSubscriptionsAccess(req);
      if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
        where.distributorCode = req.distributorCode;
      } else if (query.distributorCode) {
        where.distributorCode = String(query.distributorCode).trim();
      }
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { rows: list, count: total } = await db.Subscription.findAndCountAll({
      where,
      order: [['name', 'ASC']],
      limit,
      offset
    });

    sendSuccess(res, { list: list.map((s) => s.toJSON()), total, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to list subscriptions', err.statusCode || 500);
  }
}

/** Get one subscription. */
async function get(req, res) {
  try {
    requireSubscriptionsAccess(req);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid subscription id', 400);

    const subscription = await db.Subscription.findByPk(id);
    if (!subscription) return sendError(res, 'Subscription not found', 404);
    if (req.role === ROLES.DISTRIBUTOR_ADMIN && subscription.distributorCode !== req.distributorCode) {
      return sendError(res, 'Forbidden', 403);
    }

    sendSuccess(res, subscription.toJSON());
  } catch (err) {
    sendError(res, err.message || 'Failed to get subscription', err.statusCode || 500);
  }
}

const BILLING_TYPES = ['flat', 'percentage'];
const PERCENTAGE_BASES = ['game_bot_deposit', 'game_bot_net_profit'];

/** Validate and normalize billing fields for create/update. */
function parseBillingFields(body) {
  const billingType = body.billingType != null ? String(body.billingType).trim().toLowerCase() : 'flat';
  if (!BILLING_TYPES.includes(billingType)) return { error: 'billingType must be flat or percentage' };
  const out = { billingType };
  if (billingType === 'flat') {
    const raw = body.flatAmountCents;
    out.flatAmountCents = raw != null ? Math.max(0, parseInt(raw, 10) || 0) : null;
    out.percentageValue = null;
    out.percentageBase = null;
  } else {
    const pct = body.percentageValue != null ? parseFloat(body.percentageValue) : null;
    if (pct == null || isNaN(pct) || pct < 0 || pct > 100) return { error: 'percentageValue must be between 0 and 100' };
    out.percentageValue = pct;
    const base = body.percentageBase != null ? String(body.percentageBase).trim().toLowerCase() : null;
    if (!PERCENTAGE_BASES.includes(base)) return { error: 'percentageBase must be game_bot_deposit or game_bot_net_profit' };
    out.percentageBase = base;
    out.flatAmountCents = null;
  }
  return out;
}

/** Create subscription. Distributor admin creates under their distributor. */
async function create(req, res) {
  try {
    requireSubscriptionsAccess(req);
    const { name, description, priceDisplay, durationMonths, isActive } = req.body || {};
    const nameTrim = name != null ? String(name).trim() : '';
    if (!nameTrim) return sendError(res, 'Name is required', 400);

    const billing = parseBillingFields(req.body || {});
    if (billing.error) return sendError(res, billing.error, 400);

    let distributorCode;
    if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
      distributorCode = req.distributorCode;
      if (!distributorCode) return sendError(res, 'Your distributor account has no distributor code.', 400);
    } else {
      const raw = req.body.distributorCode;
      distributorCode = raw != null ? String(raw).trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64) : '';
      if (!distributorCode) return sendError(res, 'Distributor code is required.', 400);
      const exists = await db.User.findOne({
        where: { role: ROLES.DISTRIBUTOR_ADMIN, distributorCode, isActive: true },
        attributes: ['userId']
      });
      if (!exists) return sendError(res, 'Distributor not found or inactive.', 400);
    }

    const duration = Math.max(1, parseInt(durationMonths, 10) || 1);
    const subscription = await db.Subscription.create({
      distributorCode,
      name: nameTrim,
      description: description != null ? String(description).trim() : null,
      priceDisplay: priceDisplay != null ? String(priceDisplay).trim() : null,
      durationMonths: duration,
      isActive: isActive !== false,
      billingType: billing.billingType,
      flatAmountCents: billing.flatAmountCents,
      percentageValue: billing.percentageValue,
      percentageBase: billing.percentageBase
    });

    sendSuccess(res, subscription.toJSON(), 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create subscription', err.statusCode || 500);
  }
}

/** Update subscription. */
async function update(req, res) {
  try {
    requireSubscriptionsAccess(req);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid subscription id', 400);

    const subscription = await db.Subscription.findByPk(id);
    if (!subscription) return sendError(res, 'Subscription not found', 404);
    if (req.role === ROLES.DISTRIBUTOR_ADMIN && subscription.distributorCode !== req.distributorCode) {
      return sendError(res, 'Forbidden', 403);
    }

    const { name, description, priceDisplay, durationMonths, isActive } = req.body || {};
    if (name !== undefined) subscription.name = String(name).trim() || subscription.name;
    if (description !== undefined) subscription.description = description != null ? String(description).trim() : null;
    if (priceDisplay !== undefined) subscription.priceDisplay = priceDisplay != null ? String(priceDisplay).trim() : null;
    if (durationMonths !== undefined) subscription.durationMonths = Math.max(1, parseInt(durationMonths, 10) || 1);
    if (typeof isActive === 'boolean') subscription.isActive = isActive;

    if (req.body && (req.body.billingType != null || req.body.flatAmountCents != null || req.body.percentageValue != null || req.body.percentageBase != null)) {
      const billing = parseBillingFields(req.body);
      if (billing.error) return sendError(res, billing.error, 400);
      subscription.billingType = billing.billingType;
      subscription.flatAmountCents = billing.flatAmountCents;
      subscription.percentageValue = billing.percentageValue;
      subscription.percentageBase = billing.percentageBase;
    }

    await subscription.save();
    sendSuccess(res, subscription.toJSON());
  } catch (err) {
    sendError(res, err.message || 'Failed to update subscription', err.statusCode || 500);
  }
}

/** Delete subscription. */
async function remove(req, res) {
  try {
    requireSubscriptionsAccess(req);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid subscription id', 400);

    const subscription = await db.Subscription.findByPk(id);
    if (!subscription) return sendError(res, 'Subscription not found', 404);
    if (req.role === ROLES.DISTRIBUTOR_ADMIN && subscription.distributorCode !== req.distributorCode) {
      return sendError(res, 'Forbidden', 403);
    }

    const inUse = await db.StoreSubscription.findOne({
      where: { subscriptionId: id, status: 'active' }
    });
    if (inUse) return sendError(res, 'Cannot delete subscription that is currently active for a store.', 400);

    await subscription.destroy();
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendError(res, err.message || 'Failed to delete subscription', err.statusCode || 500);
  }
}

/** Get current active subscription for a store.
 * - Store admin: uses their own distributorCode + storeCode.
 * - Distributor/Master admin: optional query storeId (userId of store admin) to get that store's current subscription.
 */
async function getCurrent(req, res) {
  try {
    let distributorCode, storeCode;
    if (req.role === ROLES.STORE_ADMIN) {
      distributorCode = req.distributorCode;
      storeCode = req.storeCode;
      if (!distributorCode || !storeCode) return sendError(res, 'Store context is missing.', 400);
    } else if (req.role === ROLES.DISTRIBUTOR_ADMIN || req.role === ROLES.MASTER_ADMIN) {
      const storeId = parseInt(req.query.storeId, 10);
      if (!storeId) return sendError(res, 'storeId is required for distributor/master admin.', 400);
      const storeUser = await db.User.findOne({
        where: { userId: storeId, role: ROLES.STORE_ADMIN },
        attributes: ['distributorCode', 'storeCode']
      });
      if (!storeUser) return sendError(res, 'Store not found.', 404);
      if (req.role === ROLES.DISTRIBUTOR_ADMIN && storeUser.distributorCode !== req.distributorCode) {
        return sendError(res, 'Forbidden', 403);
      }
      distributorCode = storeUser.distributorCode;
      storeCode = storeUser.storeCode;
    } else {
      return sendError(res, 'Forbidden', 403);
    }

    const now = new Date();
    const [active, allStoreSubs] = await Promise.all([
      db.StoreSubscription.findOne({
        where: {
          distributorCode,
          storeCode,
          status: 'active',
          [Op.and]: [
            { startsAt: { [Op.lte]: now } },
            { endsAt: { [Op.gte]: now } }
          ]
        },
        include: [{ model: db.Subscription, as: 'Subscription', attributes: ['id', 'name', 'description', 'priceDisplay', 'durationMonths', 'billingType', 'flatAmountCents', 'percentageValue', 'percentageBase'] }],
        order: [['endsAt', 'DESC']]
      }),
      db.StoreSubscription.findAll({
        where: { distributorCode, storeCode },
        include: [{ model: db.Subscription, as: 'Subscription', attributes: ['id', 'name', 'priceDisplay', 'durationMonths'] }],
        order: [['startsAt', 'DESC']]
      })
    ]);

    const subscriptionHistory = (allStoreSubs || []).map((ss) => {
      const row = ss.toJSON();
      const plan = row.Subscription;
      return {
        id: row.id,
        subscriptionId: row.subscriptionId,
        planName: plan ? plan.name : null,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        status: row.status,
        isExtended: !!row.extendedAt
      };
    });

    if (!active) {
      return sendSuccess(res, { active: null, subscription: null, summary: null, subscriptionHistory });
    }

    const j = active.toJSON();
    const subscription = j.Subscription ? { ...j.Subscription } : null;
    if (j.Subscription) delete j.Subscription;

    const start = new Date(j.startsAt).getTime();
    const end = new Date(j.endsAt).getTime();
    const totalDays = Math.max(0, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
    const daysUsed = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start) / (24 * 60 * 60 * 1000))));
    const daysRemaining = Math.max(0, Math.ceil((end - now.getTime()) / (24 * 60 * 60 * 1000)));
    const summary = {
      totalDays,
      daysUsed,
      daysRemaining,
      isExtended: !!j.extendedAt
    };

    sendSuccess(res, { active: j, subscription, summary, subscriptionHistory });
  } catch (err) {
    sendError(res, err.message || 'Failed to get current subscription', err.statusCode || 500);
  }
}

module.exports = { list, get, create, update, remove, getCurrent };
