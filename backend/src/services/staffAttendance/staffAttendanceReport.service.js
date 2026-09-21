'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const {
  serializeAttendance,
  formatDurationMinutes,
  toNumber,
  staffDisplayName
} = require('./shiftWindow.helpers');

const STAFF_ATTRS = ['userId', 'email', 'username', 'firstName', 'lastName', 'storeCode', 'distributorCode'];
const COMPLETED_STATUSES = ['completed', 'approved'];

function parseDateBoundary(value, endOfDay) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function sumAmount(model, where) {
  if (!model) return 0;
  const result = await model.findOne({
    attributes: [[db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'total']],
    where,
    raw: true
  });
  return toNumber(result?.total);
}

async function approvedAmountsForStaff({ userId, storeCode, from, to }) {
  const timeWhere = { [Op.gte]: from, [Op.lte]: to };
  const storeWhere = storeCode ? { storeCode } : {};

  const [chimeDeposits, gameDeposits, chimeWithdrawals, cardWithdrawals, gameRedeems] = await Promise.all([
    sumAmount(db.ChimeDepositRequest, {
      approvedByUserId: userId,
      status: { [Op.in]: COMPLETED_STATUSES },
      approvedAt: timeWhere,
      ...storeWhere
    }),
    db.GameManualRequest
      ? sumAmount(db.GameManualRequest, {
          resolvedByUserId: userId,
          requestType: 'deposit',
          status: 'approved',
          resolvedAt: timeWhere,
          ...storeWhere
        })
      : 0,
    sumAmount(db.ChimeCashappWithdrawalRequest, {
      approvedByUserId: userId,
      status: { [Op.in]: COMPLETED_STATUSES },
      approvedAt: timeWhere,
      ...storeWhere
    }),
    db.WithdrawalRequest
      ? sumAmount(db.WithdrawalRequest, {
          approvedByUserId: userId,
          status: { [Op.in]: COMPLETED_STATUSES },
          updated_at: timeWhere
        })
      : 0,
    db.GameManualRequest
      ? sumAmount(db.GameManualRequest, {
          resolvedByUserId: userId,
          requestType: 'redeem',
          status: 'approved',
          resolvedAt: timeWhere,
          ...storeWhere
        })
      : 0
  ]);

  return {
    approvedDepositsAmount: toNumber(chimeDeposits) + toNumber(gameDeposits),
    approvedWithdrawalsAmount: toNumber(chimeWithdrawals) + toNumber(cardWithdrawals) + toNumber(gameRedeems)
  };
}

async function getStaffAttendanceReport({ storeCode, userId, dateFrom, dateTo }) {
  const from = parseDateBoundary(dateFrom, false) || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = parseDateBoundary(dateTo, true) || new Date();
  const where = {
    checkInAt: { [Op.between]: [from, to] }
  };
  if (storeCode) where.storeCode = String(storeCode).trim();
  if (userId) where.userId = Number(userId);

  const rows = await db.StoreStaffAttendance.findAll({
    where,
    include: [
      { model: db.User, as: 'StaffUser', attributes: STAFF_ATTRS, required: false },
      { model: db.StoreStaffShift, as: 'Shift', required: false }
    ],
    order: [['checkInAt', 'DESC']],
    limit: 500
  });

  const now = new Date();
  const list = [];
  for (const row of rows) {
    const session = serializeAttendance(row, { now });
    const sessionEnd = row.checkOutAt ? new Date(row.checkOutAt) : now;
    const amounts = await approvedAmountsForStaff({
      userId: row.userId,
      storeCode: row.storeCode,
      from: new Date(row.checkInAt),
      to: sessionEnd
    });
    const staff = row.StaffUser ? row.StaffUser.toJSON() : null;
    const shift = row.Shift ? row.Shift.toJSON() : null;
    list.push({
      ...session,
      staff: staff
        ? {
            userId: staff.userId,
            email: staff.email,
            username: staff.username,
            firstName: staff.firstName,
            lastName: staff.lastName,
            displayName: staffDisplayName(staff)
          }
        : { userId: row.userId, displayName: `User ${row.userId}` },
      timezone: shift?.timezone || null,
      shiftStartTime: shift?.startTime || null,
      shiftEndTime: shift?.endTime || null,
      ...amounts
    });
  }

  const totalWorkingHoursMinutes = list.reduce((sum, row) => sum + toNumber(row.workingHoursMinutes), 0);
  const totalApprovedDeposits = list.reduce((sum, row) => sum + toNumber(row.approvedDepositsAmount), 0);
  const totalApprovedWithdrawals = list.reduce((sum, row) => sum + toNumber(row.approvedWithdrawalsAmount), 0);

  return {
    list,
    summary: {
      sessions: list.length,
      totalWorkingHoursMinutes,
      totalWorkingHoursLabel: formatDurationMinutes(totalWorkingHoursMinutes),
      totalApprovedDeposits,
      totalApprovedWithdrawals
    }
  };
}

module.exports = {
  getStaffAttendanceReport
};
