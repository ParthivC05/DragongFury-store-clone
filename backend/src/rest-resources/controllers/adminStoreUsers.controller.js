const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { encryptPassword, validatePasswordStrength } = require('../../utils/common');
const { Op } = require('sequelize');

function checkDistributorAdmin(req) {
  if (req.role !== ROLES.DISTRIBUTOR_ADMIN || !req.distributorCode) {
    const err = new Error('Forbidden. Distributor admin only.');
    err.statusCode = 403;
    throw err;
  }
}

/** Slug for store code: alphanumeric lowercase */
function toStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64) || '';
}

const SAFE_ATTRS = ['userId', 'username', 'email', 'firstName', 'lastName', 'distributorCode', 'storeCode', 'isActive', 'created_at'];

async function list(req, res) {
  try {
    checkDistributorAdmin(req);
    const code = req.distributorCode;
    const list = await db.User.findAll({
      where: { role: ROLES.STORE_ADMIN, distributorCode: code },
      attributes: SAFE_ATTRS,
      order: [['created_at', 'DESC']]
    });
    const withCounts = await Promise.all(
      list.map(async (u) => {
        const storeCode = u.storeCode;
        const userCount = storeCode
          ? await db.User.count({ where: { distributorCode: code, storeCode, role: ROLES.USER } })
          : 0;
        return { ...u.toJSON(), userCount };
      })
    );
    sendSuccess(res, withCounts);
  } catch (err) {
    sendError(res, err.message || 'Failed to list store users', err.statusCode || 500);
  }
}

async function create(req, res) {
  try {
    checkDistributorAdmin(req);
    const code = req.distributorCode;
    const { email, password, username: rawUsername, firstName, lastName, storeCode: rawStoreCode, isActive } = req.body || {};
    const emailNorm = (email != null && String(email).trim()) ? String(email).trim().toLowerCase() : '';
    if (!emailNorm || emailNorm.length < 3) return sendError(res, 'Email is required', 400);
    if (!password || typeof password !== 'string') return sendError(res, 'Password is required', 400);

    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) return sendError(res, pwdCheck.error, 400);

    const username = (rawUsername != null && String(rawUsername).trim()) ? String(rawUsername).trim() : (emailNorm.split('@')[0] || `store_${Date.now()}`);
    const storeFromUsername = toStoreCode(username);
    const storeCode = (rawStoreCode != null && String(rawStoreCode).trim()) ? toStoreCode(String(rawStoreCode).trim()) : storeFromUsername;
    if (!storeCode) return sendError(res, 'Store code is required (or provide a username to generate one)', 400);

    const existingEmail = await db.User.findOne({ where: { email: emailNorm } });
    if (existingEmail) return sendError(res, 'An account with this email already exists.', 400);

    const existingUsername = await db.User.findOne({
      where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, username.toLowerCase())
    });
    if (existingUsername) return sendError(res, 'This username is already taken.', 400);

    const existingStore = await db.User.findOne({ where: { role: ROLES.STORE_ADMIN, distributorCode: code, storeCode } });
    if (existingStore) return sendError(res, 'A store with this store code already exists under your distribution. Choose another.', 400);

    const user = await db.User.create({
      email: emailNorm,
      password: encryptPassword(password.trim()),
      username,
      firstName: (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null,
      lastName: (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null,
      role: ROLES.STORE_ADMIN,
      isAdmin: true,
      distributorCode: code,
      storeCode,
      isActive: isActive !== false,
      isEmailVerified: true,
      signInType: 'NORMAL'
    });

    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create store user', err.statusCode || 500);
  }
}

async function get(req, res) {
  try {
    checkDistributorAdmin(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid store user id', 400);
    const user = await db.User.findOne({
      where: { userId: id, role: ROLES.STORE_ADMIN, distributorCode: req.distributorCode },
      attributes: SAFE_ATTRS
    });
    if (!user) return sendError(res, 'Store user not found', 404);
    const storeCode = user.storeCode;
    const userCount = storeCode
      ? await db.User.count({ where: { distributorCode: req.distributorCode, storeCode, role: ROLES.USER } })
      : 0;
    sendSuccess(res, { ...user.toJSON(), userCount });
  } catch (err) {
    sendError(res, err.message || 'Failed to get store user', err.statusCode || 500);
  }
}

async function update(req, res) {
  try {
    checkDistributorAdmin(req);
    const code = req.distributorCode;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid store user id', 400);
    const user = await db.User.findOne({ where: { userId: id, role: ROLES.STORE_ADMIN, distributorCode: code } });
    if (!user) return sendError(res, 'Store user not found', 404);

    const { email, username: rawUsername, firstName, lastName, storeCode: rawStoreCode, isActive } = req.body || {};
    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      if (!emailNorm) return sendError(res, 'Email cannot be empty', 400);
      const existing = await db.User.findOne({ where: { email: emailNorm } });
      if (existing && existing.userId !== id) return sendError(res, 'An account with this email already exists.', 400);
      user.email = emailNorm;
    }
    if (rawUsername !== undefined) {
      const un = String(rawUsername).trim();
      if (un) {
        const existing = await db.User.findOne({
          where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, un.toLowerCase())
        });
        if (existing && existing.userId !== id) return sendError(res, 'This username is already taken.', 400);
        user.username = un;
      }
    }
    if (firstName !== undefined) user.firstName = (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null;
    if (lastName !== undefined) user.lastName = (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null;
    if (rawStoreCode !== undefined) {
      const storeCode = toStoreCode(String(rawStoreCode).trim());
      if (!storeCode) return sendError(res, 'Store code cannot be empty', 400);
      const existing = await db.User.findOne({ where: { role: ROLES.STORE_ADMIN, distributorCode: code, storeCode } });
      if (existing && existing.userId !== id) return sendError(res, 'This store code is already in use.', 400);
      user.storeCode = storeCode;
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;

    await user.save();
    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe);
  } catch (err) {
    sendError(res, err.message || 'Failed to update store user', err.statusCode || 500);
  }
}

async function remove(req, res) {
  try {
    checkDistributorAdmin(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid store user id', 400);
    const user = await db.User.findOne({ where: { userId: id, role: ROLES.STORE_ADMIN, distributorCode: req.distributorCode } });
    if (!user) return sendError(res, 'Store user not found', 404);
    const storeCode = user.storeCode;
    const userCount = storeCode
      ? await db.User.count({ where: { distributorCode: req.distributorCode, storeCode, role: ROLES.USER } })
      : 0;
    if (userCount > 0) return sendError(res, 'Cannot delete store with users. Remove or reassign users first.', 400);
    await user.destroy();
    sendSuccess(res, { deleted: true });
  } catch (err) {
    sendError(res, err.message || 'Failed to delete store user', err.statusCode || 500);
  }
}

module.exports = { list, create, get, update, remove };
