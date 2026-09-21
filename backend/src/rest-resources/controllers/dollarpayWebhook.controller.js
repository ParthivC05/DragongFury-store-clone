'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { completeDepositFromDollarpay } = require('../../services/wallet/completeDepositFromDollarpay.service');
const {
  finalizeDollarpayWithdrawalSuccess,
  finalizeDollarpayWithdrawalFailure
} = require('../../services/wallet/settleDollarpayWithdrawal.service');
const { verifySign } = require('../../services/paymentProviders/dollarpay/dollarpay.sign');
const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
const { paymentLog, logger } = require('../../libs/logger');

function pick(body, ...keys) {
  for (const k of keys) {
    if (body?.[k] != null && String(body[k]).trim() !== '') return String(body[k]).trim();
  }
  return '';
}

async function resolveVerifyKey(withdrawal, pending) {
  if (withdrawal?.dollarpayKeyEncrypted) {
    try {
      return decryptPaymentPassword(withdrawal.dollarpayKeyEncrypted);
    } catch {
      return null;
    }
  }
  const enc = pending?.providerMetadata?.dollarpayKeyEncrypted;
  if (enc) {
    try {
      return decryptPaymentPassword(enc);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Require a valid DollarPay MD5 sign before any balance mutation.
 * Returns false when the callback must be ignored (no credit/debit).
 * Always respond 200 SUCCESS to DollarPay so they do not infinite-retry.
 */
function assertWebhookAuthenticated(body, apiKey, outerOrderSn) {
  const sign = pick(body, 'sign');
  if (!sign) {
    logger.error('[DOLLARPAY_WEBHOOK] rejected: missing sign', { outerOrderSn });
    return false;
  }
  if (!apiKey) {
    logger.error('[DOLLARPAY_WEBHOOK] rejected: no verify key for order', { outerOrderSn });
    return false;
  }
  if (!verifySign(body, apiKey)) {
    logger.error('[DOLLARPAY_WEBHOOK] rejected: invalid sign', { outerOrderSn });
    return false;
  }
  return true;
}

async function dollarpayWebhook(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const payStatus = pick(body, 'pay_status');
    const outerOrderSn = pick(body, 'outer_order_sn', 'order_sn');
    const transactionId = pick(body, 'transaction_id') || outerOrderSn;

    paymentLog('DollarPay webhook', { outerOrderSn, payStatus });
    console.log('[DollarPayWallet] WEBHOOK', {
      outer_order_sn: outerOrderSn,
      pay_status: payStatus,
      transaction_id: transactionId,
      amount: pick(body, 'amount', 'primary_amount')
    });

    if (!outerOrderSn) {
      return res.status(200).type('text/plain').send('SUCCESS');
    }

    const withdrawal = await db.ChimeCashappWithdrawalRequest.findOne({ where: { outerOrderSn } });

    const pending = !withdrawal
      ? await db.PaymentPendingDeposit.findOne({
          where: { provider: 'dollarpay', providerSessionId: outerOrderSn },
          attributes: ['id', 'userId', 'amount', 'providerMetadata', 'status']
        })
      : null;

    // Unknown order: acknowledge but do nothing (no forge target).
    if (!withdrawal && !pending) {
      logger.warn('[DOLLARPAY_WEBHOOK] unknown outer_order_sn', { outerOrderSn });
      return res.status(200).type('text/plain').send('SUCCESS');
    }

    const apiKey = await resolveVerifyKey(withdrawal, pending);
    // Fail closed: never mutate without a valid signature.
    // (Deposits without a stored key still credit via authenticated DollarPay query sync.)
    if (!assertWebhookAuthenticated(body, apiKey, outerOrderSn)) {
      return res.status(200).type('text/plain').send('SUCCESS');
    }

    if (withdrawal) {
      // Only settle after admin approve submitted payout (processing). Never complete from pending.
      if (String(withdrawal.status) !== 'processing') {
        logger.warn('[DOLLARPAY_WEBHOOK] withdrawal not processing — ignored', {
          outerOrderSn,
          status: withdrawal.status
        });
        return res.status(200).type('text/plain').send('SUCCESS');
      }
      if (payStatus === '1') {
        await finalizeDollarpayWithdrawalSuccess(withdrawal, { transactionId });
      } else if (payStatus === '4' || payStatus === '5') {
        await finalizeDollarpayWithdrawalFailure(withdrawal, {
          reason: pick(body, 'msg', 'message') || `DollarPay payout failed (status ${payStatus})`
        });
      } else if (transactionId) {
        await withdrawal.update({ providerTransactionId: transactionId }).catch(() => {});
      }
      return res.status(200).type('text/plain').send('SUCCESS');
    }

    // Deposit: always credit pending DB amount (never trust webhook amount).
    if (payStatus === '1' && pending && pending.status !== 'completed') {
      const dbAmount = Number(pending.amount);
      if (!Number.isFinite(dbAmount) || dbAmount <= 0) {
        logger.error('[DOLLARPAY_WEBHOOK] invalid pending amount', { outerOrderSn, pendingId: pending.id });
        return res.status(200).type('text/plain').send('SUCCESS');
      }
      await completeDepositFromDollarpay({
        userId: pending.userId,
        amount: dbAmount,
        transactionId,
        outerOrderSn,
        paymentType: pending.providerMetadata?.paymentType || 'cashapp'
      });
    } else if (payStatus === '5' || payStatus === '4') {
      await db.PaymentPendingDeposit.update(
        { status: 'failed' },
        {
          where: {
            provider: 'dollarpay',
            providerSessionId: outerOrderSn,
            status: { [Op.in]: ['pending', 'expired'] }
          }
        }
      ).catch(() => {});
      await db.DepositOrder.update(
        { status: 'FAILED', lastSyncedAt: new Date() },
        {
          where: {
            provider: 'dollarpay',
            paymentLinkToken: outerOrderSn,
            status: { [Op.in]: ['PENDING', 'EXPIRED', 'LINK_CREATED'] }
          }
        }
      ).catch(() => {});
    }

    return res.status(200).type('text/plain').send('SUCCESS');
  } catch (err) {
    logger.error('[DOLLARPAY_WEBHOOK]', { message: err.message });
    return res.status(200).type('text/plain').send('SUCCESS');
  }
}

module.exports = { dollarpayWebhook };
