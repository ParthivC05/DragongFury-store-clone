'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

/**
 * Get email addresses of master_admin users who should receive technical error notifications.
 * - master_admin with no admin_role_id: receives (full access).
 * - master_admin with admin_role_id: receives only if role has technical_error_email_notification permission.
 * @returns {Promise<string[]>}
 */
async function getTechnicalErrorNotificationEmails() {
  const users = await db.User.findAll({
    where: { role: ROLES.MASTER_ADMIN, isActive: true },
    attributes: ['userId', 'email', 'adminRoleId'],
    include: [{ model: db.AdminRole, as: 'AdminRole', required: false, attributes: ['permissions'] }],
    raw: false
  });
  const emails = [];
  for (const user of users) {
    if (!user.email || !String(user.email).trim()) continue;
    if (!user.adminRoleId) {
      emails.push(user.email.trim());
      continue;
    }
    const role = user.AdminRole;
    if (!role || !role.permissions) continue;
    if (role.permissions[ADMIN_FEATURE_KEYS.TECHNICAL_ERROR_EMAIL_NOTIFICATION] === true) {
      emails.push(user.email.trim());
    }
  }
  return [...new Set(emails)];
}

module.exports = { getTechnicalErrorNotificationEmails };
