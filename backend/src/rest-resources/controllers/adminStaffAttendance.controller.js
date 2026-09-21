'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const staffAttendanceService = require('../../services/staffAttendance/staffAttendance.service');
const offShiftRequestsService = require('../../services/staffAttendance/offShiftRequests.service');
const staffAttendanceReportService = require('../../services/staffAttendance/staffAttendanceReport.service');
const db = require('../../db/models');
const { Op } = require('sequelize');
const adminAuthService = require('../../services/adminAuth.service');
const { resolveAdminLoginScope } = require('../../services/auth/adminHostBinding.helpers');
const { decodePasswordBody } = require('../../utils/passwordEncryption');

function staffActorFromReq(req) {
  return {
    userId: req.user?.userId,
    role: req.role,
    storeRoleId: req.storeRoleId,
    distributorCode: req.distributorCode,
    storeCode: req.storeCode
  };
}

function handleError(res, err, fallback) {
  return sendError(
    res,
    err.message || fallback,
    err.statusCode || 500,
    err.code || null,
    err.data ? { data: err.data } : null
  );
}

function requireStaffAttendanceAccess(req) {
  if (!isMasterAdmin(req.role)) {
    const err = new Error('Staff attendance is only available to super admin and technical staff.');
    err.statusCode = 403;
    throw err;
  }
  if (!canAdmin(req, ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE) && !canAdmin(req, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)) {
    const err = new Error('You do not have access to staff attendance.');
    err.statusCode = 403;
    throw err;
  }
}

/** GET /me/attendance — current staff shift + open check-in. */
async function getMine(req, res) {
  try {
    const data = await staffAttendanceService.getMyAttendanceStatus(staffActorFromReq(req));
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to load attendance status');
  }
}

/** POST /me/attendance/check-in  body: { openingBalance } */
async function checkIn(req, res) {
  try {
    const data = await staffAttendanceService.checkIn({
      user: staffActorFromReq(req),
      openingBalance: req.body?.openingBalance
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Check-in failed');
  }
}

/** POST /me/attendance/check-out  body: { closingBalance } */
async function checkOut(req, res) {
  try {
    const data = await staffAttendanceService.checkOut({
      user: staffActorFromReq(req),
      closingBalance: req.body?.closingBalance
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Check-out failed');
  }
}

/**
 * POST /auth/off-shift-login-request
 * Public: staff sends email + password + reason when blocked outside shift.
 */
async function requestOffShiftLogin(req, res) {
  try {
    const body = decodePasswordBody(req.body || {});
    const email = body.email;
    const password = body.password;
    const fromBody = body.storeCode != null ? String(body.storeCode).trim() : '';
    const scope = resolveAdminLoginScope(req, fromBody || undefined, body);
    const data = await offShiftRequestsService.createOffShiftLoginRequest({
      email,
      password,
      reason: body.reason,
      resolveUser: () => adminAuthService.resolveAdminUserForPassword(
        String(email || '').trim().toLowerCase(),
        password,
        scope?.storeCode || fromBody || undefined,
        scope
      )
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to send off-shift request');
  }
}

/** GET /staff-attendance/off-shift-requests */
async function listOffShiftRequests(req, res) {
  try {
    requireStaffAttendanceAccess(req);
    const data = await offShiftRequestsService.listOffShiftRequests({
      status: req.query?.status,
      storeCode: req.query?.storeCode,
      userId: req.query?.userId
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to list off-shift requests');
  }
}

/** POST /staff-attendance/off-shift-requests/:id/approve */
async function approveOffShiftRequest(req, res) {
  try {
    requireStaffAttendanceAccess(req);
    const data = await offShiftRequestsService.approveOffShiftRequest({
      requestId: Number(req.params.id),
      actorUserId: req.user?.userId,
      validHours: req.body?.validHours
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to approve off-shift request');
  }
}

/** POST /staff-attendance/off-shift-requests/:id/reject */
async function rejectOffShiftRequest(req, res) {
  try {
    requireStaffAttendanceAccess(req);
    const data = await offShiftRequestsService.rejectOffShiftRequest({
      requestId: Number(req.params.id),
      actorUserId: req.user?.userId
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to reject off-shift request');
  }
}

/** POST /staff-attendance/grant-off-shift  body: { userId, validHours?, reason? } */
async function grantOffShift(req, res) {
  try {
    requireStaffAttendanceAccess(req);
    const data = await offShiftRequestsService.grantOffShiftAccess({
      userId: Number(req.body?.userId),
      actorUserId: req.user?.userId,
      validHours: req.body?.validHours,
      reason: req.body?.reason
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to grant off-shift login');
  }
}

/** GET /staff-attendance/staff-options — store staff for off-shift grant picker. */
async function listStaffOptions(req, res) {
  try {
    requireStaffAttendanceAccess(req);
    const rows = await db.User.findAll({
      where: {
        role: ROLES.STORE_ADMIN,
        storeRoleId: { [Op.ne]: null }
      },
      attributes: ['userId', 'email', 'username', 'firstName', 'lastName', 'storeCode', 'distributorCode', 'isActive'],
      order: [['storeCode', 'ASC'], ['email', 'ASC']],
      limit: 500
    });
    sendSuccess(res, {
      list: rows.map((r) => {
        const j = r.toJSON();
        return {
          userId: j.userId,
          email: j.email,
          username: j.username,
          firstName: j.firstName,
          lastName: j.lastName,
          storeCode: j.storeCode,
          distributorCode: j.distributorCode,
          isActive: j.isActive
        };
      })
    });
  } catch (err) {
    handleError(res, err, 'Failed to list store staff');
  }
}

/** GET /staff-attendance/report */
async function report(req, res) {
  try {
    requireStaffAttendanceAccess(req);
    const data = await staffAttendanceReportService.getStaffAttendanceReport({
      storeCode: req.query?.storeCode,
      userId: req.query?.userId,
      dateFrom: req.query?.dateFrom,
      dateTo: req.query?.dateTo
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to load staff attendance report');
  }
}

module.exports = {
  getMine,
  checkIn,
  checkOut,
  requestOffShiftLogin,
  listOffShiftRequests,
  approveOffShiftRequest,
  rejectOffShiftRequest,
  grantOffShift,
  listStaffOptions,
  report
};
