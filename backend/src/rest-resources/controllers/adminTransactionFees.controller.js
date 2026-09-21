'use strict';

const {
  getTransactionFees,
  updateTransactionFees,
  resetTransactionFeesToDefault,
  listStoreTransactionFees,
  DEFAULT_FEE_PERCENT
} = require('../../services/wallet/transactionFees.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

function canManageTransactionFees(req) {
  if (!isMasterAdmin(req.role)) return false;
  return canAdmin(req, ADMIN_FEATURE_KEYS.TRANSACTION_FEES);
}

function parseScopeFromQueryOrBody(source) {
  const distributorCode =
    source?.distributorCode != null && String(source.distributorCode).trim()
      ? String(source.distributorCode).trim()
      : null;
  const storeCode =
    source?.storeCode != null && String(source.storeCode).trim()
      ? String(source.storeCode).trim()
      : null;
  if (!distributorCode && !storeCode) return null;
  return { distributorCode, storeCode };
}

async function assertStoreScopeExists(scope) {
  if (!scope?.storeCode) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  const { ROLES } = require('../../constants/roles');
  const where = {
    role: ROLES.STORE_ADMIN,
    storeRoleId: null,
    storeCode: String(scope.storeCode).trim()
  };
  if (scope.distributorCode != null && String(scope.distributorCode).trim()) {
    where.distributorCode = String(scope.distributorCode).trim();
  }
  const stores = await require('../../db/models').User.findAll({
    where,
    attributes: ['userId', 'distributorCode', 'storeCode'],
    raw: true,
    limit: 5
  });
  if (!stores.length) {
    const err = new Error('Store not found. Use a valid store code.');
    err.statusCode = 404;
    throw err;
  }
  if (stores.length > 1 && !(scope.distributorCode != null && String(scope.distributorCode).trim())) {
    const err = new Error('Multiple stores match this storeCode. Provide distributorCode as well.');
    err.statusCode = 400;
    throw err;
  }
  return {
    distributorCode: stores[0].distributorCode ?? null,
    storeCode: stores[0].storeCode
  };
}

async function toResponse(data, scope) {
  let platformPayinPercent = data.payinPercent;
  let platformPayoutPercent = data.payoutPercent;
  if (scope) {
    const global = await getTransactionFees(null);
    platformPayinPercent = global.payinPercent;
    platformPayoutPercent = global.payoutPercent;
  }
  return {
    payinPercent: data.payinPercent,
    payoutPercent: data.payoutPercent,
    isStoreOverride: data.isStoreOverride,
    payinSource: data.payinSource,
    payoutSource: data.payoutSource,
    source: data.source,
    defaultPercent: DEFAULT_FEE_PERCENT,
    platformPayinPercent,
    platformPayoutPercent,
    scope: scope
      ? { distributorCode: scope.distributorCode, storeCode: scope.storeCode }
      : null
  };
}

/**
 * GET /admin/transaction-fees
 * Super admin / technical staff: platform default, or ?distributorCode=&storeCode= for one store.
 */
async function getTransactionFeesAdmin(req, res) {
  try {
    if (!canManageTransactionFees(req)) {
      return sendError(res, 'Only super admin or technical staff can view transaction fees.', 403);
    }

    let scope = null;
    const qScope = parseScopeFromQueryOrBody(req.query);
    if (qScope?.storeCode) {
      scope = await assertStoreScopeExists(qScope);
    }

    const data = await getTransactionFees(scope);
    return sendSuccess(res, await toResponse(data, scope));
  } catch (err) {
    return sendError(res, err.message || 'Unable to load transaction fees.', err.statusCode || 500);
  }
}

/**
 * GET /admin/transaction-fees/stores
 */
async function listStoreTransactionFeesAdmin(req, res) {
  try {
    if (!canManageTransactionFees(req)) {
      return sendError(res, 'Only super admin or technical staff can list store transaction fees.', 403);
    }
    const data = await listStoreTransactionFees();
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load store transaction fees.', err.statusCode || 500);
  }
}

/**
 * PUT /admin/transaction-fees
 * Body: { payinPercent?, payoutPercent?, distributorCode?, storeCode? }
 */
async function updateTransactionFeesAdmin(req, res) {
  try {
    if (!canManageTransactionFees(req)) {
      return sendError(res, 'Only super admin or technical staff can update transaction fees.', 403);
    }

    let scope = null;
    const bodyScope = parseScopeFromQueryOrBody(req.body);
    if (bodyScope?.storeCode) {
      scope = await assertStoreScopeExists(bodyScope);
    } else if (bodyScope && !bodyScope.storeCode) {
      return sendError(res, 'storeCode is required to update a store transaction fee.', 400);
    }

    const data = await updateTransactionFees(req.body || {}, scope);
    return sendSuccess(res, await toResponse(data, scope));
  } catch (err) {
    return sendError(res, err.message || 'Unable to update transaction fees.', err.statusCode || 500);
  }
}

/**
 * POST /admin/transaction-fees/reset-to-default
 * Body: { distributorCode, storeCode }
 */
async function resetTransactionFeesAdmin(req, res) {
  try {
    if (!canManageTransactionFees(req)) {
      return sendError(res, 'Only super admin or technical staff can reset transaction fees.', 403);
    }

    const bodyScope = parseScopeFromQueryOrBody(req.body);
    if (!bodyScope?.storeCode) {
      return sendError(res, 'Provide distributorCode and storeCode to reset a store override.', 400);
    }
    const scope = await assertStoreScopeExists(bodyScope);
    const data = await resetTransactionFeesToDefault(scope);
    return sendSuccess(res, {
      ...(await toResponse(data, scope)),
      message: 'Transaction fees reset to platform default for this store.'
    });
  } catch (err) {
    return sendError(res, err.message || 'Unable to reset transaction fees.', err.statusCode || 500);
  }
}

module.exports = {
  getTransactionFeesAdmin,
  listStoreTransactionFeesAdmin,
  updateTransactionFeesAdmin,
  resetTransactionFeesAdmin
};
