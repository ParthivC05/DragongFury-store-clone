const depositBonusesService = require('../../services/depositBonuses');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');

function canManageDepositBonuses(req) {
  if (isMasterAdmin(req.role)) {
    return canAdmin(req, STORE_FEATURE_KEYS.DEPOSIT_BONUSES);
  }
  return can(req, STORE_FEATURE_KEYS.DEPOSIT_BONUSES);
}

function getSettingsScope(req) {
  if (isMasterAdmin(req.role)) return null;
  if (isStoreAdmin(req.role) && req.distributorCode != null && req.storeCode != null) {
    return { distributorCode: req.distributorCode, storeCode: req.storeCode };
  }
  return null;
}

async function getPublicPromo(req, res) {
  try {
    const scope = await depositBonusesService.resolveScopeFromStoreCode(req.query.store_code);
    const data = await depositBonusesService.getPublicDepositBonusPromo(scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to load deposit bonus promo.', status);
  }
}

async function getEligibility(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await depositBonusesService.getNewUserDepositBonusEligibility(userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to load deposit bonus eligibility.', status);
  }
}

async function getSettingsAdmin(req, res) {
  try {
    if (!canManageDepositBonuses(req)) {
      return sendError(res, 'You don\'t have access to new user deposit bonus settings.', 403);
    }
    const scope = getSettingsScope(req);
    const settings = await depositBonusesService.getNewUserDepositBonusSettings(scope);
    sendSuccess(res, depositBonusesService.toPublicSettings(settings));
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to load deposit bonus settings.', status);
  }
}

async function updateSettings(req, res) {
  try {
    if (!canManageDepositBonuses(req)) {
      return sendError(res, 'You don\'t have access to new user deposit bonus settings.', 403);
    }
    const scope = getSettingsScope(req);
    const body = req.body || {};
    const payload = {
      enabled: body.enabled,
      expiryHours: body.expiry_hours ?? body.expiryHours,
      applyToAllStores: body.apply_to_all_stores ?? body.applyToAllStores,
      storeCodes: body.store_codes ?? body.storeCodes,
      tiers: Array.isArray(body.tiers)
        ? body.tiers.map((t) => ({
          depositNumber: t.deposit_number ?? t.depositNumber,
          enabled: t.enabled,
          bonusType: t.bonus_type ?? t.bonusType,
          bonusValue: t.bonus_value ?? t.bonusValue,
          minTriggerAmount: t.min_trigger_amount ?? t.minTriggerAmount,
          maxBonusCap: t.max_bonus_cap ?? t.maxBonusCap,
          title: t.title
        }))
        : undefined
    };
    const updated = await depositBonusesService.updateNewUserDepositBonusSettings(payload, scope);
    sendSuccess(res, depositBonusesService.toPublicSettings(updated));
  } catch (err) {
    const status = err.statusCode || 400;
    sendError(res, err.message || 'Unable to save deposit bonus settings.', status);
  }
}

async function resetToDefault(req, res) {
  try {
    if (!canManageDepositBonuses(req)) {
      return sendError(res, 'You don\'t have access to new user deposit bonus settings.', 403);
    }
    if (!isStoreAdmin(req.role) || req.distributorCode == null || req.storeCode == null) {
      return sendError(res, 'Only store admins can reset deposit bonus settings to platform default for their store.', 403);
    }
    const scope = { distributorCode: req.distributorCode, storeCode: req.storeCode };
    await depositBonusesService.resetNewUserDepositBonusSettingsToDefault(scope);
    sendSuccess(res, { message: 'Deposit bonus settings reset to platform default for your store.' });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Unable to reset.', status);
  }
}

module.exports = {
  getPublicPromo,
  getEligibility,
  getSettingsAdmin,
  updateSettings,
  resetToDefault
};
