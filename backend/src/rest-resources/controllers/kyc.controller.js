'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { getKycStatusForUser, startKycSession } = require('../../services/kyc/kycSession.service');

function safeMessage(err, fallback) {
  if (!err) return fallback;
  const status = err.statusCode ?? err.response?.status;
  if (status != null && status >= 500) return fallback;
  const msg = (err.message || '').trim();
  return msg || fallback;
}

async function getStatus(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const refresh = String(req.query?.refresh || '') === '1' || req.query?.refresh === true;
    const data = await getKycStatusForUser(userId, { refresh });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, safeMessage(err, 'Unable to load KYC status.'), err.statusCode || 500);
  }
}

async function createSession(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await startKycSession(userId);
    return sendSuccess(res, data, data.alreadyApproved ? 200 : 201);
  } catch (err) {
    return sendError(res, safeMessage(err, 'Unable to start identity verification.'), err.statusCode || 500);
  }
}

module.exports = { getStatus, createSession };
