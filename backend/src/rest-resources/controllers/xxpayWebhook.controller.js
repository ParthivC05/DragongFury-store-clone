'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { completeDepositFromXxpay } = require('../../services/wallet/completeDepositFromXxpay.service');
const {
  finalizeDollarpayWithdrawalSuccess,
  finalizeDollarpayWithdrawalFailure
} = require('../../services/wallet/settleDollarpayWithdrawal.service');
const { verifySign } = require('../../services/paymentProviders/xxpay/xxpay.sign');
const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
const { paymentLog, paymentErrorLog, logger } = require('../../libs/logger');

function pick(body, ...keys) {
  for (const k of keys) {
    if (body?.[k] != null && String(body[k]).trim() !== '') return String(body[k]).trim();
  }
  return '';
}

function sanitizeWebhookBody(body) {
  if (!body || typeof body !== 'object') return {};
  const out = { ...body };
  if (out.sign) out.sign = `${String(out.sign).slice(0, 8)}…`;
  return out;
}

async function resolveVerifyKey(withdrawal, pending) {
  if (withdrawal?.dollarpayKeyEncrypted) {
    try {
      return decryptPaymentPassword(withdrawal.dollarpayKeyEncrypted);
    } catch {
      return null;
    }
  }
  const enc = pending?.providerMetadata?.xxpayKeyEncrypted;
  if (enc) {
    try {
      return decryptPaymentPassword(enc);
    } catch {
      return null;
    }
  }
  return null;
}

/** Async notify must return lowercase `success` (ShowDoc). */
function ackOk(res) {
  return res.status(200).type('text/plain').send('success');
}

/**
 * XXPay async notify (form-urlencoded or JSON).
 * Pay-in: state 2 = success; 3 = failed; 6 = closed.
 * Transfer (payout): state 2 = success; 3 failed; 4 cancelled; 5 refunded; 6 closed → failed.
 */
async function xxpayWebhook(req, res) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const safeBody = sanitizeWebhookBody(body);
    const mchOrderNo = pick(body, 'mchOrderNo', 'mch_order_no');
    // Docs field is `orderNo`; some channels also send payOrderNo
    const payOrderNo = pick(body, 'orderNo', 'payOrderNo', 'pay_order_no', 'order_no');
    const transferOrderNo = pick(body, 'transferOrderNo', 'transfer_order_no');
    const state = pick(body, 'state');
    // ecashapp order-fill: prefer realAmount (cents paid) when present
    const amountRaw = pick(body, 'realAmount', 'amount');
    const reviewCode = pick(body, 'reviewCode', 'review_code');
    // Async transfer notify docs use orderNo (same field as pay-in), not transferOrderNo
    const kind = transferOrderNo || reviewCode ? 'payout' : 'payin';

    // Full callback payload (sign truncated) — always print for server debugging.
    console.log('[XXPay] WEBHOOK FULL BODY\n' + JSON.stringify(safeBody, null, 2));
    paymentLog('XXPay webhook received', {
      kind,
      mchOrderNo,
      payOrderNo,
      transferOrderNo,
      state,
      amount: amountRaw,
      body: safeBody
    });
    console.log('[XXPay] WEBHOOK META', {
      kind,
      mchOrderNo,
      payOrderNo,
      transferOrderNo,
      state,
      amount: amountRaw,
      contentType: req.headers['content-type'] || null,
      ip: req.ip || req.headers['x-forwarded-for'] || null
    });

    if (!mchOrderNo && !payOrderNo && !transferOrderNo) {
      paymentLog('XXPay webhook ignored: missing order ids', { body: safeBody });
      return ackOk(res);
    }

    const withdrawal = mchOrderNo
      ? await db.ChimeCashappWithdrawalRequest.findOne({
          where: { outerOrderSn: mchOrderNo, paymentProvider: 'xxpay' }
        })
      : null;

    const pending = !withdrawal && mchOrderNo
      ? await db.PaymentPendingDeposit.findOne({
          where: { provider: 'xxpay', providerSessionId: mchOrderNo },
          attributes: ['id', 'userId', 'amount', 'providerMetadata', 'status']
        })
      : null;

    if (!withdrawal && !pending) {
      logger.warn('[XXPAY_WEBHOOK] unknown mchOrderNo', {
        kind,
        mchOrderNo,
        payOrderNo,
        transferOrderNo,
        body: safeBody
      });
      paymentLog('XXPay webhook unknown order', { kind, mchOrderNo, body: safeBody });
      console.log('[XXPay] WEBHOOK UNKNOWN ORDER — full body above');
      return ackOk(res);
    }

    const resolvedKind = withdrawal ? 'payout' : 'payin';
    const apiKey = await resolveVerifyKey(withdrawal, pending);
    if (!apiKey || !verifySign(body, apiKey)) {
      paymentErrorLog('XXPay webhook rejected: invalid or missing sign', resolvedKind, mchOrderNo);
      logger.error('[XXPAY_WEBHOOK] rejected: invalid or missing sign', { kind: resolvedKind, mchOrderNo });
      return ackOk(res);
    }

    paymentLog('XXPay webhook verified', {
      kind: resolvedKind,
      mchOrderNo,
      state,
      pendingId: pending?.id || null,
      withdrawalId: withdrawal?.id || null,
      userId: withdrawal?.userId || pending?.userId || null
    });

    const stateNum = Number(state);

    if (withdrawal) {
      // Transfer states: 2 success; 3 failed; 4 cancelled; 5 refunded; 6 closed
      if (stateNum === 2) {
        await finalizeDollarpayWithdrawalSuccess(withdrawal, {
          transactionId: transferOrderNo || payOrderNo || mchOrderNo
        });
        paymentLog('XXPay payout webhook settled success', {
          mchOrderNo,
          transferOrderNo: transferOrderNo || payOrderNo || null,
          reviewCode: reviewCode || null,
          withdrawalId: withdrawal.id,
          userId: withdrawal.userId,
          amount: withdrawal.amount
        });
        console.log('[XXPay] PAYOUT WEBHOOK SUCCESS', {
          mchOrderNo,
          transferOrderNo: transferOrderNo || payOrderNo || null,
          reviewCode: reviewCode || null,
          withdrawalId: withdrawal.id
        });
      } else if (stateNum === 3 || stateNum === 4 || stateNum === 5 || stateNum === 6) {
        const reason =
          pick(body, 'errMsg', 'errCode') ||
          (reviewCode ? `XXPay state ${state} reviewCode ${reviewCode}` : `XXPay state ${state}`);
        await finalizeDollarpayWithdrawalFailure(withdrawal, { reason });
        paymentLog('XXPay payout webhook settled failure', {
          mchOrderNo,
          transferOrderNo: transferOrderNo || payOrderNo || null,
          withdrawalId: withdrawal.id,
          userId: withdrawal.userId,
          state: stateNum,
          reviewCode: reviewCode || null,
          reason
        });
        console.log('[XXPay] PAYOUT WEBHOOK FAIL', {
          mchOrderNo,
          transferOrderNo: transferOrderNo || payOrderNo || null,
          withdrawalId: withdrawal.id,
          state: stateNum,
          reason
        });
      } else {
        paymentLog('XXPay payout webhook ignored state', {
          mchOrderNo,
          state: stateNum,
          withdrawalId: withdrawal.id
        });
      }
      return ackOk(res);
    }

    if (pending && stateNum === 2) {
      // Prefer pending.amount (dollars we created). For ecashapp fill, use realAmount cents.
      let amountDollars = Number(pending.amount);
      const hasRealAmount = body.realAmount != null && String(body.realAmount).trim() !== '';
      if (hasRealAmount) {
        const cents = Number(body.realAmount);
        if (Number.isFinite(cents) && cents > 0) amountDollars = cents / 100;
      } else if ((!Number.isFinite(amountDollars) || amountDollars <= 0) && amountRaw) {
        const cents = Number(amountRaw);
        amountDollars = Number.isFinite(cents) ? cents / 100 : NaN;
      }
      await completeDepositFromXxpay({
        userId: pending.userId,
        outerOrderSn: mchOrderNo,
        transactionId: payOrderNo || mchOrderNo,
        amount: amountDollars,
        overrideAmount: hasRealAmount,
        paymentType: pending.providerMetadata?.paymentType
      });
      paymentLog('XXPay pay-in webhook credited', {
        mchOrderNo,
        payOrderNo,
        pendingId: pending.id,
        userId: pending.userId,
        amount: amountDollars,
        paymentType: pending.providerMetadata?.paymentType || null
      });
      console.log('[XXPay] PAYIN WEBHOOK CREDITED', {
        mchOrderNo,
        payOrderNo,
        pendingId: pending.id,
        userId: pending.userId,
        amount: amountDollars
      });
    } else if (pending && stateNum === 3) {
      await pending.update({ status: 'failed' }).catch(() => {});
      if (mchOrderNo) {
        await db.DepositOrder.update(
          { status: 'FAILED', lastSyncedAt: new Date() },
          {
            where: {
              provider: 'xxpay',
              paymentLinkToken: mchOrderNo,
              status: { [Op.in]: ['PENDING', 'LINK_CREATED', 'EXPIRED'] }
            }
          }
        ).catch(() => {});
      }
      paymentLog('XXPay pay-in webhook failed', {
        mchOrderNo,
        state: stateNum,
        pendingId: pending.id
      });
      console.log('[XXPay] PAYIN WEBHOOK FAILED', { mchOrderNo, state: stateNum, pendingId: pending.id });
    } else if (pending && stateNum === 6) {
      // Closed unpaid pay-in → closed (not expired). Payout path above still treats transfer state 6 as failed.
      await pending.update({ status: 'closed' }).catch(() => {});
      if (mchOrderNo) {
        await db.DepositOrder.update(
          { status: 'CLOSED', lastSyncedAt: new Date() },
          {
            where: {
              provider: 'xxpay',
              paymentLinkToken: mchOrderNo,
              status: { [Op.in]: ['PENDING', 'LINK_CREATED', 'EXPIRED', 'CLOSED', 'FAILED'] }
            }
          }
        ).catch(() => {});
      }
      paymentLog('XXPay pay-in webhook closed', {
        mchOrderNo,
        state: stateNum,
        pendingId: pending.id
      });
      console.log('[XXPay] PAYIN WEBHOOK CLOSED', { mchOrderNo, state: stateNum, pendingId: pending.id });
    } else if (pending) {
      paymentLog('XXPay pay-in webhook ignored state', {
        mchOrderNo,
        state: stateNum,
        pendingId: pending.id,
        pendingStatus: pending.status
      });
    }

    return ackOk(res);
  } catch (err) {
    paymentErrorLog('XXPay webhook error', err.message);
    logger.error('[XXPAY_WEBHOOK] error', { message: err.message, stack: err.stack });
    return ackOk(res);
  }
}

module.exports = { xxpayWebhook };
