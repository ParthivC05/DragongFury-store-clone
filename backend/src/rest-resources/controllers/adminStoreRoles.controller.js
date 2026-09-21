'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES, isMasterAdmin } = require('../../constants/roles');
const { STORE_FEATURE_KEYS_LIST, STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { OWNER_PAGE_PERMISSIONS_SLUG } = require('../../services/store/storeOwnerPermissions.service');

/**
 * Store roles: store_admin with store_roles_manage, or master/technical staff with admin_staff_manage.
 * Master must scope by distributorCode+storeCode (query/body) for list/create; get/update/delete by role id.
 */
function requireStoreRolesManage(req) {
  if (isMasterAdmin(req.role)) {
    if (!canAdmin(req, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)) {
      const err = new Error('You don\'t have access to manage store roles. Please contact your master administrator if you need this access.');
      err.statusCode = 403;
      throw err;
    }
    return;
  }
  if (req.role !== ROLES.STORE_ADMIN) {
    const err = new Error('Store roles are only available to store administrators. If you need access, contact your store admin.');
    err.statusCode = 403;
    throw err;
  }
  if (!req.storeCode || !req.distributorCode) {
    const err = new Error('Your account is not linked to a store. Please contact your administrator.');
    err.statusCode = 403;
    throw err;
  }
  if (!can(req, STORE_FEATURE_KEYS.STORE_ROLES_MANAGE)) {
    const err = new Error('You don\'t have access to manage Store roles. Please contact your store administrator if you need this access.');
    err.statusCode = 403;
    throw err;
  }
}

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

function validatePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') return {};
  const out = {};
  STORE_FEATURE_KEYS_LIST.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(permissions, k)) out[k] = !!permissions[k];
  });
  return out;
}

/**
 * Store admins may only grant permissions they themselves have (req.permissions).
 * Master/technical staff may grant any store feature key.
 * Keys the store admin does not have are always forced off (cannot escalate).
 */
function clampPermissionsToRequester(req, permissions) {
  const validated = validatePermissions(permissions);
  if (isMasterAdmin(req.role)) {
    const out = {};
    STORE_FEATURE_KEYS_LIST.forEach((k) => {
      out[k] = !!validated[k];
    });
    return out;
  }
  const allowed = req.permissions && typeof req.permissions === 'object' ? req.permissions : {};
  const out = {};
  STORE_FEATURE_KEYS_LIST.forEach((k) => {
    if (allowed[k] === true) {
      out[k] = !!validated[k];
    } else {
      out[k] = false;
    }
  });
  return out;
}

async function findRoleForRequester(req, id) {
  if (isMasterAdmin(req.role)) {
    return db.StoreRole.findOne({
      where: { id, slug: { [Op.ne]: OWNER_PAGE_PERMISSIONS_SLUG } }
    });
  }
  return db.StoreRole.findOne({
    where: {
      id,
      distributorCode: req.distributorCode,
      storeCode: req.storeCode,
      slug: { [Op.ne]: OWNER_PAGE_PERMISSIONS_SLUG }
    }
  });
}

async function list(req, res) {
  try {
    requireStoreRolesManage(req);
    const scope = resolveStoreScope(req, { required: true });
    const rows = await db.StoreRole.findAll({
      where: {
        distributorCode: scope.distributorCode,
        storeCode: scope.storeCode,
        slug: { [Op.ne]: OWNER_PAGE_PERMISSIONS_SLUG }
      },
      order: [['name', 'ASC']]
    });
    const roleIds = rows.map((r) => r.id);
    const usersWithRoles = roleIds.length
      ? await db.User.findAll({
          where: { storeRoleId: roleIds, role: ROLES.STORE_ADMIN },
          attributes: ['storeRoleId']
        })
      : [];
    const countByRoleId = {};
    roleIds.forEach((id) => { countByRoleId[id] = 0; });
    usersWithRoles.forEach((u) => {
      if (u.storeRoleId) countByRoleId[u.storeRoleId] = (countByRoleId[u.storeRoleId] || 0) + 1;
    });
    const list = rows.map((r) => {
      const json = r.toJSON();
      json.userCount = countByRoleId[r.id] || 0;
      return json;
    });
    sendSuccess(res, { list, distributorCode: scope.distributorCode, storeCode: scope.storeCode });
  } catch (err) {
    sendError(res, err.message || 'Failed to list store roles', err.statusCode || 500);
  }
}

async function get(req, res) {
  try {
    requireStoreRolesManage(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid role id', 400);
    const role = await findRoleForRequester(req, id);
    if (!role) return sendError(res, 'Store role not found', 404);
    sendSuccess(res, role.toJSON());
  } catch (err) {
    sendError(res, err.message || 'Failed to get store role', err.statusCode || 500);
  }
}

function slugFromString(s) {
  if (s == null || s === '') return '';
  return String(s).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 64) || '';
}

async function create(req, res) {
  try {
    requireStoreRolesManage(req);
    const scope = resolveStoreScope(req, { required: true });
    const { name, slug: rawSlug, permissions } = req.body || {};
    const nameStr = name != null ? String(name).trim() : '';
    if (!nameStr) return sendError(res, 'Name is required', 400);
    let slugStr = rawSlug != null ? slugFromString(rawSlug) : '';
    if (!slugStr) slugStr = slugFromString(nameStr) || `role_${Date.now()}`;
    const perms = clampPermissionsToRequester(req, permissions);
    const existingSlug = await db.StoreRole.findOne({
      where: {
        distributorCode: scope.distributorCode,
        storeCode: scope.storeCode,
        slug: slugStr
      }
    });
    if (existingSlug) {
      return sendError(res, 'A role with this slug already exists in your store. Use a unique slug.', 400);
    }
    if (slugStr === OWNER_PAGE_PERMISSIONS_SLUG) {
      return sendError(res, 'This slug is reserved. Choose a different slug.', 400);
    }
    const role = await db.StoreRole.create({
      distributorCode: scope.distributorCode,
      storeCode: scope.storeCode,
      name: nameStr,
      slug: slugStr,
      permissions: perms
    });
    sendSuccess(res, role.toJSON(), 201);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return sendError(res, 'A role with this slug already exists in your store.', 400);
    }
    sendError(res, err.message || 'Failed to create store role', err.statusCode || 500);
  }
}

async function update(req, res) {
  try {
    requireStoreRolesManage(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid role id', 400);
    const role = await findRoleForRequester(req, id);
    if (!role) return sendError(res, 'Store role not found', 404);
    const { name, slug: rawSlug, permissions } = req.body || {};
    if (name != null) {
      const nameStr = String(name).trim();
      if (nameStr) role.name = nameStr;
    }
    if (rawSlug != null) {
      const slugStr = slugFromString(rawSlug);
      if (slugStr) {
        const existing = await db.StoreRole.findOne({
          where: {
            distributorCode: role.distributorCode,
            storeCode: role.storeCode,
            slug: slugStr,
            id: { [Op.ne]: id }
          }
        });
        if (existing) return sendError(res, 'A role with this slug already exists in your store.', 400);
        role.slug = slugStr;
      }
    }
    if (permissions != null) {
      role.permissions = clampPermissionsToRequester(req, permissions);
    }
    await role.save();
    sendSuccess(res, role.toJSON());
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return sendError(res, 'A role with this slug already exists in your store.', 400);
    }
    sendError(res, err.message || 'Failed to update store role', err.statusCode || 500);
  }
}

async function remove(req, res) {
  try {
    requireStoreRolesManage(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid role id', 400);
    const role = await findRoleForRequester(req, id);
    if (!role) return sendError(res, 'Store role not found', 404);
    const usersWithRole = await db.User.count({ where: { storeRoleId: id, role: ROLES.STORE_ADMIN } });
    if (usersWithRole > 0) return sendError(res, 'Users are assigned to this role so it cannot be deleted.', 400);
    await role.destroy();
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendError(res, err.message || 'Failed to delete store role', err.statusCode || 500);
  }
}

module.exports = { list, get, create, update, remove };
