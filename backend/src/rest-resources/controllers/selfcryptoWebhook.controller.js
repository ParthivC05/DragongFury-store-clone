'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../db/models');
const { env } = require('../../services/paymentProviders/selfcrypto/selfcrypto.config');
const { completeDepositFromSelfcrypto } = require('../../services/wallet/completeDepositFromSelfcrypto.service');
const { logger } = require('../../libs/logger');

function verifyBtcpaySignature(rawBody, secret, header) {
  if (!secret || !rawBody || !Buffer.isBuffer(rawBody) || !header) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = String(header).replace(/^sha256=/i, '').trim();
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(received, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function isPaidEvent(payload) {
  const type = String(payload?.type || payload?.eventType || '').toLowerCase();
  return type === 'invoicesettled' || type === 'invoicepaymentsettled';
}

/**
 * POST /api/webhooks/btcpay — BTCPay Greenfield webhook for Lightning invoices.
 */
async function btcpayWebhook(req, res) {
  const requestId = crypto.randomUUID?.() || `wh-${Date.now()}`;
  try {
    const rawBody = req.body;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ received: false, message: 'Raw body missing' });
    }

    const secret = env('BTCPAY_WEBHOOK_SECRET');
    const sig = req.get('btcpay-sig') || req.get('BTCPay-Sig');
    if (secret && !verifyBtcpaySignature(rawBody, secret, sig)) {
      logger.warn('[SELFCRYPTO_WEBHOOK] Invalid BTCPay signature', { requestId });
      return res.status(401).json({ received: false, message: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    if (!isPaidEvent(payload)) {
      return res.status(200).json({ received: true, processed: false });
    }

    const invoiceId = String(payload?.invoiceId || payload?.invoiceID || '').trim();
    if (!invoiceId) {
      return res.status(200).json({ received: true, processed: false });
    }

    let row = await db.PaymentPendingDeposit.findOne({
      where: { provider: 'selfcrypto', providerSessionId: invoiceId }
    });
    if (!row) {
      const open = await db.PaymentPendingDeposit.findAll({
        where: {
          provider: 'selfcrypto',
          status: { [Op.in]: ['pending', 'confirming'] }
        },
        attributes: ['id', 'userId', 'amount', 'status', 'providerSessionId', 'providerMetadata', 'targetCurrency']
      });
      row = open.find((p) => {
        const meta = p.providerMetadata && typeof p.providerMetadata === 'object' ? p.providerMetadata : {};
        return String(meta.btcpayInvoiceId || '') === invoiceId;
      }) || null;
    }

    if (!row) {
      logger.info('[SELFCRYPTO_WEBHOOK] Unknown invoice', { requestId, invoiceId });
      return res.status(200).json({ received: true, processed: false });
    }

    const result = await completeDepositFromSelfcrypto({
      transactionId: row.providerSessionId,
      userId: row.userId,
      amount: Number(row.amount),
      cryptoCurrency: row.targetCurrency || 'BTC',
      txHash: invoiceId
    });
    await row.update({ status: 'completed' });
    logger.info('[SELFCRYPTO_WEBHOOK] Deposit completed', {
      requestId,
      userId: row.userId,
      alreadyProcessed: result?.alreadyProcessed
    });
    return res.status(200).json({
      received: true,
      processed: true,
      alreadyProcessed: result?.alreadyProcessed === true
    });
  } catch (err) {
    logger.error('[SELFCRYPTO_WEBHOOK] failed', { requestId, message: err.message });
    return res.status(500).json({ received: false, message: 'Webhook error' });
  }
}

module.exports = { btcpayWebhook };
