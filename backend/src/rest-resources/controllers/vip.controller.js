const db = require('../../db/models');
const vipService = require('../../services/vip');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');

/** Resolve scope from request: user's store when authenticated with store, else null (global). */
async function getScopeFromUser(req) {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.User.findByPk(userId, { attributes: ['distributorCode', 'storeCode'], raw: true });
  if (!user || (user.distributorCode == null && user.storeCode == null)) return null;
  return { distributorCode: user.distributorCode ?? null, storeCode: user.storeCode ?? null };
}

async function getStatus(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const scope = await getScopeFromUser(req);
    const data = await vipService.getUserVipStatus(userId, scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Unable to load VIP status.';
    sendError(res, message, status);
  }
}

async function getHistory(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await vipService.getVipLedgerHistory(userId, req.query);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Unable to load VIP history.';
    sendError(res, message, status);
  }
}

async function getFaq(req, res) {
  try {
    const scope = await getScopeFromUser(req);
    const data = await vipService.getVipFaq(scope);
    sendSuccess(res, { faq: data });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Unable to load FAQ.';
    sendError(res, message, status);
  }
}

async function getLevels(req, res) {
  try {
    const scope = await getScopeFromUser(req);
    const data = await vipService.getVipLevelsConfig(scope);
    sendSuccess(res, { levels: data });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Unable to load VIP levels.';
    sendError(res, message, status);
  }
}

/** Resolve admin scope: master = global (null), store_admin = their store. */
function getSettingsScope(req) {
  const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
  if (isMasterAdmin(req.role)) return null;
  if (isStoreAdmin(req.role) && req.distributorCode != null && req.storeCode != null) {
    return { distributorCode: req.distributorCode, storeCode: req.storeCode };
  }
  return null;
}

async function getSettings(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.VIP)) return sendError(res, 'You don\'t have access to VIP settings. Please contact your administrator if you need access.', 403);
    const scope = getSettingsScope(req);
    const data = await vipService.getVipSettings(scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Unable to load VIP settings.';
    sendError(res, message, status);
  }
}

async function updateSettings(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.VIP)) return sendError(res, 'You don\'t have access to VIP settings. Please contact your administrator if you need access.', 403);
    const scope = getSettingsScope(req);
    const data = await vipService.updateVipSettings(req.body, scope);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Unable to save VIP settings.';
    sendError(res, message, status);
  }
}

async function resetToDefault(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.VIP)) return sendError(res, 'You don\'t have access to VIP settings. Please contact your administrator if you need access.', 403);
    const { isStoreAdmin } = require('../../constants/roles');
    if (!isStoreAdmin(req.role) || req.distributorCode == null || req.storeCode == null) {
      return sendError(res, 'Only store admins can reset VIP settings to default for their store.', 403);
    }
    const scope = { distributorCode: req.distributorCode, storeCode: req.storeCode };
    const section = req.body?.section; // 'levels' | 'faq' | omit for full reset
    await vipService.resetVipSettingsToDefault(scope, section);
    const msg = section === 'levels'
      ? 'VIP levels reset to default for your store.'
      : section === 'faq'
        ? 'VIP FAQ reset to default for your store.'
        : 'VIP settings reset to default for your store.';
    sendSuccess(res, { message: msg });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'Unable to reset.';
    sendError(res, message, status);
  }
}

module.exports = {
  getStatus,
  getHistory,
  getFaq,
  getLevels,
  getSettings,
  updateSettings,
  resetToDefault
};
