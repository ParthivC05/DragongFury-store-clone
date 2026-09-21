'use strict';

const crypto = require('crypto');
const walletService = require('../../services/wallet');
const db = require('../../db/models');
const { logger } = require('../../libs/logger');

/**
 * Payment webhook payload shape (from CentryOS / payment provider):
 * - eventType: 'COLLECTION' | 'WITHDRAWAL'
 * - status: 'SUCCESS' | ...
 * - payload: { transactionId, amount, method, paymentLink?: { externalId }, metadata?, ... }
 */
function isSuccessStatus(status) {
  if (!status || typeof status !== 'string') return false;
  const s = status.toLowerCase().trim();
  return ['success', 'completed', 'complete', 'successful'].some((ok) => s === ok || s.includes(ok));
}

/**
 * POST /api/webhooks/payment
 * Receives COLLECTION (pay-in) and WITHDRAWAL (payout) events. Verifies HMAC if PAYMENT_WEBHOOK_SECRET is set.
 * - COLLECTION + SUCCESS: complete deposit for user (paymentLink.externalId = partner userId) and transactionId.
 * - WITHDRAWAL + SUCCESS: update local withdrawal to success when we can identify user (e.g. metadata.partnerUserId or customData.partnerUserId).
 */
async function paymentWebhook(req, res) {
  const requestId = crypto.randomUUID?.() || `wh-${Date.now()}`;

  try {
    const rawBody = req.body;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      logger.warn('[PAYMENT_WEBHOOK] Raw body missing or not buffer', { requestId });
      return res.status(400).json({ success: false, message: 'Raw body missing' });
    }

    const secret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.CENTRYOS_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.get('signature');
      const expectedSignature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
      const isValid =
        signature &&
        crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'));
      if (!isValid) {
        logger.warn('[PAYMENT_WEBHOOK] Invalid signature', { requestId });
        return res.status(401).json({ success: false, message: 'Invalid signature' });
      }
    }

    const payload = JSON.parse(rawBody.toString());
    const eventType = payload?.eventType;
    const status = payload?.status;
    const p = payload?.payload || {};

    if (!['COLLECTION', 'WITHDRAWAL'].includes(eventType)) {
      logger.info('[PAYMENT_WEBHOOK] Unsupported event ignored', { requestId, eventType });
      return res.status(200).json({ success: true, ignored: true });
    }

    logger.info('[PAYMENT_WEBHOOK] Event received', {
      requestId,
      eventType,
      status,
      transactionId: p.transactionId
    });

    const success = isSuccessStatus(status);

    if (eventType === 'COLLECTION' && success) {
      const transactionId = (p.transactionId || p.id || '').toString().trim();
      const externalId = p.paymentLink?.externalId != null ? String(p.paymentLink.externalId).trim() : '';
      if (!transactionId || !externalId) {
        logger.warn('[PAYMENT_WEBHOOK] COLLECTION missing transactionId or paymentLink.externalId', {
          requestId,
          transactionId,
          hasExternalId: !!externalId
        });
        return res.status(200).json({ success: true, processed: false });
      }
      const userId = parseInt(externalId, 10);
      if (!Number.isFinite(userId)) {
        logger.warn('[PAYMENT_WEBHOOK] COLLECTION externalId is not a valid user id', {
          requestId,
          externalId
        });
        return res.status(200).json({ success: true, processed: false });
      }
      try {
        const result = await walletService.completeDepositFromPayment(userId, transactionId);
        logger.info('[PAYMENT_WEBHOOK] Deposit completed', {
          requestId,
          userId,
          transactionId,
          alreadyProcessed: result.alreadyProcessed
        });
        return res.status(200).json({
          success: true,
          processed: true,
          alreadyProcessed: result.alreadyProcessed
        });
      } catch (err) {
        logger.error('[PAYMENT_WEBHOOK] completeDepositFromPayment failed', {
          requestId,
          userId,
          transactionId,
          message: err.message
        });
        return res.status(500).json({ success: false, message: 'Deposit completion failed' });
      }
    }

    if (eventType === 'WITHDRAWAL' && success) {
      const transactionId = (p.transactionId || p.id || '').toString().trim();
      const amount = p.amount != null ? Number(p.amount) : NaN;
      const partnerUserId =
        p.metadata?.partnerUserId ??
        p.metadata?.partner_user_id ??
        p.paymentLink?.customData?.partnerUserId ??
        p.paymentLink?.customData?.partner_user_id;

      if (!transactionId) {
        logger.info('[PAYMENT_WEBHOOK] WITHDRAWAL missing transactionId', { requestId });
        return res.status(200).json({ success: true, processed: false });
      }

      let userId = null;
      if (partnerUserId != null) {
        const id = parseInt(partnerUserId, 10);
        if (Number.isFinite(id)) userId = id;
      }
      if (userId == null) {
        logger.info('[PAYMENT_WEBHOOK] WITHDRAWAL could not resolve partner user (set metadata.partnerUserId or paymentLink.customData.partnerUserId in webhook payload)', {
          requestId,
          transactionId
        });
        return res.status(200).json({ success: true, processed: false });
      }

      try {
        const updated = await markWithdrawalSuccessByTransaction(userId, transactionId, amount);
        if (updated) {
          logger.info('[PAYMENT_WEBHOOK] Withdrawal marked success', {
            requestId,
            userId,
            transactionId
          });
        }
        return res.status(200).json({ success: true, processed: !!updated });
      } catch (err) {
        logger.error('[PAYMENT_WEBHOOK] markWithdrawalSuccess failed', {
          requestId,
          message: err.message
        });
        return res.status(500).json({ success: false, message: 'Withdrawal update failed' });
      }
    }

    return res.status(200).json({ success: true, processed: false });
  } catch (error) {
    logger.error('[PAYMENT_WEBHOOK] Processing failed', {
      requestId,
      message: error.message,
      stack: error.stack
    });
    return res.status(500).json({ success: false, message: 'Webhook processing error' });
  }
}

/**
 * Mark the matching pending payment-api withdrawal as success.
 * Match by: userId + method 'payment-api' + status 'pending', and optionally transactionId or amount.
 */
async function markWithdrawalSuccessByTransaction(userId, transactionId, amount) {
  const { WithdrawalRequest } = db;
  const where = {
    userId,
    method: 'payment-api',
    status: 'pending'
  };
  if (Number.isFinite(amount) && amount > 0) {
    where.amount = amount;
  }
  const pending = await WithdrawalRequest.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 5
  });
  if (pending.length === 0) return false;
  const toUpdate = pending[0];
  await toUpdate.update({ status: 'success' });
  return true;
}

module.exports = {
  paymentWebhook
};
