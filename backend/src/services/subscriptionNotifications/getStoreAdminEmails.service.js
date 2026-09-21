'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

/**
 * Get primary store admin email(s) for a store (distributorCode + storeCode).
 * Returns emails of store admins (role=store_admin, storeRoleId=null for primary; optionally all store admins).
 * @param {string} distributorCode
 * @param {string} storeCode
 * @param {{ allAdmins?: boolean }} opts - If allAdmins true, return all store admin emails for this store; otherwise primary only (storeRoleId null).
 * @returns {Promise<string[]>}
 */
async function getStoreAdminEmails(distributorCode, storeCode, opts = {}) {
  const where = {
    role: ROLES.STORE_ADMIN,
    distributorCode: distributorCode || null,
    storeCode: storeCode || null,
    isActive: true
  };
  if (!opts.allAdmins) {
    where.storeRoleId = null;
  }
  const users = await db.User.findAll({
    where,
    attributes: ['email'],
    raw: true
  });
  const emails = users.map((u) => u.email).filter((e) => e && String(e).trim());
  return [...new Set(emails)];
}

module.exports = { getStoreAdminEmails };
