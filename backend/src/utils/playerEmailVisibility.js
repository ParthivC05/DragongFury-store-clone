'use strict';

const { isMasterAdmin } = require('../constants/roles');

/**
 * Only master_admin (super admin + platform technical staff) may see end-user / player emails.
 * Store admin and store staff must not receive player emails — manage by userId instead.
 */
function canViewPlayerEmail(role) {
  return isMasterAdmin(role);
}

/** Drop `email` from Sequelize attributes when the viewer cannot see player emails. */
function omitPlayerEmailAttr(attrs, role) {
  if (canViewPlayerEmail(role) || !Array.isArray(attrs)) return attrs;
  return attrs.filter((a) => a !== 'email');
}

/**
 * Remove `email` from a plain user-like object (mutates and returns it).
 * Safe no-op when viewer can see emails or obj is missing.
 */
function stripPlayerEmailFields(obj, role) {
  if (canViewPlayerEmail(role) || !obj || typeof obj !== 'object') return obj;
  if (Object.prototype.hasOwnProperty.call(obj, 'email')) delete obj.email;
  return obj;
}

/** @deprecated Masking removed — always returns null/stripped for non-master. Kept for call sites. */
function maskPlayerEmail(_email) {
  return null;
}

/** Full email for master_admin; otherwise omit (return null/undefined). */
function resolvePlayerEmail(email, role) {
  if (!canViewPlayerEmail(role)) return null;
  return email;
}

module.exports = {
  canViewPlayerEmail,
  omitPlayerEmailAttr,
  stripPlayerEmailFields,
  maskPlayerEmail,
  resolvePlayerEmail
};
