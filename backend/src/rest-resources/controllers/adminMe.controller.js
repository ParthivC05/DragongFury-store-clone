const db = require('../../db/models');
const authService = require('../../services/auth');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { validateAndNormalizeUserSiteUrl } = require('../../services/store/userSiteUrl.service');

function normalizeDrawerFromBody(raw) {
  if (raw === undefined) return { ok: true, omit: true };
  if (raw === null || raw === '') return { ok: true, omit: false, value: null };
  const n = parseInt(String(raw).trim(), 10);
  if (Number.isNaN(n) || n < 1) {
    return { ok: false, error: 'Drawer (Golden Dragon moneybox) must be a positive whole number, or empty to clear.' };
  }
  return { ok: true, omit: false, value: n };
}

async function getMe(req, res) {
  try {
    const data = await authService.getMe(req.user.userId, { skipEmailVerification: true });
    if (req.permissions) data.permissions = req.permissions;
    if (req.storeRoleId != null) data.storeRoleId = req.storeRoleId;
    if (req.storeRoleName) data.storeRoleName = req.storeRoleName;
    if (req.storeRoleSlug) data.storeRoleSlug = req.storeRoleSlug;
    if (req.storeName != null) data.storeName = req.storeName;
    if (req.adminPermissions) data.adminPermissions = req.adminPermissions;
    if (req.adminRoleId != null) data.adminRoleId = req.adminRoleId;
    if (req.adminRoleName) data.adminRoleName = req.adminRoleName;
    if (req.role === ROLES.STORE_ADMIN) {
      const where = { role: ROLES.STORE_ADMIN, storeRoleId: null };
      if (req.distributorCode) where.distributorCode = req.distributorCode;
      if (req.storeCode) where.storeCode = req.storeCode;
      const primary = await db.User.findOne({ where, attributes: ['userSiteUrl', 'drawer'] });
      const url = primary?.userSiteUrl || null;
      data.customerSiteUrl = url;
      data.canEditCustomerSiteUrl = req.storeRoleId == null;
      if (req.storeRoleId == null) data.userSiteUrl = url;
      const dr = primary?.drawer != null ? Number(primary.drawer) : null;
      data.drawer = Number.isInteger(dr) && dr >= 1 ? dr : null;
    }
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, err.message || 'Failed to load user', status);
  }
}

/** Primary store admin only: set URL used for customer emails and referral links. */
async function patchUserSiteUrl(req, res) {
  try {
    if (req.role !== ROLES.STORE_ADMIN || req.storeRoleId != null) {
      return sendError(res, 'Only the main store account can set the customer site URL.', 403);
    }
    const raw = req.body && req.body.userSiteUrl;
    const v = validateAndNormalizeUserSiteUrl(raw === '' || raw == null ? null : raw);
    if (!v.ok) return sendError(res, v.error, 400);
    const user = await db.User.findOne({
      where: { userId: req.user.userId, role: ROLES.STORE_ADMIN, storeRoleId: null }
    });
    if (!user) return sendError(res, 'Store account not found.', 404);
    user.userSiteUrl = v.value;
    await user.save();
    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, {
      userSiteUrl: safe.userSiteUrl || null,
      customerSiteUrl: safe.userSiteUrl || null,
      message: 'Customer site URL updated.'
    });
  } catch (err) {
    sendError(res, err.message || 'Update failed', err.statusCode || 500);
  }
}

/** Primary store admin only: Golden Dragon provider moneybox (stored as users.drawer). */
async function patchDrawer(req, res) {
  try {
    if (req.role !== ROLES.STORE_ADMIN || req.storeRoleId != null) {
      return sendError(res, 'Only the main store account can set the Golden Dragon drawer (moneybox).', 403);
    }
    if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, 'drawer')) {
      return sendError(res, 'Field `drawer` is required (positive integer, or empty string to clear).', 400);
    }
    const raw = req.body.drawer;
    const dr = normalizeDrawerFromBody(raw);
    if (!dr.ok) return sendError(res, dr.error, 400);
    const user = await db.User.findOne({
      where: { userId: req.user.userId, role: ROLES.STORE_ADMIN, storeRoleId: null }
    });
    if (!user) return sendError(res, 'Store account not found.', 404);
    if (!dr.omit) user.drawer = dr.value;
    await user.save();
    sendSuccess(res, {
      drawer: user.drawer != null ? Number(user.drawer) : null,
      message: 'Golden Dragon drawer (moneybox) updated.'
    });
  } catch (err) {
    sendError(res, err.message || 'Update failed', err.statusCode || 500);
  }
}

module.exports = { getMe, patchUserSiteUrl, patchDrawer };
