'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { uploadImageBuffer, detectImageContentType } = require('../../utils/s3Upload');
const { logger } = require('../../libs/logger');
const {
  listTicketsAdmin,
  getTicketAdmin,
  addMessageAsAdmin,
  updateTicketStatusAdmin
} = require('../../services/supportTickets/supportTickets.service');

function hasAccess(req) {
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.SUPPORT_TICKETS);
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.SUPPORT_TICKETS);
  }
  return false;
}

function respondError(res, err, fallback) {
  const status = err?.statusCode || 500;
  if (status >= 500) {
    logger.error({ err }, fallback);
    return sendError(res, fallback, status);
  }
  return sendError(res, err?.message || fallback, status);
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have permission to view support tickets.', 403);
    }
    const result = await listTicketsAdmin(req, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    return respondError(res, err, 'Failed to list tickets.');
  }
}

async function getOne(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have permission to view support tickets.', 403);
    }
    const result = await getTicketAdmin(req, parseInt(req.params.id, 10));
    return sendSuccess(res, result);
  } catch (err) {
    return respondError(res, err, 'Failed to load ticket.');
  }
}

async function reply(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have permission to reply to support tickets.', 403);
    }
    const result = await addMessageAsAdmin(req, parseInt(req.params.id, 10), req.body || {});
    return sendSuccess(res, result, 201);
  } catch (err) {
    return respondError(res, err, 'Failed to send message.');
  }
}

async function updateStatus(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have permission to update support tickets.', 403);
    }
    const status = req.body?.status;
    const result = await updateTicketStatusAdmin(req, parseInt(req.params.id, 10), status);
    return sendSuccess(res, result);
  } catch (err) {
    return respondError(res, err, 'Failed to update ticket.');
  }
}

async function upload(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have permission to upload ticket attachments.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    const detected = detectImageContentType(file.buffer);
    const url = await uploadImageBuffer(file.buffer, {
      contentType: file.mimetype,
      keyPrefix: 'support-tickets'
    });
    return sendSuccess(res, {
      data: {
        url,
        contentType: detected || file.mimetype,
        fileName: file.originalname ? String(file.originalname).slice(0, 255) : null
      }
    });
  } catch (err) {
    return respondError(res, err, 'Upload failed.');
  }
}

module.exports = {
  list,
  getOne,
  reply,
  updateStatus,
  upload
};
