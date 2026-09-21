'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { deposit } = require('./deposit.service');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');
const { normalizePackageMeta } = require('../depositPackages/depositPackageMeta.service');

const PROVIDER = 'dollarpay';

/**
 * Credit wallet from DollarPay payin (webhook or query).
 * Idempotent via PaymentDepositCompletion(provider, transactionId).
 * If wallet credit fails after claiming the completion row, the claim is removed so retry can succeed.
 */
async function completeDepositFromDollarpay(data) {
  const outerOrderSn = (data?.outerOrderSn ?? data?.outer_order_sn ?? '').toString().trim();
  const transactionId = (data?.transactionId ?? data?.transaction_id ?? outerOrderSn).toString().trim();
  const userId = data?.userId != null ? parseInt(data.userId, 10) : NaN;

  if (!transactionId || !Number.isInteger(userId) || userId < 1) {
    const err = new Error('Invalid DollarPay deposit completion payload.');
    err.statusCode = 400;
    throw err;
  }

  // Always prefer the pending deposit amount from DB (never trust client/webhook amount).
  let amount = NaN;
  let pendingLookup = null;
  if (outerOrderSn) {
    pendingLookup = await db.PaymentPendingDeposit.findOne({
      where: { provider: PROVIDER, providerSessionId: outerOrderSn, userId },
      order: [['id', 'DESC']],
      attributes: ['id', 'amount', 'providerMetadata', 'status', 'userId']
    });
    if (pendingLookup) {
      amount = Number(pendingLookup.amount);
    }
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    amount = data?.amount != null ? Number(data.amount) : NaN;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Invalid DollarPay deposit completion payload.');
    err.statusCode = 400;
    throw err;
  }

  const completion = await db.sequelize.transaction(async (tr) => {
    const existing = await db.PaymentDepositCompletion.findOne({
      where: { provider: PROVIDER, transactionId },
      attributes: ['id'],
      transaction: tr,
      lock: tr.LOCK.UPDATE
    });
    if (existing) return null;
    return db.PaymentDepositCompletion.create(
      { provider: PROVIDER, transactionId, userId, amount },
      { transaction: tr }
    ).catch((err) => {
      if (err.name === 'SequelizeUniqueConstraintError') return null;
      throw err;
    });
  });

  if (!completion) {
    return { message: 'Deposit already credited.', alreadyProcessed: true };
  }

  try {
    const pending =
      pendingLookup ||
      (await db.PaymentPendingDeposit.findOne({
        where: { provider: PROVIDER, ...(outerOrderSn ? { providerSessionId: outerOrderSn } : {}), userId },
        order: [['id', 'DESC']],
        attributes: ['id', 'providerMetadata', 'status', 'amount']
      }));
    if (pending && Number(pending.userId) !== userId) {
      const err = new Error('DollarPay deposit user mismatch.');
      err.statusCode = 403;
      throw err;
    }
    const meta = pending?.providerMetadata && typeof pending.providerMetadata === 'object' ? pending.providerMetadata : null;
    const depositPayload = {
      amount,
      method: data?.paymentType || meta?.paymentType || 'cashapp',
      provider: PROVIDER,
      providerTransactionId: transactionId
    };
    const creditAmount = meta?.creditAmount != null ? Number(meta.creditAmount) : NaN;
    if (Number.isFinite(creditAmount) && creditAmount > 0) depositPayload.creditAmount = creditAmount;
    const packageMetadata = normalizePackageMeta(meta);
    if (packageMetadata) depositPayload.packageMetadata = packageMetadata;

    const result = await deposit(userId, depositPayload);
    if (pending && pending.status !== 'completed') await pending.update({ status: 'completed' });
    if (outerOrderSn) {
      await db.DepositOrder.update(
        { status: 'SUCCESS', providerTransactionId: transactionId, completedAt: new Date(), lastSyncedAt: new Date() },
        {
          where: {
            provider: PROVIDER,
            paymentLinkToken: outerOrderSn,
            userId,
            status: { [Op.in]: ['PENDING', 'EXPIRED', 'LINK_CREATED'] }
          }
        }
      ).catch(() => {});
    }
    paymentLog('completeDepositFromDollarpay credited', { userId, transactionId, amount });
    return result;
  } catch (err) {
    // Allow webhook/query retry to credit after a transient wallet failure.
    await db.PaymentDepositCompletion.destroy({ where: { id: completion.id } }).catch(() => {});
    paymentErrorLog('completeDepositFromDollarpay failed (claim released for retry)', transactionId, err.message);
    throw err;
  }
}

module.exports = { completeDepositFromDollarpay };
