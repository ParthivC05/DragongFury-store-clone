'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { getEffectiveStorePermissions, getEffectiveAdminPermissions } = require('../../utils/permissionHelpers');
const { logger } = require('../../libs/logger');

function hasFeature(perms, key) {
  return Boolean(perms && perms[key] === true);
}

/**
 * Admin user IDs who should receive support-ticket notifications / realtime for a store.
 * Filters by support_tickets permission (store role / admin role).
 * Primary store owners (no storeRoleId) and super admins (no adminRoleId) are included.
 *
 * @param {string|null|undefined} storeCode
 * @returns {Promise<number[]>}
 */
async function getSupportTicketAdminRecipientIds(storeCode) {
  const code = storeCode != null ? String(storeCode).trim() : '';
  const ids = new Set();

  try {
    const includeStoreRole = db.StoreRole
      ? [{ model: db.StoreRole, as: 'StoreRole', required: false }]
      : [];
    const includeAdminRole = db.AdminRole
      ? [{ model: db.AdminRole, as: 'AdminRole', required: false }]
      : [];

    const [storeAdmins, platformAdmins] = await Promise.all([
      code
        ? db.User.findAll({
            where: {
              role: ROLES.STORE_ADMIN,
              storeCode: code,
              isActive: true
            },
            attributes: ['userId', 'role', 'storeRoleId'],
            include: includeStoreRole
          })
        : Promise.resolve([]),
      db.User.findAll({
        where: { role: ROLES.MASTER_ADMIN, isActive: true },
        attributes: ['userId', 'role', 'adminRoleId'],
        include: includeAdminRole
      })
    ]);

    for (const user of storeAdmins) {
      if (!user.storeRoleId) {
        ids.add(user.userId);
        continue;
      }
      const perms = getEffectiveStorePermissions(user) || {};
      if (hasFeature(perms, STORE_FEATURE_KEYS.SUPPORT_TICKETS)) {
        ids.add(user.userId);
      }
    }

    for (const user of platformAdmins) {
      if (!user.adminRoleId) {
        ids.add(user.userId);
        continue;
      }
      const perms = getEffectiveAdminPermissions(user) || {};
      if (hasFeature(perms, ADMIN_FEATURE_KEYS.SUPPORT_TICKETS)) {
        ids.add(user.userId);
      }
    }
  } catch (err) {
    logger.warn({ err, storeCode: code }, 'getSupportTicketAdminRecipientIds failed');
  }

  return [...ids].filter((id) => id != null);
}

module.exports = {
  getSupportTicketAdminRecipientIds
};
