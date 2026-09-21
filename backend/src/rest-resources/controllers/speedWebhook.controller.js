'use strict';

const crypto = require('crypto');
const walletService = require('../../services/wallet');
const db = require('../../db/models');
const { logger } = require('../../libs/logger');

/**
 * Verify Speed webhook signature.
 * Speed sends: webhook-signature (e.g. v1,base64), webhook-timestamp, webhook-id.
 * Signed payload = webhook-id + "." + webhook-timestamp + "." + rawBody
 * Secret: SPEED_WEBHOOK_SECRET (endpoint secret from Speed; remove wsec_ prefix and base64 decode per Speed docs).
 */
function verifySpeedWebhookSignature(req, rawBody, secret) {
  if (!secret || !rawBody || !Buffer.isBuffer(rawBody)) return false;
  const sigHeader = req.get('webhook-signature') || req.get('x-webhook-signature');
  const webhookId = req.get('webhook-id') || req.get('x-webhook-id');
  const webhookTimestamp = req.get('webhook-timestamp') || req.get('x-webhook-timestamp');
  if (!sigHeader || !webhookId || !webhookTimestamp) return false;
  let key = secret.trim();
  if (key.startsWith('wsec_')) {
    try {
      key = Buffer.from(key.slice(5), 'base64').toString('utf8');
    } catch {
      key = secret;
    }
  }
  const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', key).update(signedPayload).digest('base64');
  const received = sigHeader.includes(',') ? sigHeader.split(',')[1].trim() : sigHeader.replace(/^v1,?/i, '').trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(received, 'base64'));
  } catch {
    return false;
  }
}

const PAYMENT_COMPLETE_EVENTS = [
  'checkout_session.paid',
  'checkout_session.completed',
  'payment.paid',
  'payment.completed'
];

const WITHDRAW_REQUEST_EVENTS = [
  'withdraw_request.paid',
  'withdraw_request.deactivated'
];

/**
 * POST /api/webhooks/speed
 * Handles: (1) deposit completion (payment.paid etc.), (2) withdraw-request updates (withdraw_request.paid / deactivated).
 * Body: { event_type, data: { payment_id | id, amount?, metadata? } } or { event_type: 'withdraw_request.paid', data: { id } }
 */
async function speedWebhook(req, res) {
  const requestId = crypto.randomUUID?.() || `wh-${Date.now()}`;

  try {
    const rawBody = req.body;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      logger.warn('[SPEED_WEBHOOK] Raw body missing or not buffer', { requestId });
      return res.status(400).json({ received: false, message: 'Raw body missing' });
    }

    const secret = process.env.SPEED_WEBHOOK_SECRET;
    if (secret && !verifySpeedWebhookSignature(req, rawBody, secret)) {
      logger.warn('[SPEED_WEBHOOK] Invalid signature', { requestId });
      return res.status(401).json({ received: false, message: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody.toString());
    const eventType = payload?.event_type || payload?.eventType;
    const data = payload?.data || payload;
    // Speed sends payment events with data.object (e.g. data.object.id); withdraw may use data.id
    const obj = data?.object || data;

    // Withdraw-request lifecycle: update local speed_withdraw_requests record
    if (WITHDRAW_REQUEST_EVENTS.includes(eventType)) {
      const { updateSpeedWithdrawFromWebhook } = require('../../services/speedWithdraw/updateSpeedWithdrawFromWebhook.service');
      const providerRef = (data?.id ?? data?.withdraw_request_id ?? obj?.id ?? '').toString().trim();
      if (providerRef) {
        const status = eventType === 'withdraw_request.paid' ? 'paid' : 'deactivated';
        const { updated } = await updateSpeedWithdrawFromWebhook({ providerReference: providerRef, status });
        return res.status(200).json({ received: true, processed: updated });
      }
      return res.status(200).json({ received: true, processed: false });
    }

    if (!PAYMENT_COMPLETE_EVENTS.includes(eventType)) {
      logger.info('[SPEED_WEBHOOK] Ignored event', { requestId, eventType });
      return res.status(200).json({ received: true, processed: false });
    }

    const transactionId = (obj?.id ?? data?.payment_id ?? data?.paymentId ?? data?.id ?? data?.transaction_id ?? '').toString().trim();
    if (!transactionId) {
      logger.warn('[SPEED_WEBHOOK] Missing payment id in webhook data', { requestId });
      return res.status(200).json({ received: true, processed: false });
    }

    let pending = null;
    if (db.PaymentPendingDeposit) {
      pending = await db.PaymentPendingDeposit.findOne({
        where: { provider: 'scrypto', providerSessionId: transactionId },
        attributes: ['id', 'userId', 'amount', 'status']
      });
    }

    const userId = pending ? parseInt(pending.userId, 10) : (obj?.metadata?.userId != null ? parseInt(obj.metadata.userId, 10) : (data?.metadata?.userId != null ? parseInt(data.metadata.userId, 10) : NaN));
    const amount = pending && Number.isFinite(Number(pending.amount)) ? Number(pending.amount) : (obj?.amount != null ? Number(obj.amount) : (data?.amount != null ? Number(data.amount) : NaN));
    const cryptoCurrency = (obj?.target_currency ?? obj?.currency ?? data?.crypto_currency ?? data?.currency ?? data?.cryptoCurrency ?? '').toString().trim().slice(0, 32) || null;
    const txHash = (obj?.tx_hash ?? obj?.payment_hash ?? data?.tx_hash ?? data?.payment_hash ?? data?.txHash ?? '').toString().trim().slice(0, 255) || null;

    if (!Number.isInteger(userId) || userId < 1) {
      logger.warn('[SPEED_WEBHOOK] Missing or invalid userId', { requestId, transactionId });
      return res.status(200).json({ received: true, processed: false });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      logger.warn('[SPEED_WEBHOOK] Invalid amount', { requestId, amount });
      return res.status(200).json({ received: true, processed: false });
    }

    try {
      const result = await walletService.completeDepositFromSpeed({
        transactionId,
        userId,
        amount,
        ...(cryptoCurrency && { cryptoCurrency }),
        ...(txHash && { txHash })
      });
      logger.info('[SPEED_WEBHOOK] Deposit completed', {
        requestId,
        userId,
        transactionId,
        alreadyProcessed: result?.alreadyProcessed
      });
      if (pending) await pending.update({ status: 'completed' });
      return res.status(200).json({
        received: true,
        processed: true,
        alreadyProcessed: result?.alreadyProcessed === true
      });
    } catch (err) {
      logger.error('[SPEED_WEBHOOK] completeDepositFromSpeed failed', {
        requestId,
        userId,
        transactionId,
        message: err.message
      });
      return res.status(500).json({ received: true, processed: false, message: 'Deposit completion failed' });
    }
  } catch (err) {
    logger.error('[SPEED_WEBHOOK] Processing failed', { requestId, message: err.message, stack: err.stack });
    return res.status(500).json({ received: false, message: 'Webhook error' });
  }
}

module.exports = { speedWebhook };
4