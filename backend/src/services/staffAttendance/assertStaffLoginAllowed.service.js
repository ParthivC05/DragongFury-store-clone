'use strict';

const db = require('../../db/models');
const { isStoreAdmin } = require('../../constants/roles');
const {
  OFF_SHIFT_STATUS,
  STAFF_OFF_SHIFT_CODE
} = require('../../constants/staffAttendance');
const {
  httpError,
  isWithinShiftWindow,
  serializeShift
} = require('./shiftWindow.helpers');

function isStoreStaffUser(user) {
  return Boolean(user && isStoreAdmin(user.role) && user.storeRoleId != null);
}

async function findActiveOffShiftApproval(userId, now = new Date()) {
  return db.StoreStaffOffShiftRequest.findOne({
    where: {
      userId,
      status: OFF_SHIFT_STATUS.APPROVED,
      validUntil: { [db.Sequelize.Op.gt]: now }
    },
    order: [['validUntil', 'DESC']]
  });
}

async function findPendingOffShiftRequest(userId) {
  return db.StoreStaffOffShiftRequest.findOne({
    where: { userId, status: OFF_SHIFT_STATUS.PENDING },
    order: [['created_at', 'DESC']]
  });
}

/**
 * Store staff may log in freely until a shift is allocated.
 * After a shift exists, they may log in only during that window, or with a valid off-shift approval.
 * Store owners (no storeRoleId) and platform admins are never gated.
 */
async function assertStoreStaffLoginAllowed(user, now = new Date()) {
  if (!isStoreStaffUser(user)) return { allowed: true, punchRequired: false, shift: null };

  const shift = await db.StoreStaffShift.findOne({ where: { userId: user.userId } });
  if (!shift) {
    return { allowed: true, punchRequired: false, shift: null };
  }

  const inShiftWindow = isWithinShiftWindow(now, shift.timezone, shift.startTime, shift.endTime);
  const offShiftApproval = inShiftWindow ? null : await findActiveOffShiftApproval(user.userId, now);
  if (inShiftWindow || offShiftApproval) {
    return {
      allowed: true,
      punchRequired: true,
      shift,
      isOffShift: !inShiftWindow,
      offShiftValidUntil: offShiftApproval?.validUntil || null
    };
  }

  const pending = await findPendingOffShiftRequest(user.userId);
  const shiftPayload = serializeShift(shift, { now });
  throw httpError(
    pending
      ? 'You are outside your allocated shift. An off-shift login request is already pending approval.'
      : 'You are outside your allocated shift. Request off-shift access from super admin or technical staff.',
    403,
    STAFF_OFF_SHIFT_CODE,
    {
      shift: shiftPayload,
      pendingRequest: Boolean(pending),
      canRequestOffShift: !pending
    }
  );
}

/**
 * After login, staff may keep working only while the shift (or approved off-shift) is active.
 * Returns sessionBlocked when the shift has ended.
 */
async function getStoreStaffSessionGate(user, now = new Date()) {
  if (!isStoreStaffUser(user)) {
    return { punchRequired: false, sessionBlocked: false, mustCheckOut: false, shift: null };
  }

  const shift = await db.StoreStaffShift.findOne({ where: { userId: user.userId } });
  if (!shift) {
    return { punchRequired: false, sessionBlocked: false, mustCheckOut: false, shift: null };
  }

  const inShiftWindow = isWithinShiftWindow(now, shift.timezone, shift.startTime, shift.endTime);
  const offShiftApproval = inShiftWindow ? null : await findActiveOffShiftApproval(user.userId, now);
  const allowed = inShiftWindow || Boolean(offShiftApproval);
  const openRow = await db.StoreStaffAttendance.findOne({
    where: { userId: user.userId, checkOutAt: null },
    order: [['checkInAt', 'DESC']]
  });

  return {
    punchRequired: true,
    shift,
    inShiftWindow,
    isOffShift: !inShiftWindow && Boolean(offShiftApproval),
    sessionBlocked: !allowed,
    mustCheckOut: !allowed && Boolean(openRow),
    openSession: openRow
  };
}

module.exports = {
  isStoreStaffUser,
  findActiveOffShiftApproval,
  findPendingOffShiftRequest,
  assertStoreStaffLoginAllowed,
  getStoreStaffSessionGate
};
