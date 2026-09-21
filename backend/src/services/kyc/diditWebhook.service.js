'use strict';

const db = require('../../db/models');
const { logger } = require('../../libs/logger');
const { getDiditConfig } = require('./didit.client');
const { verifyDiditWebhookSignature } = require('./diditWebhookVerify');
const { applyDiditStatusToUser } = require('./applyDiditStatus.service');
const { classifyDiditWebhook } = require('./diditWebhookClassify');

function extractDeclineReason(payload, status) {
  if (!status || String(status).toLowerCase() !== 'declined') return null;
  const decision = payload?.decision || {};
  const id0 = decision.id_verifications?.[0];
  return (
    id0?.status_detail ||
    id0?.warnings?.[0]?.short_description ||
    id0?.warnings?.[0]?.long_description ||
    decision.status ||
    'Verification declined'
  );
}

/**
 * Phone OTP is normally completed via /v3/phone/check in phoneOtp.service.
 * Webhook is a backup so Approved phone sessions still flip is_phone_verified.
 */
async function applyPhoneWebhookToUser(user, payload) {
  const status = String(payload?.status || payload?.decision?.status || '').toLowerCase();
  if (status !== 'approved') {
    return { applied: false, reason: 'not_approved' };
  }
  if (user.isPhoneVerified) {
    return { applied: false, reason: 'already_verified' };
  }

  const phoneEntry = payload?.decision?.phone_verifications?.[0];
  const fullNumber = phoneEntry?.full_number || phoneEntry?.phone_number || null;
  const patch = {
    isPhoneVerified: true,
    phoneVerifiedAt: user.phoneVerifiedAt || new Date()
  };
  if (fullNumber && !user.phone) {
    patch.phone = String(fullNumber).slice(0, 32);
  }

  if (typeof user.update === 'function') {
    await user.update(patch);
  } else {
    await db.User.update(patch, { where: { userId: user.userId } });
  }

  try {
    const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');
    notifyUserBalanceChanged(user.userId);
  } catch {
    /* never block webhook on wallet push */
  }

  return { applied: true };
}

async function handleDiditWebhook(req) {
  const cfg = getDiditConfig();
  const rawBody = req.body;
  const signature = req.get('X-Signature-V2') || req.get('x-signature-v2') || '';
  const timestamp = req.get('X-Timestamp') || req.get('x-timestamp') || '';

  if (!cfg.webhookSecret) {
    logger.warn('[didit webhook] DIDIT_WEBHOOK_SECRET not set — rejecting');
    const err = new Error('Webhook not configured');
    err.statusCode = 503;
    throw err;
  }

  if (!verifyDiditWebhookSignature(rawBody, signature, timestamp, cfg.webhookSecret)) {
    const err = new Error('Invalid Didit webhook signature');
    err.statusCode = 401;
    throw err;
  }

  let payload;
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    payload = JSON.parse(text);
  } catch {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    throw err;
  }

  const webhookType = String(payload.webhook_type || payload.type || '').toLowerCase();
  if (webhookType && webhookType !== 'status.updated' && !webhookType.includes('status')) {
    logger.info('[didit webhook] ignored type', { webhookType, eventId: payload.event_id });
    return { ok: true, ignored: true };
  }

  const sessionId = payload.session_id || payload.sessionId;
  const vendorData = payload.vendor_data != null ? String(payload.vendor_data) : '';
  const status = payload.status;
  const userIdFromVendor = /^\d+$/.test(vendorData) ? parseInt(vendorData, 10) : null;

  let user = null;
  if (userIdFromVendor) user = await db.User.findByPk(userIdFromVendor);
  if (!user && sessionId) {
    user = await db.User.findOne({ where: { diditSessionId: String(sessionId) } });
  }
  if (!user) {
    logger.warn('[didit webhook] user not found', { sessionId, vendorData, eventId: payload.event_id });
    return { ok: true, userFound: false };
  }

  const kind = classifyDiditWebhook(payload, { kycWorkflowId: cfg.workflowId });

  if (kind === 'phone') {
    const phoneResult = await applyPhoneWebhookToUser(user, payload);
    logger.info('[didit webhook] phone session — skipped KYC fields', {
      userId: user.userId,
      status,
      sessionId,
      eventId: payload.event_id,
      phoneApplied: phoneResult.applied,
      phoneReason: phoneResult.reason || null
    });
    return {
      ok: true,
      userId: user.userId,
      status,
      kind: 'phone',
      kycUpdated: false,
      phoneUpdated: phoneResult.applied
    };
  }

  if (kind === 'unknown') {
    logger.warn('[didit webhook] unclassified session — not updating KYC', {
      userId: user.userId,
      status,
      sessionId,
      workflowId: payload.workflow_id || null,
      eventId: payload.event_id
    });
    return { ok: true, userId: user.userId, status, kind: 'unknown', kycUpdated: false };
  }

  const declineReason = extractDeclineReason(payload, status);

  await applyDiditStatusToUser(user, {
    status,
    sessionId,
    workflowId: payload.workflow_id || payload.decision?.workflow_id,
    declineReason
  });

  logger.info('[didit webhook] identity KYC user updated', {
    userId: user.userId,
    status,
    sessionId,
    eventId: payload.event_id
  });

  return { ok: true, userId: user.userId, status, kind: 'identity_kyc', kycUpdated: true };
}

module.exports = { handleDiditWebhook };
