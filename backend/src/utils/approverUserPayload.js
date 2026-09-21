'use strict';

/** User columns loaded for approver rows in admin lists. */
const APPROVER_USER_ATTRS = ['userId', 'username', 'email', 'firstName', 'lastName', 'role'];

/** Nested includes so approver rows expose AdminRole.name / StoreRole.name for UI. */
function approverUserNestedIncludes(db) {
  const nested = [];
  if (db.AdminRole) nested.push({ model: db.AdminRole, attributes: ['name'], required: false });
  if (db.StoreRole) nested.push({ model: db.StoreRole, attributes: ['name'], required: false });
  return nested;
}

function buildApproverPayload(u) {
  if (!u) return null;
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  const displayName = name || u.username || u.email || `User #${u.userId}`;
  let panelRoleName = null;
  if (u.AdminRole && u.AdminRole.name) panelRoleName = String(u.AdminRole.name).trim() || null;
  else if (u.StoreRole && u.StoreRole.name) panelRoleName = String(u.StoreRole.name).trim() || null;
  return {
    userId: u.userId,
    username: u.username,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role || null,
    panelRoleName,
    displayName
  };
}

module.exports = {
  APPROVER_USER_ATTRS,
  approverUserNestedIncludes,
  buildApproverPayload
};
