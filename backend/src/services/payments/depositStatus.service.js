'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const paymentProviders = require('../paymentProviders');

/**
 * Get deposit session status for the in-app modal (polling).
 * When status is still 'pending' and expires_at is in the past, the row is updated to 'expired'.
 * DollarPay / XXPay: optional query via credentials to detect paid/failed while modal is open.
 *
 * @param {number} depositId - payment_pending_deposits.id
 * @param {number} userId - must own the deposit
 * @param {{ dollarpayCreds?: { merchantId: string, apiKey: string }|null, xxpayCreds?: { mchNo: string, apiKey: string, baseUrl?: string|null }|null }} [options]
 * @returns {Promise<{ depositId: number, status: string, message?: string, completedAt?: string } | null>}
 */
async function getDepositStatus(depositId, userId, options = {}) {
  const id = depositId != null ? parseInt(depositId, 10) : NaN;
  const uid = userId != null ? parseInt(userId, 10) : NaN;
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(uid) || uid < 1) {
    return null;
  }

  const pending = await db.PaymentPendingDeposit.findOne({
    where: { id, userId: uid },
    attributes: ['id', 'status', 'provider', 'providerSessionId', 'providerMetadata', 'amount', 'created_at', 'expiresAt']
  });

  if (!pending) return null;

  let status = (pending.status || 'pending').toString().toLowerCase();

  if (status === 'pending' && pending.expiresAt) {
    const expiresAt = pending.expiresAt instanceof Date ? pending.expiresAt : new Date(pending.expiresAt);
    if (expiresAt.getTime() < Date.now()) {
      await pending.update({ status: 'expired' });
      status = 'expired';
    }
  }
  let message = null;
  let completedAt = null;

  // DollarPay: query payin status while modal is open (close/refresh also sync via query).
  if (
    (status === 'pending' || status === 'expired') &&
    String(pending.provider || '').toLowerCase() === 'dollarpay' &&
    options?.dollarpayCreds?.merchantId &&
    options?.dollarpayCreds?.apiKey &&
    pending.providerSessionId
  ) {
    try {
      const dollarpay = require('../paymentProviders/dollarpay/dollarpay.client');
      const { completeDepositFromDollarpay } = require('../wallet/completeDepositFromDollarpay.service');
      const meta = pending.providerMetadata && typeof pending.providerMetadata === 'object' ? pending.providerMetadata : {};
      const data = await dollarpay.queryPayin({
        merchantId: String(meta.merchantId || options.dollarpayCreds.merchantId),
        apiKey: options.dollarpayCreds.apiKey,
        outerOrderSn: String(pending.providerSessionId)
      });
      const payStatus = String(data?.pay_status ?? '').trim();
      if (payStatus === '1') {
        await completeDepositFromDollarpay({
          userId: uid,
          amount: Number(data?.amount ?? data?.primary_amount ?? pending.amount),
          transactionId: String(data?.transaction_id || pending.providerSessionId),
          outerOrderSn: String(pending.providerSessionId),
          paymentType: meta.paymentType || 'cashapp'
        });
        status = 'completed';
        message = 'Payment received.';
      } else if (payStatus === '4' || payStatus === '5') {
        await pending.update({ status: 'failed' });
        status = 'failed';
        message = 'Payment failed.';
      }
    } catch (_) {
      // Keep DB status on provider error
    }
  }

  // XXPay: query pay-in on "I paid" / poll — credit when state=2.
  if (
    (status === 'pending' || status === 'expired' || status === 'closed') &&
    String(pending.provider || '').toLowerCase() === 'xxpay' &&
    pending.providerSessionId
  ) {
    try {
      const xxpay = require('../paymentProviders/xxpay/xxpay.client');
      const { completeDepositFromXxpay } = require('../wallet/completeDepositFromXxpay.service');
      const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
      const meta =
        pending.providerMetadata && typeof pending.providerMetadata === 'object'
          ? pending.providerMetadata
          : {};

      let mchNo = String(meta.mchNo || options?.xxpayCreds?.mchNo || '').trim();
      let apiKey = options?.xxpayCreds?.apiKey || null;
      const baseUrl = meta.xxpayBaseUrl || options?.xxpayCreds?.baseUrl || null;

      if (!apiKey && meta.xxpayKeyEncrypted) {
        try {
          apiKey = decryptPaymentPassword(meta.xxpayKeyEncrypted);
        } catch {
          apiKey = null;
        }
      }

      if (mchNo && apiKey) {
        const data = await xxpay.queryPayin({
          mchNo,
          apiKey,
          baseUrl,
          mchOrderNo: String(pending.providerSessionId),
          payOrderNo: meta.payOrderNo || undefined
        });
        const payload = data?.data && typeof data.data === 'object' ? data.data : data;
        const stateNum = Number(payload?.state);
        const transactionId = String(
          payload?.payOrderNo || payload?.orderNo || meta.payOrderNo || pending.providerSessionId
        ).trim();
        const hasRealAmount =
          payload?.realAmount != null && String(payload.realAmount).trim() !== '';
        let amountDollars = Number(pending.amount);
        if (hasRealAmount) {
          const cents = Number(payload.realAmount);
          if (Number.isFinite(cents) && cents > 0) amountDollars = cents / 100;
        }

        if (stateNum === 2) {
          await completeDepositFromXxpay({
            userId: uid,
            amount: amountDollars,
            overrideAmount: hasRealAmount,
            transactionId,
            outerOrderSn: String(pending.providerSessionId),
            paymentType: meta.paymentType || 'cashapp'
          });
          status = 'completed';
          message = 'Payment received.';
        } else if (stateNum === 3) {
          await pending.update({ status: 'failed' });
          status = 'failed';
          message = 'Payment failed.';
        } else if (stateNum === 6) {
          // XXPay closed unpaid pay-in → closed (not expired). Payouts keep 6 as failed elsewhere.
          await pending.update({ status: 'closed' });
          status = 'closed';
          message = 'This payment was closed.';
          const outer = String(pending.providerSessionId || '').trim();
          if (outer) {
            await db.DepositOrder.update(
              { status: 'CLOSED', lastSyncedAt: new Date() },
              {
                where: {
                  provider: 'xxpay',
                  paymentLinkToken: outer,
                  status: { [Op.in]: ['PENDING', 'LINK_CREATED', 'EXPIRED', 'CLOSED', 'FAILED'] }
                }
              }
            ).catch(() => {});
          }
        }
      }
    } catch (_) {
      // Keep DB status on provider error (e.g. IP whitelist from non-server clients)
    }
  }

  // Optional: call Speed GET /payments/:id to reflect confirming, expired, or failed before webhook.
  if (status === 'pending' && pending.provider === 'scrypto' && pending.providerSessionId) {
    const scryptoProvider = paymentProviders.getProvider('scrypto');
    const getStatus = scryptoProvider?.getPaymentStatus || scryptoProvider?.getDepositStatus;
    if (getStatus && typeof getStatus === 'function') {
      try {
        const providerStatus = await getStatus({
          transactionId: pending.providerSessionId,
          paymentId: pending.providerSessionId
        });
        const ps = (providerStatus?.status || '').toLowerCase();
        if (ps === 'success' || ps === 'paid' || ps === 'completed') {
          status = 'confirming';
          message = 'Payment detected. Confirming…';
        } else if (ps === 'expired') {
          await pending.update({ status: 'expired' });
          status = 'expired';
          message = 'This session has expired.';
        } else if (ps === 'failed') {
          await pending.update({ status: 'failed' });
          status = 'failed';
          message = 'Payment failed.';
        }
      } catch (_) {
        // Keep DB status on provider error
      }
    }
  }

  if (
    (status === 'pending' || status === 'confirming') &&
    String(pending.provider || '').toLowerCase() === 'selfcrypto' &&
    pending.providerSessionId
  ) {
    try {
      const { checkPending } = require('../paymentProviders/selfcrypto/selfcrypto.watchers');
      const { completeDepositFromSelfcrypto } = require('../wallet/completeDepositFromSelfcrypto.service');
      const fresh = await db.PaymentPendingDeposit.findOne({
        where: { id: pending.id, userId: uid }
      });
      if (fresh) {
        const result = await checkPending(fresh);
        if (result.paid) {
          await completeDepositFromSelfcrypto({
            transactionId: fresh.providerSessionId,
            userId: uid,
            amount: Number(fresh.amount),
            cryptoCurrency: fresh.targetCurrency || null,
            txHash: result.txHash || null
          });
          await fresh.update({ status: 'completed' });
          status = 'completed';
          message = 'Payment received.';
        } else if (result.expired) {
          await fresh.update({ status: 'expired' });
          status = 'expired';
          message = 'This session has expired.';
        } else if (result.confirming) {
          if (fresh.status !== 'confirming') await fresh.update({ status: 'confirming' });
          status = 'confirming';
          message = 'Payment detected. Confirming…';
        }
      }
    } catch (_) {
      // Keep DB status on watcher error
    }
  }

  if (status === 'expired') {
    message = 'This session has expired.';
  }
  if (status === 'closed') {
    message = 'This payment was closed.';
  }

  if (status === 'completed') {
    message = 'Payment received.';
    completedAt = pending.created_at;
    if (completedAt && typeof completedAt.toISOString === 'function') {
      completedAt = completedAt.toISOString();
    } else if (completedAt) {
      completedAt = String(completedAt);
    }
  }

  return {
    depositId: pending.id,
    status,
    ...(message && { message }),
    ...(completedAt && { completedAt })
  };
}

module.exports = { getDepositStatus };
