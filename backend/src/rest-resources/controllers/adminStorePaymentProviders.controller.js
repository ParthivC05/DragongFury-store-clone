'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { can } = require('../../utils/permissionHelpers');
const { PROVIDER_META } = require('../../services/payments/depositMethods.service');
const { cryptoRailKeys, cryptoRailsState } = require('../../constants/cryptoDepositRails');
const { getPaymentTypeLabel } = require('../../constants/paymentTypes');
const { getPaymentProviderDisplayLabel } = require('../../constants/paymentProviderLabels');
const { isMasterAdmin, isStoreAdmin, ROLES } = require('../../constants/roles');
const {
  getDepositBestDealMethods,
  setDepositBestDealMethod
} = require('../../services/payments/depositBestDealMethods.service');
const {
  storeAllowsXxpay,
  sanitizeXxpayMethodsMap,
  getXxpaySupportedDepositTypes,
  getXxpaySupportedWithdrawTypes,
  isXxpayOptInDepositKey,
  isXxpayOptInWithdrawKey
} = require('../../services/paymentProviders/xxpay/xxpay.storeAccess');

function storeAllowsAdminProvider(code, storeCode) {
  const c = (code || '').toString().toLowerCase();
  if (c === 'xxpay') return storeAllowsXxpay(storeCode);
  return true;
}

const PROVIDER_ATTRS = ['id', 'code', 'name', 'supportsDeposit', 'supportsWithdraw', 'depositEnabled', 'withdrawEnabled', 'displayOrder', 'depositMethodsEnabled', 'withdrawMethodsEnabled'];
const STORE_ATTRS = ['providerCode', 'enabled', 'depositEnabled', 'withdrawEnabled', 'displayOrder', 'depositMethodsEnabled', 'withdrawMethodsEnabled'];

/** Merge master + store per-method settings. Master's false wins so store admin sees effective state when master disables a method. */
function mergeMethodsEnabled(masterMap, storeMap, keys) {
  const result = {};
  for (const key of keys) {
    if (masterMap && masterMap[key] === false) result[key] = false;
    else result[key] = storeMap?.[key] ?? masterMap?.[key] ?? true;
  }
  return result;
}

/** Resolve store scope: store admin uses JWT context; master may pass distributorCode+storeCode via query/body. */
function resolveStoreContext(req) {
  if (isMasterAdmin(req.role) || req.role === ROLES.MASTER_ADMIN) {
    const distributorCode = String(
      req.query?.distributorCode || req.body?.distributorCode || req.distributorCode || ''
    ).trim();
    const storeCode = String(
      req.query?.storeCode || req.body?.storeCode || req.storeCode || ''
    ).trim();
    return { distributorCode: distributorCode || null, storeCode: storeCode || null, isMaster: true };
  }
  return {
    distributorCode: req.distributorCode || null,
    storeCode: req.storeCode || null,
    isMaster: false
  };
}

/** Prefer PROVIDER_META; fall back to master JSON map keys so providers still resolve if meta is stale. */
function resolveSupportedKeys(metaList, masterMap) {
  if (Array.isArray(metaList) && metaList.length > 0) return metaList;
  if (masterMap && typeof masterMap === 'object' && !Array.isArray(masterMap)) {
    return Object.keys(masterMap);
  }
  return [];
}

function mapProviderRow(p, override, storeCode = '') {
  const code = (p.code || '').toString().toLowerCase();
  const storeEnabled = override ? override.enabled !== false : true;
  const storeDepositRaw = override ? override.depositEnabled : true;
  const storeWithdrawRaw = override ? override.withdrawEnabled : true;
  const sortOrder = override?.displayOrder != null ? override.displayOrder : (p.displayOrder ?? 999);
  const meta = PROVIDER_META[code] || {};
  let supported = resolveSupportedKeys(meta.supportedPaymentTypes, p.depositMethodsEnabled);
  const extraRailKeys = cryptoRailKeys(code);
  let withdrawTypes = resolveSupportedKeys(
    Array.isArray(meta.supportedWithdrawPaymentTypes) ? meta.supportedWithdrawPaymentTypes : null,
    p.withdrawMethodsEnabled
  );
  if (code === 'xxpay') {
    supported = getXxpaySupportedDepositTypes(storeCode);
    withdrawTypes = getXxpaySupportedWithdrawTypes();
  }
  const withdrawKeys = withdrawTypes.length > 0 ? withdrawTypes : supported;
  const supportedPaymentTypes = supported.map((key) => ({
    key,
    label: getPaymentTypeLabel(key),
    supportsWithdraw: withdrawKeys.includes(key)
  }));
  const supportedWithdrawPaymentTypes = withdrawKeys.map((key) => ({
    key,
    label: getPaymentTypeLabel(key)
  }));
  const mergedDeposit = mergeMethodsEnabled(
    p.depositMethodsEnabled,
    override?.depositMethodsEnabled,
    [...supported, ...extraRailKeys.filter((k) => !supported.includes(k))]
  );
  const mergedWithdraw = mergeMethodsEnabled(
    p.withdrawMethodsEnabled,
    override?.withdrawMethodsEnabled,
    withdrawKeys
  );
  if (code === 'xxpay') {
    for (const key of supported) {
      if (isXxpayOptInDepositKey(key)) {
        mergedDeposit[key] = override?.depositMethodsEnabled?.[key] === true;
      }
    }
    for (const key of withdrawKeys) {
      if (isXxpayOptInWithdrawKey(key)) {
        mergedWithdraw[key] = override?.withdrawMethodsEnabled?.[key] === true;
      }
    }
  }
  return {
    ...p,
    code,
    name: getPaymentProviderDisplayLabel(code, p.name),
    sortOrder,
    supportedPaymentTypes,
    supportedWithdrawPaymentTypes,
    masterDepositEnabled: p.depositEnabled === true && p.supportsDeposit === true,
    masterWithdrawEnabled: p.withdrawEnabled === true && p.supportsWithdraw === true,
    masterDepositMethodsEnabled: p.depositMethodsEnabled,
    masterWithdrawMethodsEnabled: p.withdrawMethodsEnabled,
    storeEnabled,
    storeDepositEnabled: storeEnabled && storeDepositRaw !== false && p.depositEnabled === true && p.supportsDeposit === true,
    storeWithdrawEnabled: storeEnabled && storeWithdrawRaw !== false && p.withdrawEnabled === true && p.supportsWithdraw === true,
    depositMethodsEnabled: mergedDeposit,
    withdrawMethodsEnabled: mergedWithdraw,
    cryptoRails: cryptoRailsState(code, mergedDeposit)
  };
}

/**
 * GET /api/admin/store-payment-providers
 * Store admin: own store. Master: pass distributorCode+storeCode query.
 */
async function list(req, res) {
  try {
    if (isStoreAdmin(req.role) && !can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS)) {
      return sendError(res, 'You do not have access to Payment providers.', 403);
    }
    const { distributorCode, storeCode } = resolveStoreContext(req);
    if (!distributorCode || !storeCode) {
      return sendError(
        res,
        isMasterAdmin(req.role)
          ? 'distributorCode and storeCode are required for master admin.'
          : 'Store context is missing.',
        400
      );
    }

    const [globalProviders, storeOverrides] = await Promise.all([
      db.PaymentProvider.findAll({
        where: { isActive: true },
        order: [['displayOrder', 'ASC'], ['id', 'ASC']],
        attributes: PROVIDER_ATTRS,
        raw: true
      }),
      db.StorePaymentProvider.findAll({
        where: { distributorCode, storeCode },
        attributes: STORE_ATTRS,
        raw: true
      })
    ]);

    const overrideMap = new Map((storeOverrides || []).map((o) => [(o.providerCode || '').toString().toLowerCase(), o]));
    let list = (globalProviders || [])
      .filter((p) => {
        const code = (p.code || '').toString().toLowerCase();
        return storeAllowsAdminProvider(code, storeCode);
      })
      .map((p) => mapProviderRow(p, overrideMap.get((p.code || '').toString().toLowerCase()), storeCode));
    list.sort((a, b) => {
      const aActive = a.storeEnabled !== false ? 0 : 1;
      const bActive = b.storeEnabled !== false ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
    });
    list = list.map(({ sortOrder, ...rest }) => rest);

    const depositBestDealMethods = await getDepositBestDealMethods(distributorCode, storeCode);
    sendSuccess(res, { list, total: list.length, distributorCode, storeCode, depositBestDealMethods });
  } catch (err) {
    sendError(res, err.message || 'Failed to list store payment providers', err.statusCode || 500);
  }
}

/**
 * PATCH /api/admin/store-payment-providers/:providerCode
 * Body: { enabled?, depositEnabled?, withdrawEnabled?, depositMethodsEnabled?, withdrawMethodsEnabled? }.
 * Master may include distributorCode+storeCode in body.
 */
async function update(req, res) {
  try {
    if (isStoreAdmin(req.role) && !can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS)) {
      return sendError(res, 'You do not have access to Payment providers.', 403);
    }
    const { distributorCode, storeCode } = resolveStoreContext(req);
    if (!distributorCode || !storeCode) {
      return sendError(
        res,
        isMasterAdmin(req.role)
          ? 'distributorCode and storeCode are required for master admin.'
          : 'Store context is missing.',
        400
      );
    }

    const providerCode = (req.params.providerCode || '').toString().trim().toLowerCase();
    if (!providerCode) return sendError(res, 'Provider code is required', 400);

    if (providerCode === 'xxpay' && !storeAllowsXxpay(storeCode)) {
      return sendError(res, 'Xpay is not available for this store.', 400);
    }

    const enabled = req.body?.enabled;
    const depositEnabled = req.body?.depositEnabled;
    const withdrawEnabled = req.body?.withdrawEnabled;
    let depositMethodsEnabled = req.body?.depositMethodsEnabled;
    let withdrawMethodsEnabled = req.body?.withdrawMethodsEnabled;
    if (providerCode === 'xxpay') {
      if (depositMethodsEnabled != null) {
        depositMethodsEnabled = sanitizeXxpayMethodsMap(depositMethodsEnabled, {
          storeCode,
          direction: 'deposit'
        });
      }
      if (withdrawMethodsEnabled != null) {
        withdrawMethodsEnabled = sanitizeXxpayMethodsMap(withdrawMethodsEnabled, {
          storeCode,
          direction: 'withdraw'
        });
      }
    }
    const hasUpdate = typeof enabled === 'boolean' || typeof depositEnabled === 'boolean' || typeof withdrawEnabled === 'boolean' ||
      (depositMethodsEnabled != null && typeof depositMethodsEnabled === 'object' && !Array.isArray(depositMethodsEnabled)) ||
      (withdrawMethodsEnabled != null && typeof withdrawMethodsEnabled === 'object' && !Array.isArray(withdrawMethodsEnabled));
    if (!hasUpdate) {
      return sendError(res, 'Body must include at least one of: enabled, depositEnabled, withdrawEnabled, depositMethodsEnabled, withdrawMethodsEnabled', 400);
    }

    const globalProvider = await db.PaymentProvider.findOne({
      where: { code: providerCode, isActive: true },
      attributes: ['id', 'code', 'depositEnabled', 'withdrawEnabled', 'supportsDeposit', 'supportsWithdraw']
    });
    if (!globalProvider) return sendError(res, 'Payment provider not found or disabled by master admin.', 404);

    if (depositEnabled === true && (!globalProvider.supportsDeposit || globalProvider.depositEnabled !== true)) {
      return sendError(res, 'Master admin has disabled deposit for this provider. You cannot enable it.', 400);
    }
    if (withdrawEnabled === true && (!globalProvider.supportsWithdraw || globalProvider.withdrawEnabled !== true)) {
      return sendError(res, 'Master admin has disabled withdraw for this provider. You cannot enable it.', 400);
    }

    const [row] = await db.StorePaymentProvider.findOrCreate({
      where: { distributorCode, storeCode, providerCode },
      defaults: { enabled: true, depositEnabled: true, withdrawEnabled: true }
    });

    const updates = {};
    if (typeof enabled === 'boolean') {
      updates.enabled = enabled;
      if (!enabled) {
        updates.depositEnabled = false;
        updates.withdrawEnabled = false;
      }
    }
    if (typeof depositEnabled === 'boolean') updates.depositEnabled = depositEnabled;
    if (typeof withdrawEnabled === 'boolean') updates.withdrawEnabled = withdrawEnabled;
    if (depositMethodsEnabled != null && typeof depositMethodsEnabled === 'object' && !Array.isArray(depositMethodsEnabled)) {
      updates.depositMethodsEnabled = depositMethodsEnabled;
    }
    if (withdrawMethodsEnabled != null && typeof withdrawMethodsEnabled === 'object' && !Array.isArray(withdrawMethodsEnabled)) {
      updates.withdrawMethodsEnabled = withdrawMethodsEnabled;
    }
    if (Object.keys(updates).length > 0) await row.update(updates);

    const meta = PROVIDER_META[providerCode] || {};
    const supported =
      providerCode === 'xxpay'
        ? getXxpaySupportedDepositTypes(storeCode)
        : meta.supportedPaymentTypes || [];
    const withdrawTypes =
      providerCode === 'xxpay'
        ? getXxpaySupportedWithdrawTypes()
        : Array.isArray(meta.supportedWithdrawPaymentTypes)
          ? meta.supportedWithdrawPaymentTypes
          : supported;

    const result = {
      providerCode: row.providerCode,
      enabled: row.enabled,
      depositEnabled: row.depositEnabled,
      withdrawEnabled: row.withdrawEnabled,
      depositMethodsEnabled: row.depositMethodsEnabled,
      withdrawMethodsEnabled: row.withdrawMethodsEnabled,
      supportedPaymentTypes: supported.map((key) => ({
        key,
        label: getPaymentTypeLabel(key),
        supportsWithdraw: withdrawTypes.includes(key)
      })),
      supportedWithdrawPaymentTypes: withdrawTypes.map((key) => ({
        key,
        label: getPaymentTypeLabel(key)
      }))
    };
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message || 'Failed to update store payment provider', err.statusCode || 500);
  }
}

/**
 * PUT /api/admin/store-payment-providers/reorder
 * Body: { orderedCodes: string[], distributorCode?, storeCode? }.
 */
async function reorder(req, res) {
  try {
    if (isStoreAdmin(req.role) && !can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS)) {
      return sendError(res, 'You do not have access to Payment providers.', 403);
    }
    const { distributorCode, storeCode } = resolveStoreContext(req);
    if (!distributorCode || !storeCode) {
      return sendError(
        res,
        isMasterAdmin(req.role)
          ? 'distributorCode and storeCode are required for master admin.'
          : 'Store context is missing.',
        400
      );
    }

    const orderedCodes = req.body?.orderedCodes;
    if (!Array.isArray(orderedCodes) || orderedCodes.length === 0) {
      return sendError(res, 'Body must include orderedCodes (non-empty array of provider codes)', 400);
    }
    const normalized = orderedCodes.map((c) => (c != null && typeof c === 'string' ? c.trim().toLowerCase() : '')).filter(Boolean);
    if (normalized.length === 0) return sendError(res, 'orderedCodes must contain at least one valid provider code', 400);

    if (normalized.includes('xxpay') && !storeAllowsXxpay(storeCode)) {
      return sendError(res, 'Xpay is not available for this store.', 400);
    }

    for (let i = 0; i < normalized.length; i++) {
      const [row] = await db.StorePaymentProvider.findOrCreate({
        where: { distributorCode, storeCode, providerCode: normalized[i] },
        defaults: { enabled: true, depositEnabled: true, withdrawEnabled: true, displayOrder: i }
      });
      if (row.displayOrder !== i) await row.update({ displayOrder: i });
    }

    const [globalProviders, storeOverrides] = await Promise.all([
      db.PaymentProvider.findAll({
        where: { isActive: true },
        order: [['displayOrder', 'ASC'], ['id', 'ASC']],
        attributes: PROVIDER_ATTRS,
        raw: true
      }),
      db.StorePaymentProvider.findAll({
        where: { distributorCode, storeCode },
        attributes: STORE_ATTRS,
        raw: true
      })
    ]);
    const overrideMap = new Map((storeOverrides || []).map((o) => [(o.providerCode || '').toString().toLowerCase(), o]));
    let list = (globalProviders || [])
      .filter((p) => {
        const code = (p.code || '').toString().toLowerCase();
        return storeAllowsAdminProvider(code, storeCode);
      })
      .map((p) => mapProviderRow(p, overrideMap.get((p.code || '').toString().toLowerCase()), storeCode));
    list.sort((a, b) => {
      const aActive = a.storeEnabled !== false ? 0 : 1;
      const bActive = b.storeEnabled !== false ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
    });
    list = list.map(({ sortOrder, ...rest }) => rest);

    sendSuccess(res, { list, total: list.length, distributorCode, storeCode });
  } catch (err) {
    sendError(res, err.message || 'Failed to reorder store payment providers', err.statusCode || 500);
  }
}

/**
 * PATCH /api/admin/store-payment-providers/best-deals
 * Body: { methodKey, enabled, distributorCode?, storeCode? }.
 */
async function updateBestDeals(req, res) {
  try {
    if (isStoreAdmin(req.role) && !can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS)) {
      return sendError(res, 'You do not have access to Payment providers.', 403);
    }
    const { distributorCode, storeCode } = resolveStoreContext(req);
    if (!distributorCode || !storeCode) {
      return sendError(
        res,
        isMasterAdmin(req.role)
          ? 'distributorCode and storeCode are required for master admin.'
          : 'Store context is missing.',
        400
      );
    }
    const methodKey = String(req.body?.methodKey || '').trim();
    if (!methodKey) return sendError(res, 'methodKey is required.', 400);
    if (typeof req.body?.enabled !== 'boolean') return sendError(res, 'enabled must be true or false.', 400);

    const depositBestDealMethods = await setDepositBestDealMethod(
      distributorCode,
      storeCode,
      methodKey,
      req.body.enabled
    );
    sendSuccess(res, { depositBestDealMethods, distributorCode, storeCode });
  } catch (err) {
    sendError(res, err.message || 'Failed to update best deals label', err.statusCode || 500);
  }
}

module.exports = {
  list,
  update,
  reorder,
  updateBestDeals
};
