'use strict';

const slotProvidersService = require('../../services/slotProviders/slotProvidersSettings.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

function assertMasterCanManage(req) {
  return isMasterAdmin(req.role) && canAdmin(req, ADMIN_FEATURE_KEYS.GAMES);
}

async function getPublicConfig(req, res) {
  try {
    const storeCode = slotProvidersService.resolveStoreCodeFromReq(req);
    const scope = await slotProvidersService.resolveScopeFromStoreCode(storeCode);
    const data = await slotProvidersService.getSlotProviderSettings(scope);
    sendSuccess(res, { providers: data });
  } catch (err) {
    sendError(res, err.message || 'Unable to load slot providers.', err.statusCode || 500);
  }
}

async function getSettingsAdmin(req, res) {
  try {
    if (!assertMasterCanManage(req)) {
      return sendError(res, 'You do not have permission to manage slot providers.', 403);
    }
    const data = await slotProvidersService.getSlotProviderSettings(null);
    sendSuccess(res, { providers: data, scope: 'global' });
  } catch (err) {
    sendError(res, err.message || 'Unable to load slot providers.', err.statusCode || 500);
  }
}

async function updateSettingsAdmin(req, res) {
  try {
    if (!assertMasterCanManage(req)) {
      return sendError(res, 'You do not have permission to manage slot providers.', 403);
    }
    const body = req.body?.providers ?? req.body ?? {};
    const data = await slotProvidersService.updateSlotProviderSettings(body, null);
    sendSuccess(res, { providers: data, message: 'Slot providers saved.' });
  } catch (err) {
    sendError(res, err.message || 'Unable to save slot providers.', err.statusCode || 500);
  }
}

async function getStoreSettings(req, res) {
  try {
    if (!assertMasterCanManage(req)) {
      return sendError(res, "You do not have permission to view this store's slot providers.", 403);
    }
    const { store, scope } = await slotProvidersService.resolveScopeFromStoreUserId(req.params.id);
    const data = await slotProvidersService.getSlotProviderSettings(scope);
    sendSuccess(res, {
      providers: data,
      storeId: store.userId,
      storeCode: store.storeCode,
      distributorCode: store.distributorCode
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to load slot providers.', err.statusCode || 404);
  }
}

async function updateStoreSettings(req, res) {
  try {
    if (!assertMasterCanManage(req)) {
      return sendError(res, "You do not have permission to update this store's slot providers.", 403);
    }
    const { store, scope } = await slotProvidersService.resolveScopeFromStoreUserId(req.params.id);
    const body = req.body?.providers ?? req.body ?? {};
    const data = await slotProvidersService.updateSlotProviderSettings(body, scope);
    sendSuccess(res, {
      providers: data,
      storeId: store.userId,
      message: 'Slot providers saved.'
    });
  } catch (err) {
    sendError(res, err.message || 'Unable to save slot providers.', err.statusCode || 500);
  }
}

module.exports = {
  getPublicConfig,
  getSettingsAdmin,
  updateSettingsAdmin,
  getStoreSettings,
  updateStoreSettings
};
