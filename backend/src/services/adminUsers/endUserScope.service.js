'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

/**
 * Load an end-user (role user) if the admin request is allowed to access them.
 * @returns {Promise<{ user?: import('sequelize').Model, status?: number, message?: string }>}
 */
async function loadEndUserInScope(req, rawUserId) {
  const userId = parseInt(rawUserId, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return { status: 400, message: 'Invalid user id.' };
  }

  const user = await db.User.findByPk(userId);
  if (!user || user.role !== ROLES.USER) {
    return { status: 404, message: 'User not found.' };
  }

  const role = req.role;
  if (role === ROLES.MASTER_ADMIN) {
    return { user };
  }
  if (role === ROLES.DISTRIBUTOR_ADMIN && req.distributorCode && user.distributorCode === req.distributorCode) {
    return { user };
  }
  if (
    role === ROLES.STORE_ADMIN &&
    req.distributorCode &&
    req.storeCode &&
    user.distributorCode === req.distributorCode &&
    user.storeCode === req.storeCode
  ) {
    return { user };
  }

  return { status: 403, message: 'You do not have access to this user.' };
}

module.exports = { loadEndUserInScope };
