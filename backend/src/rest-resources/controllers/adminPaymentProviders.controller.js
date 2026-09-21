'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { PROVIDER_META } = require('../../services/payments/depositMethods.service');
const { getPaymentTypeLabel } = require('../../constants/paymentTypes');
const { getPaymentProviderDisplayLabel } = require('../../constants/paymentProviderLabels');

const LIST_ATTRIBUTES = ['id', 'code', 'name', 'isActive', 'supportsDeposit', 'supportsWithdraw', 'depositEnabled', 'withdrawEnabled', 'displayOrder', 'depositMethodsEnabled', 'withdrawMethodsEnabled'];

function withAdminDisplayName(row) {
  const code = (row.code || '').toString().toLowerCase();
  row.name = getPaymentProviderDisplayLabel(code, row.name);
  return row;
}

/**
 * GET /api/admin/payment-providers
 * List all payment providers (including inactive). Master admin only.
 * Each provider includes supportedPaymentTypes (from meta) and depositMethodsEnabled, withdrawMethodsEnabled (from DB).
 */
async function listPaymentProviders(req, res) {
  try {
    const providers = await db.PaymentProvider.findAll({
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      attributes: LIST_ATTRIBUTES
    });
    const list = (providers || []).map((p) => {
      const row = p.toJSON();
      const code = (row.code || '').toString().toLowerCase();
      const meta = PROVIDER_META[code] || {};
      const supported = Array.isArray(meta.supportedPaymentTypes) ? meta.supportedPaymentTypes : [];
      const withdrawTypes = Array.isArray(meta.supportedWithdrawPaymentTypes) ? meta.supportedWithdrawPaymentTypes : supported;
      row.supportedPaymentTypes = supported.map((key) => ({
        key,
        label: getPaymentTypeLabel(key),
        supportsWithdraw: withdrawTypes.includes(key)
      }));
      return withAdminDisplayName(row);
    });
    sendSuccess(res, { list, total: list.length });
  } catch (err) {
    sendError(res, err.message || 'Failed to list payment providers', err.statusCode || 500);
  }
}

/**
 * PATCH /api/admin/payment-providers/:providerCode/status
 * Body: { isActive?, supportsDeposit?, supportsWithdraw?, depositEnabled?, withdrawEnabled?, depositMethodsEnabled?, withdrawMethodsEnabled? }.
 * depositMethodsEnabled / withdrawMethodsEnabled: object of payment type key -> boolean (e.g. { card: true, apple_pay: false }). Master admin only.
 */
async function updateProviderStatus(req, res) {
  try {
    const providerCode = (req.params.providerCode || '').toString().trim().toLowerCase();
    if (!providerCode) return sendError(res, 'Provider code is required', 400);

    const updates = {};
    if (typeof req.body?.isActive === 'boolean') updates.isActive = req.body.isActive;
    if (typeof req.body?.supportsDeposit === 'boolean') updates.supportsDeposit = req.body.supportsDeposit;
    if (typeof req.body?.supportsWithdraw === 'boolean') updates.supportsWithdraw = req.body.supportsWithdraw;
    if (typeof req.body?.depositEnabled === 'boolean') updates.depositEnabled = req.body.depositEnabled;
    if (typeof req.body?.withdrawEnabled === 'boolean') updates.withdrawEnabled = req.body.withdrawEnabled;
    if (req.body?.depositMethodsEnabled != null && typeof req.body.depositMethodsEnabled === 'object' && !Array.isArray(req.body.depositMethodsEnabled)) {
      updates.depositMethodsEnabled = req.body.depositMethodsEnabled;
    }
    if (req.body?.withdrawMethodsEnabled != null && typeof req.body.withdrawMethodsEnabled === 'object' && !Array.isArray(req.body.withdrawMethodsEnabled)) {
      updates.withdrawMethodsEnabled = req.body.withdrawMethodsEnabled;
    }
    if (Object.keys(updates).length === 0) {
      return sendError(res, 'Body must include at least one of: isActive, supportsDeposit, supportsWithdraw, depositEnabled, withdrawEnabled, depositMethodsEnabled, withdrawMethodsEnabled', 400);
    }

    const provider = await db.PaymentProvider.findOne({
      where: { code: providerCode },
      attributes: LIST_ATTRIBUTES
    });
    if (!provider) return sendError(res, 'Payment provider not found', 404);

    if (updates.supportsDeposit === false) updates.depositEnabled = false;
    if (updates.supportsWithdraw === false) updates.withdrawEnabled = false;

    await provider.update(updates);
    const out = provider.toJSON();
    const meta = PROVIDER_META[providerCode] || {};
    const supported = meta.supportedPaymentTypes || [];
    const withdrawTypes = Array.isArray(meta.supportedWithdrawPaymentTypes) ? meta.supportedWithdrawPaymentTypes : supported;
    out.supportedPaymentTypes = supported.map((key) => ({
      key,
      label: getPaymentTypeLabel(key),
      supportsWithdraw: withdrawTypes.includes(key)
    }));
    sendSuccess(res, withAdminDisplayName(out));
  } catch (err) {
    sendError(res, err.message || 'Failed to update provider status', err.statusCode || 500);
  }
}

/**
 * PUT /api/admin/payment-providers/reorder
 * Body: { orderedCodes: string[] }. Master admin only. Sets display_order by array index.
 */
async function reorderPaymentProviders(req, res) {
  try {
    const orderedCodes = req.body?.orderedCodes;
    if (!Array.isArray(orderedCodes) || orderedCodes.length === 0) {
      return sendError(res, 'Body must include orderedCodes (non-empty array of provider codes)', 400);
    }
    const normalized = orderedCodes.map((c) => (c != null && typeof c === 'string' ? c.trim().toLowerCase() : '')).filter(Boolean);
    if (normalized.length === 0) return sendError(res, 'orderedCodes must contain at least one valid provider code', 400);

    const providers = await db.PaymentProvider.findAll({ where: { code: normalized }, attributes: ['id', 'code'] });
    const byCode = new Map(providers.map((p) => [p.code, p]));
    for (let i = 0; i < normalized.length; i++) {
      const p = byCode.get(normalized[i]);
      if (p) await p.update({ displayOrder: i });
    }
    const ordered = await db.PaymentProvider.findAll({
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      attributes: LIST_ATTRIBUTES
    });
    const list = ordered.map((p) => {
      const row = p.toJSON();
      const code = (row.code || '').toString().toLowerCase();
      const meta = PROVIDER_META[code] || {};
      const supported = meta.supportedPaymentTypes || [];
      const withdrawTypes = Array.isArray(meta.supportedWithdrawPaymentTypes) ? meta.supportedWithdrawPaymentTypes : supported;
      row.supportedPaymentTypes = supported.map((key) => ({
        key,
        label: getPaymentTypeLabel(key),
        supportsWithdraw: withdrawTypes.includes(key)
      }));
      return withAdminDisplayName(row);
    });
    sendSuccess(res, { list, total: list.length });
  } catch (err) {
    sendError(res, err.message || 'Failed to reorder payment providers', err.statusCode || 500);
  }
}

module.exports = {
  listPaymentProviders,
  updateProviderStatus,
  reorderPaymentProviders
};
