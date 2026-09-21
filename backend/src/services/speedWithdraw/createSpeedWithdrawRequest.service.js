'use strict';

const db = require('../../db/models');
const paymentProviders = require('../paymentProviders');
const { logger } = require('../../libs/logger');
const {
  assertDailyWithdrawalLimit,
  assertDailyWithdrawalLimitUnderWalletLock
} = require('../wallet/assertDailyWithdrawalLimit.service');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');

const TTL_SECONDS = 600;

/**
 * Normalize Speed withdraw-request response for our API.
 * @param {object} speedResponse - Raw Speed API response
 * @returns {object} Normalized fields
 */
function mapSpeedWithdrawResponse(speedResponse) {
  if (!speedResponse) return {};
  const expiresAt = speedResponse.expires_at != null
    ? (typeof speedResponse.expires_at === 'number' && speedResponse.expires_at > 1e12
        ? new Date(speedResponse.expires_at)
        : speedResponse.expires_at)
    : null;
  return {
    providerReference: speedResponse.id != null ? String(speedResponse.id) : null,
    status: (speedResponse.status || 'active').toLowerCase(),
    withdrawRequest: speedResponse.withdraw_request ?? null,
    expiresAt,
    ttl: speedResponse.ttl != null ? parseInt(speedResponse.ttl, 10) : null,
    targetCurrency: speedResponse.target_currency || speedResponse.targetCurrency || null,
    exchangeRate: speedResponse.exchange_rate != null ? Number(speedResponse.exchange_rate) : (speedResponse.exchangeRate != null ? Number(speedResponse.exchangeRate) : null),
    targetMinAmount: speedResponse.target_min_amount != null ? Number(speedResponse.target_min_amount) : null,
    targetMaxAmount: speedResponse.target_max_amount != null ? Number(speedResponse.target_max_amount) : null,
    type: speedResponse.type || 'lnurl',
    amount: speedResponse.min_amount != null ? Number(speedResponse.min_amount) : (speedResponse.amount != null ? Number(speedResponse.amount) : null),
    currency: speedResponse.currency || null
  };
}

/**
 * Create Speed withdraw-request (LNURL flow), store locally, return normalized data.
 * Daily limit is enforced under wallet lock before provider call and again before local insert.
 *
 * @param {{ userId: number, amount: number, currency: string }} params
 */
async function createSpeedWithdrawRequest(params) {
  const userId = params?.userId != null ? parseInt(params.userId, 10) : NaN;
  const amount = params?.amount != null ? Number(params.amount) : NaN;
  const currency = (params?.currency && typeof params.currency === 'string')
    ? params.currency.trim().toUpperCase().slice(0, 16)
    : '';

  if (!Number.isInteger(userId) || userId < 1) {
    const err = new Error('User ID is required');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Amount is required and must be a positive number');
    err.statusCode = 400;
    throw err;
  }
  if (!currency) {
    const err = new Error('Currency is required');
    err.statusCode = 400;
    throw err;
  }

  const displayCurrency = await getCurrencySetting().catch(() => 'SC');
  const { getWalletLimitsForUser } = require('../wallet/getWalletLimits.service');
  const limits = await getWalletLimitsForUser(userId);
  if (limits?.neverDeposited && amount > Number(limits.withdrawMax)) {
    const { neverDepositedWithdrawMaxError } = require('../wallet/neverDepositedWithdraw.service');
    throw neverDepositedWithdrawMaxError();
  }
  if (Number.isFinite(Number(limits?.withdrawMax)) && amount > Number(limits.withdrawMax)) {
    const err = new Error(`Maximum withdrawal per request is ${displayCurrency} ${limits.withdrawMax}.00`);
    err.statusCode = 400;
    throw err;
  }
  if (Number.isFinite(Number(limits?.withdrawMin)) && amount < Number(limits.withdrawMin)) {
    const err = new Error(`Minimum withdrawal is ${displayCurrency} ${limits.withdrawMin}.00`);
    err.statusCode = 400;
    throw err;
  }
  // Early serialized check — fails fast before calling provider
  await assertDailyWithdrawalLimitUnderWalletLock(userId, amount, { displayCurrency });

  const scryptoProvider = paymentProviders.getProvider('scrypto');
  if (!scryptoProvider || typeof scryptoProvider.createWithdrawRequest !== 'function') {
    const err = new Error('Crypto withdraw requests are not available');
    err.statusCode = 503;
    throw err;
  }

  const speedResult = await scryptoProvider.createWithdrawRequest({
    amount,
    currency,
    ttl: TTL_SECONDS
  });

  const mapped = mapSpeedWithdrawResponse(speedResult.rawResponse || speedResult);
  const expiresAt = mapped.expiresAt || (speedResult.expiresAt != null
    ? (typeof speedResult.expiresAt === 'number' && speedResult.expiresAt > 1e12 ? new Date(speedResult.expiresAt) : speedResult.expiresAt)
    : null);

  const now = new Date();
  // Re-check under lock then insert so concurrent Speed requests cannot both pass the cap
  let row;
  try {
    row = await db.sequelize.transaction(async (t) => {
      let wallet = await db.Wallet.findOne({
        where: { userId, currencyCode: REDEEMABLE_CURRENCY_CODE },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!wallet) {
        await db.Wallet.create(
          { userId, currencyCode: REDEEMABLE_CURRENCY_CODE, balance: 0, playBalance: 0, frozenBalance: 0 },
          { transaction: t }
        );
        wallet = await db.Wallet.findOne({
          where: { userId, currencyCode: REDEEMABLE_CURRENCY_CODE },
          transaction: t,
          lock: t.LOCK.UPDATE
        });
      }

      await assertDailyWithdrawalLimit(userId, amount, {
        displayCurrency,
        transaction: t
      });

      return db.SpeedWithdrawRequest.create({
        userId,
        provider: 'scrypto',
        providerReference: speedResult.id || mapped.providerReference,
        type: 'withdraw',
        amount: speedResult.minAmount ?? amount,
        currency: speedResult.currency ?? currency,
        targetCurrency: speedResult.targetCurrency ?? mapped.targetCurrency,
        exchangeRate: speedResult.exchangeRate ?? mapped.exchangeRate,
        status: (speedResult.status || 'active').toLowerCase(),
        withdrawRequest: speedResult.withdrawRequest || mapped.withdrawRequest,
        ttl: TTL_SECONDS,
        expiresAt,
        providerPayloadRaw: speedResult.rawResponse ? { ...speedResult.rawResponse } : null,
        createdAt: now,
        updatedAt: now
      }, { transaction: t });
    });
  } catch (insertErr) {
    logger.error('[createSpeedWithdrawRequest] Local insert failed after provider create — reconcile manually', {
      userId,
      amount,
      providerReference: speedResult.id || mapped.providerReference,
      code: insertErr.code,
      message: insertErr.message
    });
    throw insertErr;
  }

  logger.info('[createSpeedWithdrawRequest] Created', {
    withdrawId: row.id,
    userId,
    providerReference: row.providerReference,
    amount: row.amount,
    currency: row.currency
  });

  return {
    withdrawId: row.id,
    provider: 'scrypto',
    providerReference: row.providerReference,
    status: row.status,
    type: speedResult.type || 'lnurl',
    amount: Number(row.amount),
    currency: row.currency,
    targetCurrency: row.targetCurrency,
    exchangeRate: row.exchangeRate != null ? Number(row.exchangeRate) : null,
    withdrawRequest: row.withdrawRequest,
    expiresAt: row.expiresAt,
    ttl: row.ttl,
    createdAt: row.createdAt
  };
}

module.exports = { createSpeedWithdrawRequest, mapSpeedWithdrawResponse };
