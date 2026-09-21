'use strict';

const { sendError } = require('../../helpers/response.helpers');
const { STAFF_SHIFT_ENDED_CODE } = require('../../constants/staffAttendance');
const { getStoreStaffSessionGate } = require('../../services/staffAttendance/assertStaffLoginAllowed.service');

function isAllowedWhileShiftEnded(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || '');
  if (method === 'GET' && (path === '/me' || path === '/me/attendance')) return true;
  if (method === 'POST' && path === '/me/attendance/check-out') return true;
  return false;
}

/**
 * Store staff with an allocated shift cannot approve requests or open other pages
 * after the shift ends (unless off-shift login was approved). Check-out is still allowed.
 */
async function requireStoreStaffShiftActive(req, res, next) {
  try {
    const gate = await getStoreStaffSessionGate({
      userId: req.user?.userId,
      role: req.role,
      storeRoleId: req.storeRoleId
    });
    if (!gate.sessionBlocked) return next();
    if (isAllowedWhileShiftEnded(req)) return next();

    return sendError(
      res,
      gate.mustCheckOut
        ? 'Your shift has ended. Enter your closing balance and check out.'
        : 'Your shift has ended. You cannot continue working until your next shift.',
      403,
      STAFF_SHIFT_ENDED_CODE,
      { data: { mustCheckOut: Boolean(gate.mustCheckOut) } }
    );
  } catch (_) {
    return next();
  }
}

module.exports = { requireStoreStaffShiftActive };
