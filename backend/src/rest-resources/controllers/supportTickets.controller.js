'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isAdminPanelRole } = require('../../constants/roles');
const { uploadImageBuffer, detectImageContentType } = require('../../utils/s3Upload');
const { logger } = require('../../libs/logger');
const {
  createTicket,
  listTicketsForUser,
  getTicketForUser,
  addMessageAsUser
} = require('../../services/supportTickets/supportTickets.service');

function getUserId(req) {
  return req.user?.userId;
}

function assertPlayer(req, res) {
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 'Unauthorized.', 401);
    return null;
  }
  if (isAdminPanelRole(req.user?.role)) {
    sendError(res, 'Only players can use support tickets here.', 403);
    return null;
  }
  return userId;
}

function respondError(res, err, fallback) {
  const status = err?.statusCode || 500;
  if (status >= 500) {
    logger.error({ err }, fallback);
    return sendError(res, fallback, status);
  }
  return sendError(res, err?.message || fallback, status);
}

async function create(req, res) {
  try {
    const userId = assertPlayer(req, res);
    if (!userId) return;
    const result = await createTicket(userId, req.user?.storeCode, req.body || {});
    return sendSuccess(res, result, 201);
  } catch (err) {
    return respondError(res, err, 'Failed to create ticket.');
  }
}

async function list(req, res) {
  try {
    const userId = assertPlayer(req, res);
    if (!userId) return;
    const result = await listTicketsForUser(userId, req.query || {});
    return sendSuccess(res, result);
  } catch (err) {
    return respondError(res, err, 'Failed to list tickets.');
  }
}

async function getOne(req, res) {
  try {
    const userId = assertPlayer(req, res);
    if (!userId) return;
    const result = await getTicketForUser(userId, parseInt(req.params.id, 10));
    return sendSuccess(res, result);
  } catch (err) {
    return respondError(res, err, 'Failed to load ticket.');
  }
}

async function reply(req, res) {
  try {
    const userId = assertPlayer(req, res);
    if (!userId) return;
    const result = await addMessageAsUser(userId, parseInt(req.params.id, 10), req.body || {});
    return sendSuccess(res, result, 201);
  } catch (err) {
    return respondError(res, err, 'Failed to send message.');
  }
}

async function upload(req, res) {
  try {
    const userId = assertPlayer(req, res);
    if (!userId) return;
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
  create,
  list,
  getOne,
  reply,
  upload
};
