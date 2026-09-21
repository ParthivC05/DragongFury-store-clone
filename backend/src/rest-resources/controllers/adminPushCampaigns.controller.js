'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const adminPushCampaigns = require('../../services/pushCampaigns/adminPushCampaigns.service');
const { uploadImageBuffer, isS3Configured } = require('../../utils/s3Upload');

function hasPushCampaignAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.STORE_ADMIN) {
    return can(req, STORE_FEATURE_KEYS.PUSH_CAMPAIGNS);
  }
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.PUSH_CAMPAIGNS);
  }
  return false;
}

function guard(req, res) {
  if (!hasPushCampaignAccess(req)) {
    sendError(res, 'You do not have access to push campaigns.', 403);
    return false;
  }
  return true;
}

async function listCampaigns(req, res) {
  try {
    if (!guard(req, res)) return;
    return sendSuccess(res, await adminPushCampaigns.listCampaigns(req));
  } catch (err) {
    return sendError(res, err.message || 'Failed to list campaigns.', err.statusCode || 500);
  }
}

async function getCampaign(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const campaign = await adminPushCampaigns.getCampaign(req, id);
    return sendSuccess(res, { campaign });
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function createCampaign(req, res) {
  try {
    if (!guard(req, res)) return;
    const campaign = await adminPushCampaigns.createCampaign(req, req.body || {});
    return sendSuccess(res, { campaign }, 201);
  } catch (err) {
    return sendError(res, err.message || 'Create failed.', err.statusCode || 500);
  }
}

async function updateCampaign(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const campaign = await adminPushCampaigns.updateCampaign(req, id, req.body || {});
    return sendSuccess(res, { campaign });
  } catch (err) {
    return sendError(res, err.message || 'Update failed.', err.statusCode || 500);
  }
}

async function deleteCampaign(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.deleteCampaign(req, id));
  } catch (err) {
    return sendError(res, err.message || 'Delete failed.', err.statusCode || 500);
  }
}

async function listTestUsers(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.listTestUsers(req, id));
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function addTestUser(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminPushCampaigns.addTestUser(req, id, req.body || {});
    return sendSuccess(res, data, 201);
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function removeTestUser(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    const testUserId = parseInt(req.params.testUserId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(testUserId)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.removeTestUser(req, id, testUserId));
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function listSends(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.listSends(req, id, req.query || {}));
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function eligibleCount(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.countEligible(req, id));
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function sendTest(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.sendTest(req, id, req.body || {}));
  } catch (err) {
    return sendError(res, err.message || 'Test send failed.', err.statusCode || 500);
  }
}

async function sendToTestUsers(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.sendToTestUsers(req, id));
  } catch (err) {
    return sendError(res, err.message || 'Send to test users failed.', err.statusCode || 500);
  }
}

async function sendBroadcast(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    return sendSuccess(res, await adminPushCampaigns.sendBroadcast(req, id));
  } catch (err) {
    return sendError(res, err.message || 'Broadcast failed.', err.statusCode || 500);
  }
}

async function uploadImage(req, res) {
  try {
    if (!guard(req, res)) return;
    if (!isS3Configured()) {
      return sendError(res, 'Image upload is not configured (S3).', 503);
    }
    if (!req.file || !req.file.buffer) {
      return sendError(res, 'No image file uploaded.', 400);
    }
    const url = await uploadImageBuffer(req.file.buffer, {
      contentType: req.file.mimetype,
      keyPrefix: 'push-campaigns'
    });
    return sendSuccess(res, { url });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listTestUsers,
  addTestUser,
  removeTestUser,
  listSends,
  eligibleCount,
  sendTest,
  sendToTestUsers,
  sendBroadcast,
  uploadImage
};
