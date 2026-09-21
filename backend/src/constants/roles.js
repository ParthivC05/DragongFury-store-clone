'use strict';

const ROLES = {
  MASTER_ADMIN: 'master_admin',
  DISTRIBUTOR_ADMIN: 'distributor_admin',
  STORE_ADMIN: 'store_admin',
  USER: 'user'
};

const ADMIN_PANEL_ROLES = [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN];

function normalizeRoleKey(role) {
  if (role == null || role === '') return '';
  return String(role).toLowerCase().trim();
}

function isAdminPanelRole(role) {
  const r = normalizeRoleKey(role);
  return r !== '' && ADMIN_PANEL_ROLES.includes(r);
}

/** Panel roles or legacy is_admin: treated as email-verified without customer verification flow. */
function isAdminPanelAccount(role, isAdmin) {
  if (isAdminPanelRole(role)) return true;
  return isAdmin === true || isAdmin === 1;
}

function isMasterAdmin(role) {
  return normalizeRoleKey(role) === ROLES.MASTER_ADMIN;
}

function isDistributorAdmin(role) {
  return normalizeRoleKey(role) === ROLES.DISTRIBUTOR_ADMIN;
}

function isStoreAdmin(role) {
  return normalizeRoleKey(role) === ROLES.STORE_ADMIN;
}

module.exports = {
  ROLES,
  normalizeRoleKey,
  isAdminPanelRole,
  isAdminPanelAccount,
  isMasterAdmin,
  isDistributorAdmin,
  isStoreAdmin
};
