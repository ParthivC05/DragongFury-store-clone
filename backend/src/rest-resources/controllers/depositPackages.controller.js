const depositPackagesService = require('../../services/depositPackages');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin, isDistributorAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const {
  normalizeStoreCode,
  resolveStoreFromCode
} = require('../../services/auth/storeBinding.helpers');

function canManageDepositPackages(req) {
  if (isMasterAdmin(req.role)) {
    return canAdmin(req, STORE_FEATURE_KEYS.DEPOSIT_PACKAGES);
  }
  return can(req, STORE_FEATURE_KEYS.DEPOSIT_PACKAGES);
}

function resolveScopeFromQuery(req) {
  const distributorCode = req.query?.distributor_code ?? req.query?.distributorCode ?? req.body?.distributor_code ?? req.body?.distributorCode;
  const storeCode = req.query?.store_code ?? req.query?.storeCode ?? req.body?.store_code ?? req.body?.storeCode;
  if (isStoreAdmin(req.role) && req.distributorCode && req.storeCode) {
    return { distributorCode: req.distributorCode, storeCode: req.storeCode };
  }
  if ((isMasterAdmin(req.role) || isDistributorAdmin(req.role)) && distributorCode && storeCode) {
    return { distributorCode, storeCode };
  }
  return null;
}

async function getPublicCatalog(req, res) {
  try {
    const storeCode = normalizeStoreCode(String(req.query.store_code ?? req.query.storeCode ?? ''));
    const store = await resolveStoreFromCode(storeCode);
    if (!store?.distributorCode || !store?.storeCode) {
      return sendSuccess(res, { enabled: false, groups: [] });
    }
    const scope = depositPackagesService.normalizeScope({
      distributorCode: store.distributorCode,
      storeCode: store.storeCode
    });
    const catalog = await depositPackagesService.getActiveCatalogForScope(scope, { userId: null });
    return sendSuccess(res, catalog);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load deposit packages.', err.statusCode || 500);
  }
}

async function getCatalog(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const user = await require('../../db/models').User.findByPk(userId, {
      attributes: ['distributorCode', 'storeCode'],
      raw: true
    });
    if (!user?.distributorCode || !user?.storeCode) {
      return sendSuccess(res, { enabled: false, groups: [] });
    }
    const scope = depositPackagesService.normalizeScope({
      distributorCode: user.distributorCode,
      storeCode: user.storeCode
    });
    const catalog = await depositPackagesService.getActiveCatalogForScope(scope, { userId });
    sendSuccess(res, catalog);
  } catch (err) {
    sendError(res, err.message || 'Unable to load deposit packages.', err.statusCode || 500);
  }
}

async function getAdminCatalog(req, res) {
  try {
    if (!canManageDepositPackages(req)) {
      return sendError(res, 'You don\'t have access to deposit packages.', 403);
    }
    const scope = resolveScopeFromQuery(req);
    if (!scope) {
      return sendError(res, 'distributorCode and storeCode are required.', 400);
    }
    const catalog = await depositPackagesService.getAdminCatalog(req, scope);
    sendSuccess(res, catalog);
  } catch (err) {
    sendError(res, err.message || 'Unable to load deposit packages.', err.statusCode || 500);
  }
}

async function updateSettings(req, res) {
  try {
    if (!canManageDepositPackages(req)) {
      return sendError(res, 'You don\'t have access to deposit packages.', 403);
    }
    const scope = resolveScopeFromQuery(req);
    if (!scope) return sendError(res, 'distributorCode and storeCode are required.', 400);
    const body = req.body || {};
    const settings = await depositPackagesService.updateSettings(req, scope, {
      enabled: body.enabled
    });
    sendSuccess(res, { enabled: settings.enabled });
  } catch (err) {
    sendError(res, err.message || 'Unable to update settings.', err.statusCode || 500);
  }
}

async function patchGroup(req, res) {
  try {
    if (!canManageDepositPackages(req)) return sendError(res, 'Forbidden', 403);
    const scope = resolveScopeFromQuery(req);
    if (!scope) return sendError(res, 'distributorCode and storeCode are required.', 400);
    const group = await depositPackagesService.updateGroup(req, scope, req.params.id, req.body || {});
    sendSuccess(res, group);
  } catch (err) {
    sendError(res, err.message || 'Unable to update group.', err.statusCode || 500);
  }
}

async function createPackage(req, res) {
  try {
    if (!canManageDepositPackages(req)) return sendError(res, 'Forbidden', 403);
    const scope = resolveScopeFromQuery(req);
    if (!scope) return sendError(res, 'distributorCode and storeCode are required.', 400);
    const row = await depositPackagesService.createPackage(req, scope, req.body || {});
    sendSuccess(res, row, 201);
  } catch (err) {
    sendError(res, err.message || 'Unable to create package.', err.statusCode || 500);
  }
}

async function patchPackage(req, res) {
  try {
    if (!canManageDepositPackages(req)) return sendError(res, 'Forbidden', 403);
    const scope = resolveScopeFromQuery(req);
    if (!scope) return sendError(res, 'distributorCode and storeCode are required.', 400);
    const row = await depositPackagesService.updatePackage(req, scope, req.params.id, req.body || {});
    sendSuccess(res, row);
  } catch (err) {
    sendError(res, err.message || 'Unable to update package.', err.statusCode || 500);
  }
}

async function removePackage(req, res) {
  try {
    if (!canManageDepositPackages(req)) return sendError(res, 'Forbidden', 403);
    const scope = resolveScopeFromQuery(req);
    if (!scope) return sendError(res, 'distributorCode and storeCode are required.', 400);
    const result = await depositPackagesService.deletePackage(req, scope, req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message || 'Unable to delete package.', err.statusCode || 500);
  }
}

module.exports = {
  getPublicCatalog,
  getCatalog,
  getAdminCatalog,
  updateSettings,
  patchGroup,
  createPackage,
  patchPackage,
  removePackage
};
