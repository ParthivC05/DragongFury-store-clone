'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const staffShiftsService = require('../../services/staffAttendance/staffShifts.service');

function requireShiftManage(req) {
  if (isMasterAdmin(req.role)) {
    if (!canAdmin(req, ADMIN_FEATURE_KEYS.STAFF_ATTENDANCE) && !canAdmin(req, ADMIN_FEATURE_KEYS.ADMIN_STAFF_MANAGE)) {
      const err = new Error('You do not have access to manage staff shifts.');
      err.statusCode = 403;
      throw err;
    }
    return;
  }
  if (req.role !== ROLES.STORE_ADMIN || !req.storeCode) {
    const err = new Error('Only store administrators can allocate staff shifts.');
    err.statusCode = 403;
    throw err;
  }
  if (!can(req, STORE_FEATURE_KEYS.STORE_STAFF_MANAGE)) {
    const err = new Error('You do not have access to manage store staff shifts.');
    err.statusCode = 403;
    throw err;
  }
}

function resolveStoreScope(req, { required = true } = {}) {
  if (isMasterAdmin(req.role)) {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const distributorCode = src.distributorCode != null ? String(src.distributorCode).trim() : '';
    const storeCode = src.storeCode != null ? String(src.storeCode).trim() : '';
    if (required && (!distributorCode || !storeCode)) {
      const err = new Error('distributorCode and storeCode are required.');
      err.statusCode = 400;
      throw err;
    }
    return { distributorCode: distributorCode || null, storeCode: storeCode || null };
  }
  return { distributorCode: req.distributorCode, storeCode: req.storeCode };
}

function handleError(res, err, fallback) {
  return sendError(res, err.message || fallback, err.statusCode || 500, err.code || null, err.data ? { data: err.data } : null);
}

/** GET /staff-shifts/timezones — IANA timezones with UTC offset labels. */
async function listTimezones(req, res) {
  try {
    requireShiftManage(req);
    const data = await staffShiftsService.listTimezones();
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to load timezones');
  }
}

/** GET /staff-shifts — shifts for one store. */
async function list(req, res) {
  try {
    requireShiftManage(req);
    const scope = resolveStoreScope(req);
    const data = await staffShiftsService.listShiftsForStore(scope);
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to list staff shifts');
  }
}

/** GET /staff-shifts/:userId */
async function get(req, res) {
  try {
    requireShiftManage(req);
    const scope = resolveStoreScope(req, { required: !isMasterAdmin(req.role) });
    const data = await staffShiftsService.getShiftForUser(Number(req.params.userId), scope);
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to load staff shift');
  }
}

/** PUT /staff-shifts/:userId — allocate or update timezone + shift hours. */
async function upsert(req, res) {
  try {
    requireShiftManage(req);
    const scope = resolveStoreScope(req, { required: !isMasterAdmin(req.role) });
    const body = req.body || {};
    const data = await staffShiftsService.upsertShift({
      userId: Number(req.params.userId),
      timezone: body.timezone,
      startTime: body.startTime,
      endTime: body.endTime,
      actorUserId: req.user?.userId,
      storeScope: scope
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to save staff shift');
  }
}

/** DELETE /staff-shifts/:userId — remove shift so staff can log in at any time again. */
async function remove(req, res) {
  try {
    requireShiftManage(req);
    const scope = resolveStoreScope(req, { required: !isMasterAdmin(req.role) });
    const data = await staffShiftsService.removeShift({
      userId: Number(req.params.userId),
      storeScope: scope
    });
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, err, 'Failed to remove staff shift');
  }
}

module.exports = { listTimezones, list, get, upsert, remove };
