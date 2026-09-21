'use strict';

const db = require('../../db/models');
const { STAFF_SHIFT_ENDED_CODE } = require('../../constants/staffAttendance');
const { isStoreStaffUser, findActiveOffShiftApproval } = require('./assertStaffLoginAllowed.service');
const {
  httpError,
  parseBalance,
  serializeShift,
  serializeAttendance,
  isWithinShiftWindow
} = require('./shiftWindow.helpers');

async function getMyAttendanceStatus(user) {
  if (!isStoreStaffUser(user)) {
    return {
      punchRequired: false,
      shift: null,
      inShiftWindow: false,
      isOffShift: false,
      sessionBlocked: false,
      mustCheckOut: false,
      openSession: null
    };
  }

  const now = new Date();
  const shift = await db.StoreStaffShift.findOne({ where: { userId: user.userId } });
  const openRow = await db.StoreStaffAttendance.findOne({
    where: { userId: user.userId, checkOutAt: null },
    order: [['checkInAt', 'DESC']]
  });

  if (!shift) {
    return {
      punchRequired: false,
      shift: null,
      inShiftWindow: false,
      isOffShift: false,
      sessionBlocked: false,
      mustCheckOut: false,
      openSession: serializeAttendance(openRow, { now })
    };
  }

  const inShiftWindow = isWithinShiftWindow(now, shift.timezone, shift.startTime, shift.endTime);
  const offShiftApproval = inShiftWindow ? null : await findActiveOffShiftApproval(user.userId, now);

  return {
    punchRequired: true,
    shift: serializeShift(shift, { now }),
    inShiftWindow,
    isOffShift: !inShiftWindow && Boolean(offShiftApproval),
    sessionBlocked: !inShiftWindow && !offShiftApproval,
    mustCheckOut: !inShiftWindow && !offShiftApproval && Boolean(openRow),
    openSession: serializeAttendance(openRow, { now })
  };
}

async function checkIn({ user, openingBalance }) {
  if (!isStoreStaffUser(user)) {
    throw httpError('Check-in is only for store staff.', 403);
  }

  const shift = await db.StoreStaffShift.findOne({ where: { userId: user.userId } });
  if (!shift) {
    throw httpError('Check-in is not required until a shift is allocated for you.', 400);
  }

  const existing = await db.StoreStaffAttendance.findOne({
    where: { userId: user.userId, checkOutAt: null }
  });
  if (existing) {
    throw httpError('You already have an open check-in. Check out before starting a new session.', 400);
  }

  const now = new Date();
  const inShiftWindow = isWithinShiftWindow(now, shift.timezone, shift.startTime, shift.endTime);
  if (!inShiftWindow) {
    const offShiftApproval = await findActiveOffShiftApproval(user.userId, now);
    if (!offShiftApproval) {
      throw httpError(
        'Your shift has ended. You cannot check in until your next shift.',
        403,
        STAFF_SHIFT_ENDED_CODE
      );
    }
  }

  const row = await db.StoreStaffAttendance.create({
    userId: user.userId,
    distributorCode: user.distributorCode,
    storeCode: user.storeCode,
    shiftId: shift.id,
    checkInAt: now,
    openingBalance: parseBalance(openingBalance, 'Opening balance'),
    isOffShift: !inShiftWindow
  });

  return {
    session: serializeAttendance(row, { now }),
    shift: serializeShift(shift, { now }),
    message: 'Checked in. Your working time is now running.'
  };
}

async function checkOut({ user, closingBalance }) {
  if (!isStoreStaffUser(user)) {
    throw httpError('Check-out is only for store staff.', 403);
  }

  const openRow = await db.StoreStaffAttendance.findOne({
    where: { userId: user.userId, checkOutAt: null },
    order: [['checkInAt', 'DESC']]
  });
  if (!openRow) {
    throw httpError('You are not checked in.', 400);
  }

  const now = new Date();
  await openRow.update({
    checkOutAt: now,
    closingBalance: parseBalance(closingBalance, 'Closing balance')
  });

  return {
    session: serializeAttendance(openRow, { now }),
    message: 'Checked out. Working hours have been saved.'
  };
}

module.exports = {
  getMyAttendanceStatus,
  checkIn,
  checkOut
};
