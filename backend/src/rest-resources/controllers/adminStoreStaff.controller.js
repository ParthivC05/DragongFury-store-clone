'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES, isMasterAdmin } = require('../../constants/roles');
const { encryptPassword, validatePasswordStrength } = require('../../utils/common');
const { decodePasswordBody } = require('../../utils/passwordEncryption');
const { Op } = require('sequelize');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

const SAFE_ATTRS = ['userId', 'username', 'email', 'firstName', 'lastName', 'storeRoleId', 'isActive', 'created_at'];
const MASTER_LIST_ATTRS = [...SAFE_ATTRS, 'distributorCode', 'storeCode'];

/** Store admin with store_staff_manage, or master/technical staff with admin_staff_manage. */
function requireStoreStaffManage(req) {
  if (isMasterAdmin(req.role)) {
    if (!canAdmin(req, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)) {
      const err = new Error('You don\'t have access to manage store staff. Please contact your master administrator if you need this access.');
      err.statusCode = 403;
      throw err;
    }
    return;
  }
  if (req.role !== ROLES.STORE_ADMIN || !req.storeCode || !req.distributorCode) {
    const err = new Error('Store staff is only available to store administrators. If you need access, contact your store admin.');
    err.statusCode = 403;
    throw err;
  }
  if (!can(req, STORE_FEATURE_KEYS.STORE_STAFF_MANAGE)) {
    const err = new Error('You don\'t have access to manage Store staff. Please contact your store administrator if you need this access.');
    err.statusCode = 403;
    throw err;
  }
}

function requireMasterAdminWithStaffView(req) {
  if (!isMasterAdmin(req.role)) {
    const err = new Error('Store staff listing for all stores is only available to master administrators.');
    err.statusCode = 403;
    throw err;
  }
  if (!canAdmin(req, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)) {
    const err = new Error('You don\'t have access to view store staff. Please contact your master administrator if you need this access.');
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Resolve target store codes for create/list scoped operations.
 * Store admin: always own store. Master: body or query distributorCode+storeCode.
 */
function resolveStoreScope(req, { required = true } = {}) {
  if (isMasterAdmin(req.role)) {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const distributorCode = src.distributorCode != null ? String(src.distributorCode).trim() : '';
    const storeCode = src.storeCode != null ? String(src.storeCode).trim() : '';
    if (required && (!distributorCode || !storeCode)) {
      const err = new Error('distributorCode and storeCode are required.');
      err.statusCode = 400;
      throw err;
    }
    return { distributorCode: distributorCode || null, storeCode: storeCode || null };
  }
  return { distributorCode: req.distributorCode, storeCode: req.storeCode };
}

function mapStoreStaffRows(rows, { includeStoreContext = false } = {}) {
  return rows.map((r) => {
    const j = r.toJSON();
    if (j.StoreRole) { j.storeRole = j.StoreRole; delete j.StoreRole; }
    if (!includeStoreContext) {
      delete j.distributorCode;
      delete j.storeCode;
    }
    return j;
  });
}

/** List store staff: store admin sees own store; master admin sees all stores (optional distributorCode/storeCode filters). */
async function list(req, res) {
  try {
    if (isMasterAdmin(req.role)) {
      requireMasterAdminWithStaffView(req);
      const where = {
        role: ROLES.STORE_ADMIN,
        distributorCode: { [Op.ne]: null },
        storeCode: { [Op.ne]: null }
      };
      const dc = req.query.distributorCode != null ? String(req.query.distributorCode).trim() : '';
      const sc = req.query.storeCode != null ? String(req.query.storeCode).trim() : '';
      if (dc) where.distributorCode = dc;
      if (sc) where.storeCode = sc;

      const rows = await db.User.findAll({
        where,
        attributes: MASTER_LIST_ATTRS,
        include: [{ model: db.StoreRole, as: 'StoreRole', required: false, attributes: ['id', 'name', 'slug'] }],
        order: [['distributorCode', 'ASC'], ['storeCode', 'ASC'], ['created_at', 'DESC']]
      });
      sendSuccess(res, { list: mapStoreStaffRows(rows, { includeStoreContext: true }) });
      return;
    }

    requireStoreStaffManage(req);
    const rows = await db.User.findAll({
      where: {
        role: ROLES.STORE_ADMIN,
        distributorCode: req.distributorCode,
        storeCode: req.storeCode
      },
      attributes: SAFE_ATTRS,
      include: [{ model: db.StoreRole, as: 'StoreRole', required: false, attributes: ['id', 'name', 'slug'] }],
      order: [['created_at', 'DESC']]
    });
    sendSuccess(res, { list: mapStoreStaffRows(rows) });
  } catch (err) {
    sendError(res, err.message || 'Failed to list store staff', err.statusCode || 500);
  }
}

/** Create a store staff user (same store, role=store_admin, store_role_id=body.storeRoleId). */
async function create(req, res) {
  try {
    requireStoreStaffManage(req);
    const scope = resolveStoreScope(req, { required: true });
    const body = decodePasswordBody(req.body || {});
    const { email, password, username: rawUsername, firstName, lastName, storeRoleId: rawStoreRoleId, isActive } = body;
    const emailNorm = (email != null && String(email).trim()) ? String(email).trim().toLowerCase() : '';
    if (!emailNorm || emailNorm.length < 3) return sendError(res, 'Email is required', 400);
    if (!password || typeof password !== 'string') return sendError(res, 'Password is required', 400);
    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) return sendError(res, pwdCheck.error, 400);

    const username = (rawUsername != null && String(rawUsername).trim()) ? String(rawUsername).trim() : (emailNorm.split('@')[0] || `staff_${Date.now()}`);
    const existingEmail = await db.User.findOne({ where: { email: emailNorm } });
    if (existingEmail) return sendError(res, 'An account with this email already exists.', 400);
    const existingUsername = await db.User.findOne({
      where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, username.toLowerCase())
    });
    if (existingUsername) return sendError(res, 'This username is already taken.', 400);

    let storeRoleId = null;
    if (rawStoreRoleId != null && rawStoreRoleId !== '') {
      const id = parseInt(rawStoreRoleId, 10);
      if (id) {
        const { OWNER_PAGE_PERMISSIONS_SLUG } = require('../../services/store/storeOwnerPermissions.service');
        const sr = await db.StoreRole.findOne({
          where: {
            id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode,
            slug: { [Op.ne]: OWNER_PAGE_PERMISSIONS_SLUG }
          }
        });
        if (sr) storeRoleId = id;
      }
    }

    const user = await db.User.create({
      email: emailNorm,
      password: encryptPassword(password.trim()),
      username,
      firstName: (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null,
      lastName: (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null,
      role: ROLES.STORE_ADMIN,
      isAdmin: true,
      distributorCode: scope.distributorCode,
      storeCode: scope.storeCode,
      storeRoleId,
      isActive: isActive !== false,
      isEmailVerified: true,
      signInType: 'NORMAL'
    });
    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create store staff', err.statusCode || 500);
  }
}

/** Update store staff (store_role_id, isActive, name). Store admin: same store. Master: any store. */
async function update(req, res) {
  try {
    requireStoreStaffManage(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid user id', 400);

    const where = { userId: id, role: ROLES.STORE_ADMIN };
    if (!isMasterAdmin(req.role)) {
      where.distributorCode = req.distributorCode;
      where.storeCode = req.storeCode;
    }

    const user = await db.User.findOne({ where });
    if (!user) return sendError(res, 'Store staff not found', 404);

    const { firstName, lastName, storeRoleId: rawStoreRoleId, isActive } = req.body || {};
    if (firstName !== undefined) user.firstName = (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null;
    if (lastName !== undefined) user.lastName = (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (rawStoreRoleId !== undefined) {
      if (rawStoreRoleId === null || rawStoreRoleId === '') user.storeRoleId = null;
      else {
        const sid = parseInt(rawStoreRoleId, 10);
        if (sid) {
          const { OWNER_PAGE_PERMISSIONS_SLUG } = require('../../services/store/storeOwnerPermissions.service');
          const sr = await db.StoreRole.findOne({
            where: {
              id: sid,
              distributorCode: user.distributorCode,
              storeCode: user.storeCode,
              slug: { [Op.ne]: OWNER_PAGE_PERMISSIONS_SLUG }
            }
          });
          if (sr) user.storeRoleId = sid;
        }
      }
    }
    await user.save();
    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe);
  } catch (err) {
    sendError(res, err.message || 'Failed to update store staff', err.statusCode || 500);
  }
}

/** Delete store staff. Store admin: same store. Master: any store. Cannot delete self. */
async function remove(req, res) {
  try {
    requireStoreStaffManage(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid user id', 400);
    const currentUserId = req.user?.userId;
    if (id === currentUserId) return sendError(res, 'You cannot delete your own account.', 400);

    const where = { userId: id, role: ROLES.STORE_ADMIN };
    if (!isMasterAdmin(req.role)) {
      where.distributorCode = req.distributorCode;
      where.storeCode = req.storeCode;
    }

    const user = await db.User.findOne({ where });
    if (!user) return sendError(res, 'Store staff not found', 404);
    await user.destroy();
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendError(res, err.message || 'Failed to delete store staff', err.statusCode || 500);
  }
}

module.exports = { list, create, update, remove };
