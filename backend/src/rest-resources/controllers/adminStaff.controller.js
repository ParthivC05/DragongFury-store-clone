'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { encryptPassword, validatePasswordStrength } = require('../../utils/common');
const { decodePasswordBody } = require('../../utils/passwordEncryption');
const { Op } = require('sequelize');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

const SAFE_ATTRS = ['userId', 'username', 'email', 'firstName', 'lastName', 'adminRoleId', 'isActive', 'created_at'];

function requireMasterAdminWithStaffManage(req) {
  if (req.role !== ROLES.MASTER_ADMIN) {
    const err = new Error('Admin staff is only available to master administrators.');
    err.statusCode = 403;
    throw err;
  }
  if (!canAdmin(req, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)) {
    const err = new Error('You don\'t have access to manage admin staff. Please contact your master administrator.');
    err.statusCode = 403;
    throw err;
  }
}

/** List admin staff: users with role master_admin. */
async function list(req, res) {
  try {
    requireMasterAdminWithStaffManage(req);
    const rows = await db.User.findAll({
      where: { role: ROLES.MASTER_ADMIN },
      attributes: SAFE_ATTRS,
      include: [{ model: db.AdminRole, as: 'AdminRole', required: false, attributes: ['id', 'name', 'slug'] }],
      order: [['created_at', 'DESC']]
    });
    const list = rows.map((r) => {
      const j = r.toJSON();
      if (j.AdminRole) { j.adminRole = j.AdminRole; delete j.AdminRole; }
      return j;
    });
    sendSuccess(res, { list });
  } catch (err) {
    sendError(res, err.message || 'Failed to list admin staff', err.statusCode || 500);
  }
}

/** Create an admin staff user (role=master_admin, optional admin_role_id). */
async function create(req, res) {
  try {
    requireMasterAdminWithStaffManage(req);
    const body = decodePasswordBody(req.body || {});
    const { email, password, username: rawUsername, firstName, lastName, adminRoleId: rawAdminRoleId, isActive } = body;
    const emailNorm = (email != null && String(email).trim()) ? String(email).trim().toLowerCase() : '';
    if (!emailNorm || emailNorm.length < 3) return sendError(res, 'Email is required', 400);
    if (!password || typeof password !== 'string') return sendError(res, 'Password is required', 400);
    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) return sendError(res, pwdCheck.error, 400);

    const username = (rawUsername != null && String(rawUsername).trim()) ? String(rawUsername).trim() : (emailNorm.split('@')[0] || `admin_staff_${Date.now()}`);
    const existingEmail = await db.User.findOne({ where: { email: emailNorm } });
    if (existingEmail) return sendError(res, 'An account with this email already exists.', 400);
    const existingUsername = await db.User.findOne({
      where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, username.toLowerCase())
    });
    if (existingUsername) return sendError(res, 'This username is already taken.', 400);

    let adminRoleId = null;
    if (rawAdminRoleId != null && rawAdminRoleId !== '') {
      const id = parseInt(rawAdminRoleId, 10);
      if (id) {
        const ar = await db.AdminRole.findByPk(id);
        if (ar) adminRoleId = id;
      }
    }

    const user = await db.User.create({
      email: emailNorm,
      password: encryptPassword(password.trim()),
      username,
      firstName: (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null,
      lastName: (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null,
      role: ROLES.MASTER_ADMIN,
      isAdmin: true,
      distributorCode: null,
      storeCode: null,
      storeRoleId: null,
      adminRoleId,
      isActive: isActive !== false,
      isEmailVerified: true,
      signInType: 'NORMAL'
    });
    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create admin staff', err.statusCode || 500);
  }
}

/** Update admin staff (admin_role_id, isActive, name). */
async function update(req, res) {
  try {
    requireMasterAdminWithStaffManage(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid user id', 400);
    const user = await db.User.findOne({
      where: { userId: id, role: ROLES.MASTER_ADMIN }
    });
    if (!user) return sendError(res, 'Admin staff not found', 404);
    const { firstName, lastName, adminRoleId: rawAdminRoleId, isActive } = req.body || {};
    if (firstName !== undefined) user.firstName = (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null;
    if (lastName !== undefined) user.lastName = (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (rawAdminRoleId !== undefined) {
      if (rawAdminRoleId === null || rawAdminRoleId === '') user.adminRoleId = null;
      else {
        const aid = parseInt(rawAdminRoleId, 10);
        if (aid) {
          const ar = await db.AdminRole.findByPk(aid);
          if (ar) user.adminRoleId = aid;
        }
      }
    }
    await user.save();
    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe);
  } catch (err) {
    sendError(res, err.message || 'Failed to update admin staff', err.statusCode || 500);
  }
}

/** Delete admin staff. Cannot delete self. */
async function remove(req, res) {
  try {
    requireMasterAdminWithStaffManage(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid user id', 400);
    const currentUserId = req.user?.userId;
    if (id === currentUserId) return sendError(res, 'You cannot delete your own account.', 400);
    const user = await db.User.findOne({
      where: { userId: id, role: ROLES.MASTER_ADMIN }
    });
    if (!user) return sendError(res, 'Admin staff not found', 404);
    await user.destroy();
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendError(res, err.message || 'Failed to delete admin staff', err.statusCode || 500);
  }
}

module.exports = { list, create, update, remove };
