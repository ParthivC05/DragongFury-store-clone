'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { HH_MM_PATTERN } = require('../../constants/staffAttendance');
const { isStoreStaffUser } = require('./assertStaffLoginAllowed.service');
const {
  httpError,
  isValidIanaTimeZone,
  listTimeZonesWithLabels,
  serializeShift,
  staffDisplayName
} = require('./shiftWindow.helpers');

const STAFF_ATTRS = ['userId', 'email', 'username', 'firstName', 'lastName', 'storeRoleId', 'isActive'];

function normalizeHhMm(value, fieldLabel) {
  const raw = value != null ? String(value).trim() : '';
  if (!HH_MM_PATTERN.test(raw)) {
    throw httpError(`${fieldLabel} must be in HH:mm format (24-hour).`, 400);
  }
  return raw;
}

async function requireStoreStaffInScope(userId, storeScope) {
  const user = await db.User.findOne({
    where: { userId, role: ROLES.STORE_ADMIN }
  });
  if (!user) throw httpError('Staff member not found.', 404);
  if (!isStoreStaffUser(user)) {
    throw httpError('Shift times can only be set for store staff, not the main store admin.', 400);
  }
  if (storeScope?.storeCode && user.storeCode !== storeScope.storeCode) {
    throw httpError('This staff member does not belong to the selected store.', 403);
  }
  if (storeScope?.distributorCode && user.distributorCode !== storeScope.distributorCode) {
    throw httpError('This staff member does not belong to the selected store.', 403);
  }
  return user;
}

async function listTimezones() {
  return { list: listTimeZonesWithLabels() };
}

async function listShiftsForStore(storeScope) {
  const rows = await db.StoreStaffShift.findAll({
    where: {
      distributorCode: storeScope.distributorCode,
      storeCode: storeScope.storeCode
    },
    include: [{
      model: db.User,
      as: 'StaffUser',
      attributes: STAFF_ATTRS,
      required: false
    }],
    order: [['userId', 'ASC']]
  });
  const now = new Date();
  return {
    list: rows.map((row) => {
      const shift = serializeShift(row, { now });
      const staff = row.StaffUser ? row.StaffUser.toJSON() : null;
      return {
        ...shift,
        staff: staff
          ? {
              userId: staff.userId,
              email: staff.email,
              username: staff.username,
              firstName: staff.firstName,
              lastName: staff.lastName,
              displayName: staffDisplayName(staff),
              isActive: staff.isActive
            }
          : null
      };
    })
  };
}

async function getShiftForUser(userId, storeScope) {
  await requireStoreStaffInScope(userId, storeScope);
  const shift = await db.StoreStaffShift.findOne({ where: { userId } });
  return { shift: serializeShift(shift) };
}

async function upsertShift({ userId, timezone, startTime, endTime, actorUserId, storeScope }) {
  const staff = await requireStoreStaffInScope(userId, storeScope);
  const tz = timezone != null ? String(timezone).trim() : '';
  if (!isValidIanaTimeZone(tz)) {
    throw httpError('Please choose a valid timezone.', 400);
  }
  const start = normalizeHhMm(startTime, 'Shift start time');
  const end = normalizeHhMm(endTime, 'Shift end time');
  if (start === end) {
    throw httpError('Shift start and end times cannot be the same.', 400);
  }

  const payload = {
    userId: staff.userId,
    distributorCode: staff.distributorCode,
    storeCode: staff.storeCode,
    timezone: tz,
    startTime: start,
    endTime: end,
    updatedByUserId: actorUserId || null
  };

  const existing = await db.StoreStaffShift.findOne({ where: { userId: staff.userId } });
  let row;
  if (existing) {
    await existing.update(payload);
    row = existing;
  } else {
    row = await db.StoreStaffShift.create({
      ...payload,
      createdByUserId: actorUserId || null
    });
  }
  return {
    shift: serializeShift(row),
    message: existing ? 'Shift updated.' : 'Shift allocated. This staff member can now log in only during their shift.'
  };
}

async function removeShift({ userId, storeScope }) {
  await requireStoreStaffInScope(userId, storeScope);
  const existing = await db.StoreStaffShift.findOne({ where: { userId } });
  if (!existing) throw httpError('No shift is allocated for this staff member.', 404);
  await existing.destroy();
  return { message: 'Shift removed. This staff member can log in at any time until a new shift is set.' };
}

module.exports = {
  listTimezones,
  listShiftsForStore,
  getShiftForUser,
  upsertShift,
  removeShift
};
