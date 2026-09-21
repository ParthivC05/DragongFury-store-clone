'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { getPlayjuwaMailConfig } = require('./dragonfuryMail.service');
const { classifyMailgunEvent } = require('./classifyCampaignSendError.service');
const { recordCampaignSendAttempt } = require('./recordCampaignSendAttempt.service');

const logger = createLogger('mailgun-campaign-webhook');

function verifyMailgunSignature({ timestamp, token, signature }, signingKey) {
  if (!timestamp || !token || !signature || !signingKey) return false;
  const encoded = crypto
    .createHmac('sha256', signingKey)
    .update(`${timestamp}${token}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(encoded), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

function normalizeMessageId(id) {
  return String(id || '')
    .trim()
    .replace(/^<|>$/g, '');
}

async function findSendForEvent(eventData) {
  const message =
    eventData.message ||
    eventData['message'] ||
    {};
  const headers = message.headers || message['headers'] || {};
  const messageId =
    headers['message-id'] ||
    headers['message-id'] ||
    eventData['message-id'] ||
    eventData.messageId ||
    null;
  const recipient = String(eventData.recipient || eventData['recipient'] || '')
    .trim()
    .toLowerCase();

  const normalizedId = normalizeMessageId(messageId);
  if (normalizedId) {
    const byId = await db.EmailCampaignSend.findOne({
      where: {
        [Op.or]: [
          { mailgunId: { [Op.iLike]: `%${normalizedId}%` } },
          { mailgunId: `<${normalizedId}>` },
          { mailgunId: normalizedId }
        ]
      },
      order: [['id', 'DESC']]
    });
    if (byId) return byId;
  }

  if (recipient) {
    return db.EmailCampaignSend.findOne({
      where: {
        email: recipient,
        status: { [Op.in]: ['sent', 'pending_retry', 'failed', 'failed_final'] }
      },
      order: [['sentAt', 'DESC'], ['id', 'DESC']]
    });
  }
  return null;
}

/**
 * Apply Mailgun delivery event (failed / delivered / rejected / complained).
 * Soft (temporary) failures can queue one API resend; hard failures stop.
 */
async function applyMailgunDeliveryEvent(eventData = {}) {
  const event = String(eventData.event || '').toLowerCase();
  if (!['failed', 'rejected', 'bounced', 'delivered', 'complained'].includes(event)) {
    return { ok: true, ignored: true, event };
  }

  const send = await findSendForEvent(eventData);
  if (!send) {
    logger.warn({ event, recipient: eventData.recipient }, 'No matching campaign send for Mailgun event');
    return { ok: true, matched: false };
  }

  const delivery = eventData['delivery-status'] || eventData.deliveryStatus || {};
  const deliveryMessage =
    delivery.message ||
    delivery.description ||
    eventData.reason ||
    event ||
    'delivery event';
  const classified = classifyMailgunEvent(eventData);
  const maxAttempts = Math.max(1, Number(send.maxAttempts) || 2);
  const attemptCount = Math.max(0, Number(send.attemptCount) || 0);

  if (event === 'delivered') {
    await send.update({
      deliveryStatus: 'delivered',
      error: null,
      errorClass: null
    });
    await recordCampaignSendAttempt(db, send, {
      attemptNo: Math.max(1, attemptCount),
      source: 'delivery',
      result: 'delivered',
      mailgunId: send.mailgunId,
      raw: eventData
    });
    return { ok: true, matched: true, sendId: send.id, deliveryStatus: 'delivered' };
  }

  const isFail = ['failed', 'rejected', 'bounced'].includes(event);
  if (!isFail && event !== 'complained') {
    return { ok: true, matched: true, ignored: true };
  }

  const canRetry =
    classified.errorClass === 'retryable' &&
    attemptCount < maxAttempts &&
    send.status !== 'failed_final' &&
    send.claimStatus === 'unclaimed';

  let nextStatus = send.status;
  if (event === 'complained') {
    nextStatus = send.status === 'sent' ? 'failed' : send.status;
  } else if (canRetry) {
    nextStatus = 'pending_retry';
  } else if (isFail) {
    nextStatus = attemptCount >= maxAttempts ? 'failed_final' : 'failed';
  }

  await send.update({
    status: nextStatus,
    deliveryStatus:
      event === 'complained'
        ? 'complained'
        : classified.errorClass === 'permanent'
          ? 'bounced'
          : 'deferred',
    error: String(deliveryMessage).slice(0, 4000),
    errorClass: classified.errorClass,
    errorCode: classified.errorCode
  });

  await recordCampaignSendAttempt(db, send, {
    attemptNo: Math.max(1, attemptCount),
    source: 'delivery',
    result: event === 'complained' ? 'complained' : 'failed',
    error: String(deliveryMessage).slice(0, 4000),
    errorCode: classified.errorCode,
    errorClass: classified.errorClass,
    mailgunId: send.mailgunId,
    raw: eventData
  });

  return {
    ok: true,
    matched: true,
    sendId: send.id,
    status: nextStatus,
    errorClass: classified.errorClass,
    deliveryMessage: String(deliveryMessage).slice(0, 500)
  };
}

function extractSignatureParts(body = {}) {
  const nested = body.signature && typeof body.signature === 'object' ? body.signature : null;
  const parent =
    body['parent-signature'] && typeof body['parent-signature'] === 'object'
      ? body['parent-signature']
      : null;
  // JSON webhooks: { signature: { timestamp, token, signature } }
  // Form webhooks: flat timestamp / token / signature fields
  return {
    primary: {
      timestamp: nested?.timestamp || body.timestamp,
      token: nested?.token || body.token,
      signature: nested?.signature || (typeof body.signature === 'string' ? body.signature : null)
    },
    parent: parent
      ? {
          timestamp: parent.timestamp,
          token: parent.token,
          signature: parent.signature
        }
      : null
  };
}

async function handleMailgunCampaignWebhook(body = {}) {
  const cfg = getPlayjuwaMailConfig();
  // Must be HTTP webhook signing key (Mailgun → API Security), NOT private API key.
  const signingKey = cfg.webhookSigningKey;
  const parts = extractSignatureParts(body);

  if (!signingKey) {
    const err = new Error(
      'Mailgun webhook signing key not configured. Set DRAGONFURY_MAILGUN_WEBHOOK_SIGNING_KEY (HTTP webhook signing key from Mailgun API Security).'
    );
    err.statusCode = 503;
    throw err;
  }

  const primaryOk = verifyMailgunSignature(parts.primary, signingKey);
  const parentOk = parts.parent ? verifyMailgunSignature(parts.parent, signingKey) : false;
  if (!primaryOk && !parentOk) {
    logger.warn(
      {
        hasTimestamp: Boolean(parts.primary.timestamp),
        hasToken: Boolean(parts.primary.token),
        hasSignature: Boolean(parts.primary.signature),
        hasParent: Boolean(parts.parent)
      },
      'Invalid Mailgun webhook signature'
    );
    const err = new Error('Invalid Mailgun signature');
    err.statusCode = 403;
    throw err;
  }

  const eventData = body['event-data'] || body.eventData || body;
  return applyMailgunDeliveryEvent(eventData);
}

module.exports = {
  verifyMailgunSignature,
  applyMailgunDeliveryEvent,
  handleMailgunCampaignWebhook
};
