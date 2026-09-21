'use strict';

const db = require('../../db/models');
const { deposit } = require('./deposit.service');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');
const { normalizePackageMeta } = require('../depositPackages/depositPackageMeta.service');

const PROVIDER = 'selfcrypto';

/**
 * Credit a self-hosted crypto deposit once. Idempotent on provider + transactionId.
 */
async function completeDepositFromSelfcrypto(data) {
  const transactionId = (data?.transactionId ?? '').toString().trim();
  const userId = data?.userId != null ? parseInt(data.userId, 10) : NaN;
  const amount = data?.amount != null ? Number(data.amount) : NaN;
  const cryptoCurrency = (data?.cryptoCurrency ?? '').toString().trim().slice(0, 32) || null;
  const txHash = (data?.txHash ?? '').toString().trim().slice(0, 255) || null;

  paymentLog('completeDepositFromSelfcrypto', { transactionId, userId, amount });

  if (!transactionId) {
    const err = new Error('completeDepositFromSelfcrypto: transactionId is required');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(userId) || userId < 1) {
    const err = new Error('completeDepositFromSelfcrypto: valid userId is required');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('completeDepositFromSelfcrypto: valid amount is required');
    err.statusCode = 400;
    throw err;
  }

  const completion = await db.sequelize.transaction(async (tr) => {
    const existing = await db.PaymentDepositCompletion.findOne({
      where: { provider: PROVIDER, transactionId },
      attributes: ['id'],
      transaction: tr
    });
    if (existing) return null;
    const created = await db.PaymentDepositCompletion.create(
      { provider: PROVIDER, transactionId, userId, amount },
      { transaction: tr }
    ).catch((err) => {
      if (err.name === 'SequelizeUniqueConstraintError') return null;
      throw err;
    });
    return created;
  });

  if (!completion) {
    paymentLog('completeDepositFromSelfcrypto: already processed', transactionId);
    return { message: 'Deposit already credited for this payment.', alreadyProcessed: true };
  }

  try {
    const depositPayload = {
      amount,
      method: 'crypto',
      provider: PROVIDER,
      providerTransactionId: transactionId
    };
    if (cryptoCurrency) depositPayload.cryptoCurrency = cryptoCurrency;
    if (txHash) depositPayload.txHash = txHash;

    const pending = await db.PaymentPendingDeposit.findOne({
      where: { provider: PROVIDER, providerSessionId: transactionId },
      attributes: ['providerMetadata'],
      raw: true
    });
    const meta = pending?.providerMetadata && typeof pending.providerMetadata === 'object'
      ? pending.providerMetadata
      : null;
    const creditAmount = meta?.creditAmount != null ? Number(meta.creditAmount) : NaN;
    if (Number.isFinite(creditAmount) && creditAmount > 0) {
      depositPayload.creditAmount = creditAmount;
    }
    const packageMetadata = normalizePackageMeta(meta);
    if (packageMetadata) {
      depositPayload.packageMetadata = packageMetadata;
    }

    const result = await deposit(userId, depositPayload);
    paymentLog('completeDepositFromSelfcrypto: wallet credited', { userId, transactionId });
    return result;
  } catch (err) {
    paymentErrorLog('completeDepositFromSelfcrypto: deposit failed (completion kept)', transactionId, err.message);
    throw err;
  }
}

module.exports = { completeDepositFromSelfcrypto };
