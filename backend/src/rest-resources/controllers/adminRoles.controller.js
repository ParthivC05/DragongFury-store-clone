'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { ADMIN_FEATURE_KEYS_LIST, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { canAdmin } = require('../../utils/permissionHelpers');

/** Admin roles: only master_admin can access. Must have admin_roles_manage permission (or be full master with no admin_role_id). */
function requireMasterAdminWithRoleAccess(req) {
  if (req.role !== ROLES.MASTER_ADMIN) {
    const err = new Error('Admin roles are only available to master administrators.');
    err.statusCode = 403;
    throw err;
  }
  if (!canAdmin(req, ADMIN_FEATURE_KEYS.ADMIN_ROLES_MANAGE)) {
    const err = new Error('You don\'t have access to manage admin roles. Please contact your master administrator.');
    err.statusCode = 403;
    throw err;
  }
}

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function validatePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') return {};
  const out = {};
  ADMIN_FEATURE_KEYS_LIST.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(permissions, k)) out[k] = !!permissions[k];
  });

  applyStoreScope(out, permissions, ADMIN_FEATURE_KEYS.FOOTER_PAGES, 'footer_pages');
  applyStoreScope(out, permissions, ADMIN_FEATURE_KEYS.BLOG_POSTS, 'blog_posts');

  return out;
}

function applyStoreScope(out, permissions, featureKey, prefix) {
  const scopeKey = `${prefix}_store_scope`;
  const codesKey = `${prefix}_store_codes`;
  if (out[featureKey]) {
    const scope = permissions[scopeKey] === 'particular' ? 'particular' : 'all';
    out[scopeKey] = scope;
    if (scope === 'particular') {
      const raw = permissions[codesKey];
      const list = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? [raw] : []);
      out[codesKey] = [...new Set(list.map((c) => normalizeStoreCode(String(c || ''))).filter(Boolean))];
    } else {
      out[codesKey] = [];
    }
  } else {
    out[scopeKey] = 'all';
    out[codesKey] = [];
  }
}

function slugFromString(s) {
  if (s == null || s === '') return '';
  return String(s).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 64) || '';
}

async function list(req, res) {
  try {
    requireMasterAdminWithRoleAccess(req);
    const rows = await db.AdminRole.findAll({
      order: [['name', 'ASC']]
    });
    const roleIds = rows.map((r) => r.id);
    const usersWithRoles = roleIds.length
      ? await db.User.findAll({
          where: { adminRoleId: roleIds, role: ROLES.MASTER_ADMIN },
          attributes: ['adminRoleId']
        })
      : [];
    const countByRoleId = {};
    roleIds.forEach((id) => { countByRoleId[id] = 0; });
    usersWithRoles.forEach((u) => {
      if (u.adminRoleId) countByRoleId[u.adminRoleId] = (countByRoleId[u.adminRoleId] || 0) + 1;
    });
    const list = rows.map((r) => {
      const json = r.toJSON();
      json.userCount = countByRoleId[r.id] || 0;
      return json;
    });
    sendSuccess(res, { list });
  } catch (err) {
    sendError(res, err.message || 'Failed to list admin roles', err.statusCode || 500);
  }
}

async function get(req, res) {
  try {
    requireMasterAdminWithRoleAccess(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid role id', 400);
    const role = await db.AdminRole.findByPk(id);
    if (!role) return sendError(res, 'Admin role not found', 404);
    sendSuccess(res, role.toJSON());
  } catch (err) {
    sendError(res, err.message || 'Failed to get admin role', err.statusCode || 500);
  }
}

async function create(req, res) {
  try {
    requireMasterAdminWithRoleAccess(req);
    const { name, slug: rawSlug, permissions } = req.body || {};
    const nameStr = name != null ? String(name).trim() : '';
    if (!nameStr) return sendError(res, 'Name is required', 400);
    let slugStr = rawSlug != null ? slugFromString(rawSlug) : '';
    if (!slugStr) slugStr = slugFromString(nameStr) || `admin_role_${Date.now()}`;
    const perms = validatePermissions(permissions);
    const existingSlug = await db.AdminRole.findOne({ where: { slug: slugStr } });
    if (existingSlug) {
      return sendError(res, 'A role with this slug already exists. Use a unique slug.', 400);
    }
    const role = await db.AdminRole.create({
      name: nameStr,
      slug: slugStr,
      permissions: perms
    });
    sendSuccess(res, role.toJSON(), 201);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return sendError(res, 'A role with this slug already exists.', 400);
    }
    sendError(res, err.message || 'Failed to create admin role', err.statusCode || 500);
  }
}

async function update(req, res) {
  try {
    requireMasterAdminWithRoleAccess(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid role id', 400);
    const role = await db.AdminRole.findByPk(id);
    if (!role) return sendError(res, 'Admin role not found', 404);
    const { name, slug: rawSlug, permissions } = req.body || {};
    if (name != null) {
      const nameStr = String(name).trim();
      if (nameStr) role.name = nameStr;
    }
    if (rawSlug != null) {
      const slugStr = slugFromString(rawSlug);
      if (slugStr) {
        const existing = await db.AdminRole.findOne({
          where: { slug: slugStr, id: { [Op.ne]: id } }
        });
        if (existing) return sendError(res, 'A role with this slug already exists.', 400);
        role.slug = slugStr;
      }
    }
    if (permissions != null) {
      role.permissions = validatePermissions(permissions);
    }
    await role.save();
    sendSuccess(res, role.toJSON());
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return sendError(res, 'A role with this slug already exists.', 400);
    }
    sendError(res, err.message || 'Failed to update admin role', err.statusCode || 500);
  }
}

async function remove(req, res) {
  try {
    requireMasterAdminWithRoleAccess(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid role id', 400);
    const role = await db.AdminRole.findByPk(id);
    if (!role) return sendError(res, 'Admin role not found', 404);
    const usersWithRole = await db.User.count({ where: { adminRoleId: id, role: ROLES.MASTER_ADMIN } });
    if (usersWithRole > 0) return sendError(res, 'Users are assigned to this role so it cannot be deleted.', 400);
    await role.destroy();
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendError(res, err.message || 'Failed to delete admin role', err.statusCode || 500);
  }
}

module.exports = { list, get, create, update, remove };
