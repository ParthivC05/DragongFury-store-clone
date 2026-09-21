'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { isEmailCampaignStoreAllowed } = require('../../services/emailCampaigns/constants');
const adminEmailCampaigns = require('../../services/emailCampaigns/adminEmailCampaigns.service');
const { uploadImageBuffer, isS3Configured } = require('../../utils/s3Upload');

function hasEmailCampaignAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.STORE_ADMIN) {
    if (!isEmailCampaignStoreAllowed(req.storeCode)) return false;
    return can(req, STORE_FEATURE_KEYS.EMAIL_CAMPAIGNS);
  }
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.EMAIL_CAMPAIGNS);
  }
  return false;
}

function guard(req, res) {
  if (!hasEmailCampaignAccess(req)) {
    sendError(res, 'You do not have access to email campaigns.', 403);
    return false;
  }
  return true;
}

async function listCampaigns(req, res) {
  try {
    if (!guard(req, res)) return;
    const data = await adminEmailCampaigns.listCampaigns(req);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to list campaigns.', err.statusCode || 500);
  }
}

async function getCampaign(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const campaign = await adminEmailCampaigns.getCampaign(req, id);
    return sendSuccess(res, { campaign });
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function createCampaign(req, res) {
  try {
    if (!guard(req, res)) return;
    const campaign = await adminEmailCampaigns.createCampaign(req, req.body || {});
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
    const campaign = await adminEmailCampaigns.updateCampaign(req, id, req.body || {});
    return sendSuccess(res, { campaign });
  } catch (err) {
    return sendError(res, err.message || 'Update failed.', err.statusCode || 500);
  }
}

async function listTestUsers(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.listTestUsers(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function addTestUser(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.addTestUser(req, id, req.body || {});
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
    const data = await adminEmailCampaigns.removeTestUser(req, id, testUserId);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function listSends(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.listSends(req, id, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function getSendDetail(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    const sendId = parseInt(req.params.sendId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(sendId)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.getSendDetail(req, id, sendId);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load send.', err.statusCode || 500);
  }
}

async function syncSendDelivery(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    const sendId = parseInt(req.params.sendId, 10);
    if (!Number.isFinite(id) || !Number.isFinite(sendId)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.syncSendDelivery(req, id, sendId);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to sync delivery.', err.statusCode || 500);
  }
}

async function syncCampaignDelivery(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.syncCampaignDelivery(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to sync delivery.', err.statusCode || 500);
  }
}

async function preview(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = req.params.id ? parseInt(req.params.id, 10) : null;
    const data = await adminEmailCampaigns.previewCampaign(req, id, req.body || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Preview failed.', err.statusCode || 500);
  }
}

async function sendTest(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.sendTestEmail(req, id, req.body || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Test send failed.', err.statusCode || 500);
  }
}

async function sendToTestUsers(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.sendToTestUsers(req, id, req.body || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Send to test users failed.', err.statusCode || 500);
  }
}

async function eligibleCount(req, res) {
  try {
    if (!guard(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await adminEmailCampaigns.countEligible(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
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
      keyPrefix: 'email-campaigns'
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
  listTestUsers,
  addTestUser,
  removeTestUser,
  listSends,
  getSendDetail,
  syncSendDelivery,
  syncCampaignDelivery,
  preview,
  sendTest,
  sendToTestUsers,
  eligibleCount,
  uploadImage
};
