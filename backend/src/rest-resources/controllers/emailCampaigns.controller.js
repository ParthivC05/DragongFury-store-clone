'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { EMAIL_CAMPAIGN_STORE_CODE, normalizeStoreCode } = require('../../services/emailCampaigns/constants');
const claimService = require('../../services/emailCampaigns/claimCampaignOffer.service');
const spinWheelCoupon = require('../../services/spinWheel/spinWheelCoupon.service');

function assertPlayjuwaUser(req, res) {
  const store = normalizeStoreCode(req.user?.storeCode);
  if (store !== EMAIL_CAMPAIGN_STORE_CODE) {
    sendError(res, 'Not available for this store.', 403);
    return false;
  }
  return true;
}

function isPlayjuwaUser(req) {
  return normalizeStoreCode(req.user?.storeCode) === EMAIL_CAMPAIGN_STORE_CODE;
}

async function previewClaim(req, res) {
  try {
    const data = await claimService.getClaimPreview(req.query.token || req.params.token);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function claim(req, res) {
  try {
    if (!assertPlayjuwaUser(req, res)) return;
    const token = req.body?.token || req.query?.token;
    const data = await claimService.claimOffer(req, token);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Claim failed.', err.statusCode || 500);
  }
}

async function applyCode(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const code = req.body?.code || req.body?.discountCode;
    const spin = await spinWheelCoupon.tryApplyCode(userId, code);
    if (spin) {
      await claimService.unapplyAppliedCode(userId);
      return sendSuccess(res, spin);
    }
    if (!isPlayjuwaUser(req)) {
      return sendError(res, 'Invalid or unused discount code.', 400);
    }
    await spinWheelCoupon.unapplyApplied(userId);
    const data = await claimService.applyDiscountCode(req, code);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Apply failed.', err.statusCode || 500);
  }
}

async function getAppliedCode(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const spin = await spinWheelCoupon.getAppliedPayload(userId);
    if (spin) return sendSuccess(res, spin);
    if (!isPlayjuwaUser(req)) return sendSuccess(res, { applied: false });
    const data = await claimService.getAppliedDiscountCode(req);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed.', err.statusCode || 500);
  }
}

async function removeCode(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const spinRemoved = await spinWheelCoupon.removeApplied(userId);
    if (spinRemoved) return sendSuccess(res, spinRemoved);
    if (!isPlayjuwaUser(req)) {
      return sendError(res, 'No discount code is applied.', 400);
    }
    const data = await claimService.removeDiscountCode(req);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Remove failed.', err.statusCode || 500);
  }
}

module.exports = {
  previewClaim,
  claim,
  applyCode,
  getAppliedCode,
  removeCode
};
