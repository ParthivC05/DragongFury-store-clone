'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const link2playGames = require('../../services/link2play/link2playGames.service');
const { uploadImageBuffer } = require('../../utils/s3Upload');

function hasLink2PlayAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.MASTER_ADMIN) return canAdmin(req, ADMIN_FEATURE_KEYS.LINK2PLAY);
  if (req.role === ROLES.STORE_ADMIN) {
    if (!link2playGames.isLink2PlayStoreAllowed(req.storeCode)) return false;
    return can(req, STORE_FEATURE_KEYS.LINK2PLAY);
  }
  return false;
}

async function list(req, res) {
  try {
    if (!hasLink2PlayAccess(req)) {
      return sendError(res, 'You don\'t have access to Link2Play. Please contact your administrator if you need access.', 403);
    }
    const data = await link2playGames.listAdmin(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to list Link2Play games.', err.statusCode || 500);
  }
}

async function getOne(req, res) {
  try {
    if (!hasLink2PlayAccess(req)) {
      return sendError(res, 'You don\'t have access to Link2Play. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const link2play_game = await link2playGames.getAdminById(req, id);
    return sendSuccess(res, { link2play_game });
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function create(req, res) {
  try {
    if (!hasLink2PlayAccess(req)) {
      return sendError(res, 'You don\'t have access to Link2Play. Please contact your administrator if you need access.', 403);
    }
    const link2play_game = await link2playGames.createAdmin(req, req.body || {});
    return sendSuccess(res, { link2play_game }, 201);
  } catch (err) {
    return sendError(res, err.message || 'Create failed.', err.statusCode || 500);
  }
}

async function update(req, res) {
  try {
    if (!hasLink2PlayAccess(req)) {
      return sendError(res, 'You don\'t have access to Link2Play. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const link2play_game = await link2playGames.updateAdmin(req, id, req.body || {});
    return sendSuccess(res, { link2play_game });
  } catch (err) {
    return sendError(res, err.message || 'Update failed.', err.statusCode || 500);
  }
}

async function toggle(req, res) {
  try {
    if (!hasLink2PlayAccess(req)) {
      return sendError(res, 'You don\'t have access to Link2Play. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const status = req.body?.status ?? req.body?.isActive;
    const link2play_game = await link2playGames.toggleAdmin(req, id, status);
    return sendSuccess(res, { link2play_game });
  } catch (err) {
    return sendError(res, err.message || 'Toggle failed.', err.statusCode || 500);
  }
}

async function remove(req, res) {
  try {
    if (!hasLink2PlayAccess(req)) {
      return sendError(res, 'You don\'t have access to Link2Play. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await link2playGames.deleteAdmin(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Delete failed.', err.statusCode || 500);
  }
}

/** POST /admin/link2play/upload-image — upload Link2Play game image to S3 */
async function uploadImage(req, res) {
  try {
    if (!hasLink2PlayAccess(req)) {
      return sendError(res, 'You don\'t have access to Link2Play. Please contact your administrator if you need access.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    const url = await uploadImageBuffer(file.buffer, {
      contentType: file.mimetype,
      keyPrefix: 'link2play'
    });
    return sendSuccess(res, { url });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  toggle,
  remove,
  uploadImage
};
