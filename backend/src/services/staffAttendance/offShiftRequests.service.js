'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const {
  OFF_SHIFT_STATUS,
  DEFAULT_OFF_SHIFT_VALID_HOURS,
  MIN_OFF_SHIFT_VALID_HOURS,
  MAX_OFF_SHIFT_VALID_HOURS
} = require('../../constants/staffAttendance');
const { isStoreStaffUser } = require('./assertStaffLoginAllowed.service');
const {
  httpError,
  staffDisplayName,
  serializeShift,
  isWithinShiftWindow
} = require('./shiftWindow.helpers');

const STAFF_ATTRS = ['userId', 'email', 'username', 'firstName', 'lastName', 'storeCode', 'distributorCode'];

function clampValidHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_OFF_SHIFT_VALID_HOURS;
  return Math.min(MAX_OFF_SHIFT_VALID_HOURS, Math.max(MIN_OFF_SHIFT_VALID_HOURS, Math.round(n)));
}

function serializeRequest(row, { now = new Date(), shift = null } = {}) {
  const json = row.toJSON ? row.toJSON() : row;
  const staff = json.StaffUser || null;
  const reviewer = json.ReviewedByUser || null;
  return {
    id: json.id,
    userId: json.userId,
    distributorCode: json.distributorCode,
    storeCode: json.storeCode,
    reason: json.reason || '',
    status: json.status,
    validUntil: json.validUntil || null,
    reviewedAt: json.reviewedAt || null,
    createdAt: json.created_at || json.createdAt || null,
    staff: staff
      ? {
          userId: staff.userId,
          email: staff.email,
          username: staff.username,
          firstName: staff.firstName,
          lastName: staff.lastName,
          displayName: staffDisplayName(staff)
        }
      : null,
    reviewedBy: reviewer
      ? {
          userId: reviewer.userId,
          email: reviewer.email,
          displayName: staffDisplayName(reviewer)
        }
      : null,
    shift: shift ? serializeShift(shift, { now }) : null
  };
}

async function createOffShiftLoginRequest({ reason, resolveUser }) {
  const user = await resolveUser();
  if (!isStoreStaffUser(user)) {
    throw httpError('Off-shift login requests are only for store staff.', 403);
  }

  const shift = await db.StoreStaffShift.findOne({ where: { userId: user.userId } });
  if (!shift) {
    throw httpError('No shift is allocated for this account, so you can sign in normally.', 400);
  }

  const now = new Date();
  if (isWithinShiftWindow(now, shift.timezone, shift.startTime, shift.endTime)) {
    throw httpError('You are currently inside your shift. Please sign in normally.', 400);
  }

  const active = await db.StoreStaffOffShiftRequest.findOne({
    where: {
      userId: user.userId,
      status: OFF_SHIFT_STATUS.APPROVED,
      validUntil: { [db.Sequelize.Op.gt]: now }
    }
  });
  if (active) {
    throw httpError('Off-shift login is already approved. Please sign in now.', 400);
  }

  const pending = await db.StoreStaffOffShiftRequest.findOne({
    where: { userId: user.userId, status: OFF_SHIFT_STATUS.PENDING }
  });
  if (pending) {
    return {
      request: serializeRequest(pending, { now, shift }),
      message: 'You already have a pending off-shift request. Super admin or technical staff will review it.'
    };
  }

  const note = reason != null ? String(reason).trim().slice(0, 1000) : '';
  const row = await db.StoreStaffOffShiftRequest.create({
    userId: user.userId,
    distributorCode: user.distributorCode,
    storeCode: user.storeCode,
    reason: note || null,
    status: OFF_SHIFT_STATUS.PENDING
  });

  return {
    request: serializeRequest(row, { now, shift }),
    message: 'Off-shift login request sent. You can sign in after super admin or technical staff approves it.'
  };
}

async function listOffShiftRequests({ status, storeCode, userId }) {
  const where = {};
  if (status && Object.values(OFF_SHIFT_STATUS).includes(status)) where.status = status;
  if (storeCode) where.storeCode = String(storeCode).trim();
  if (userId) where.userId = Number(userId);

  const rows = await db.StoreStaffOffShiftRequest.findAll({
    where,
    include: [
      { model: db.User, as: 'StaffUser', attributes: STAFF_ATTRS, required: false },
      { model: db.User, as: 'ReviewedByUser', attributes: STAFF_ATTRS, required: false }
    ],
    order: [['created_at', 'DESC']],
    limit: 200
  });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const shifts = userIds.length
    ? await db.StoreStaffShift.findAll({ where: { userId: { [db.Sequelize.Op.in]: userIds } } })
    : [];
  const shiftByUser = new Map(shifts.map((s) => [s.userId, s]));
  const now = new Date();

  return {
    list: rows.map((row) => serializeRequest(row, { now, shift: shiftByUser.get(row.userId) || null }))
  };
}

async function approveOffShiftRequest({ requestId, actorUserId, validHours }) {
  const row = await db.StoreStaffOffShiftRequest.findByPk(requestId, {
    include: [{ model: db.User, as: 'StaffUser', attributes: STAFF_ATTRS }]
  });
  if (!row) throw httpError('Off-shift request not found.', 404);
  if (row.status !== OFF_SHIFT_STATUS.PENDING) {
    throw httpError('This request has already been reviewed.', 400);
  }

  const hours = clampValidHours(validHours);
  const now = new Date();
  const validUntil = new Date(now.getTime() + hours * 60 * 60 * 1000);
  await row.update({
    status: OFF_SHIFT_STATUS.APPROVED,
    validUntil,
    reviewedByUserId: actorUserId,
    reviewedAt: now
  });

  return {
    request: serializeRequest(row, { now }),
    message: `Off-shift login approved until ${validUntil.toISOString()}.`
  };
}

async function rejectOffShiftRequest({ requestId, actorUserId }) {
  const row = await db.StoreStaffOffShiftRequest.findByPk(requestId, {
    include: [{ model: db.User, as: 'StaffUser', attributes: STAFF_ATTRS }]
  });
  if (!row) throw httpError('Off-shift request not found.', 404);
  if (row.status !== OFF_SHIFT_STATUS.PENDING) {
    throw httpError('This request has already been reviewed.', 400);
  }

  const now = new Date();
  await row.update({
    status: OFF_SHIFT_STATUS.REJECTED,
    reviewedByUserId: actorUserId,
    reviewedAt: now
  });

  return {
    request: serializeRequest(row, { now }),
    message: 'Off-shift login request rejected.'
  };
}

/**
 * Super admin / technical staff can allow a staff member to log in outside shift
 * without waiting for a staff-submitted request.
 */
async function grantOffShiftAccess({ userId, actorUserId, validHours, reason }) {
  const staff = await db.User.findOne({ where: { userId, role: ROLES.STORE_ADMIN } });
  if (!staff || !isStoreStaffUser(staff)) {
    throw httpError('Store staff member not found.', 404);
  }

  const hours = clampValidHours(validHours);
  const now = new Date();
  const validUntil = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const note = reason != null ? String(reason).trim().slice(0, 1000) : 'Granted by super admin / technical staff.';

  const pending = await db.StoreStaffOffShiftRequest.findOne({
    where: { userId: staff.userId, status: OFF_SHIFT_STATUS.PENDING }
  });

  let row;
  if (pending) {
    await pending.update({
      status: OFF_SHIFT_STATUS.APPROVED,
      reason: pending.reason || note,
      validUntil,
      reviewedByUserId: actorUserId,
      reviewedAt: now
    });
    row = pending;
  } else {
    row = await db.StoreStaffOffShiftRequest.create({
      userId: staff.userId,
      distributorCode: staff.distributorCode,
      storeCode: staff.storeCode,
      reason: note,
      status: OFF_SHIFT_STATUS.APPROVED,
      validUntil,
      reviewedByUserId: actorUserId,
      reviewedAt: now
    });
  }

  return {
    request: serializeRequest(row, { now }),
    message: `Off-shift login granted until ${validUntil.toISOString()}.`
  };
}

module.exports = {
  createOffShiftLoginRequest,
  listOffShiftRequests,
  approveOffShiftRequest,
  rejectOffShiftRequest,
  grantOffShiftAccess
};
