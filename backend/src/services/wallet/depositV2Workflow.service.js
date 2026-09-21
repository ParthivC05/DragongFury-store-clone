'use strict';

const db = require('../../db/models');
const { getCurrencySetting } = require('./getCurrencySetting.service');
const { paymentErrorLog } = require('../../libs/logger');
const { applySignupBonusCodeOnDeposit } = require('../bonusCodes/applySignupBonusCodeOnDeposit.service');
const { applyReferralDepositReward } = require('../affiliate/applyReferralDepositReward.service');
const { redeemActivePayDiscount } = require('../payDiscount/applyActivePayDiscount.service');
const {
  normalizePackageMeta,
  formatPackageDepositDescription,
  packageMetaToTransactionMetadata
} = require('../depositPackages/depositPackageMeta.service');
const { assertPackagePurchaseLimitForCompletion } = require('../depositPackages/packageEligibility.service');

const PROVIDER = 'orionstarspay';
const SUCCESS_STATUSES = ['completed', 'complete', 'collection', 'success', 'successful', 'paid'];
const TERMINAL_ORDER_STATUSES = new Set(['SUCCESS', 'FAILED', 'EXPIRED']);

function normalizeStatus(status) {
  if (!status || typeof status !== 'string') return '';
  return status.toLowerCase().trim();
}

function isSuccessStatus(status) {
  const s = normalizeStatus(status);
  return SUCCESS_STATUSES.some((ok) => s === ok || s.includes(ok));
}

function extractLinkToken(tx) {
  return (
    tx?.paymentLink?.token
    || tx?.rawPayload?.payload?.paymentLink?.token
    || tx?.rawPayload?.paymentLink?.token
    || null
  );
}

function extractApplicationId(tx) {
  return (
    tx?.paymentLink?.applicationId
    || tx?.paymentLink?.id
    || tx?.applicationId
    || tx?.rawPayload?.payload?.paymentLink?.applicationId
    || tx?.rawPayload?.payload?.paymentLink?.id
    || tx?.rawPayload?.paymentLink?.applicationId
    || tx?.rawPayload?.paymentLink?.id
    || tx?.rawPayload?.payload?.applicationId
    || null
  );
}

function extractMethod(tx) {
  return tx?.method || tx?.rawPayload?.payload?.method || null;
}

async function ensureCompletedDepositRequest(order, providerTransactionId, tx, transaction) {
  const existing = await db.DepositRequest.findOne({
    where: {
      userId: order.userId,
      provider: PROVIDER,
      providerTransactionId
    },
    transaction
  });
  if (existing) return existing;

  const method = extractMethod(tx) || PROVIDER;
  return db.DepositRequest.create({
    userId: order.userId,
    amount: order.requestedAmount,
    method,
    status: 'completed',
    provider: PROVIDER,
    providerTransactionId
  }, { transaction });
}

async function applyBonusesForDepositRequest(order, depositReq, transaction) {
  if (!depositReq) return;
  const amount = Number(order.requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const orderMeta = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  if (orderMeta.packageId != null) return;

  const currencyCode = await getCurrencySetting();

  if (db.BonusCode && db.UserBonusCodeGrant) {
    await applySignupBonusCodeOnDeposit(
      order.userId,
      depositReq.id,
      amount,
      currencyCode,
      transaction
    );
  }

  // Legacy 1st/2nd/3rd deposit bonuses removed — welcome deposit packages replace them.
}

async function applyReferralForDepositRequest(userId, depositReq, transaction) {
  if (!depositReq) return;
  await applyReferralDepositReward(userId, depositReq, transaction);
}

async function upsertProviderEvent(userId, tx, providerTransactionId, transaction) {
  const amount = tx?.amount != null ? Number(tx.amount) : null;
  const payload = {
    provider: PROVIDER,
    providerTransactionId,
    userId,
    paymentLinkToken: extractLinkToken(tx),
    eventType: tx?.eventType || tx?.rawPayload?.eventType || null,
    providerStatus: tx?.status || null,
    amount: Number.isFinite(amount) ? amount : null,
    currency: tx?.currency || tx?.rawPayload?.payload?.currency || 'USD',
    method: extractMethod(tx),
    rawPayload: tx,
    seenAt: new Date()
  };
  const existing = await db.ProviderTransactionEvent.findOne({
    where: { providerTransactionId },
    transaction
  });
  if (existing) {
    await existing.update(payload, { transaction });
    return existing;
  }
  return db.ProviderTransactionEvent.create(payload, { transaction });
}

/**
 * Match this provider transaction to exactly one deposit order for this user.
 * Never fall back to "latest order" — that could tie the wrong payment to the wrong intent.
 */
async function resolveDepositOrder(userId, tx, transaction) {
  const token = extractLinkToken(tx);
  const applicationId = extractApplicationId(tx);
  if (token) {
    const byToken = await db.DepositOrder.findOne({
      where: { userId, provider: PROVIDER, paymentLinkToken: String(token) },
      order: [['created_at', 'DESC']],
      transaction
    });
    if (byToken) return byToken;
  }
  if (applicationId) {
    const byAppId = await db.DepositOrder.findOne({
      where: { userId, provider: PROVIDER, providerApplicationId: String(applicationId) },
      order: [['created_at', 'DESC']],
      transaction
    });
    if (byAppId) return byAppId;
  }
  return null;
}

async function creditWalletOnce(order, tx, providerTransactionId, transaction) {
  // Credit package SC when set; otherwise full user-requested deposit amount.
  const meta = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const creditFromPackage = meta.creditAmount != null ? Number(meta.creditAmount) : NaN;
  const amount = Number.isFinite(creditFromPackage) && creditFromPackage > 0
    ? creditFromPackage
    : Number(order.requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { credited: false, alreadyCredited: false };

  const packageId = meta.packageId != null ? parseInt(meta.packageId, 10) : NaN;
  if (Number.isInteger(packageId) && packageId > 0) {
    // Enforce max purchases at credit time (order is still non-SUCCESS, so it is not counted yet).
    await assertPackagePurchaseLimitForCompletion(order.userId, packageId);
  }

  const idempotencyKey = `deposit_success:${providerTransactionId}`;
  const existingLedger = await db.WalletLedger.findOne({
    where: { idempotencyKey },
    transaction
  });
  if (existingLedger) return { credited: false, alreadyCredited: true };

  const { PURCHASED_CURRENCY_CODE } = require('./getCurrencySetting.service');
  const displayCurrency = await getCurrencySetting();
  const currencyCode = PURCHASED_CURRENCY_CODE;
  const [wallet] = await db.Wallet.findOrCreate({
    where: { userId: order.userId, currencyCode },
    defaults: { userId: order.userId, currencyCode, balance: 0, playBalance: 0, frozenBalance: 0 },
    transaction
  });

  const lockedWallet = await db.Wallet.findByPk(wallet.id, { transaction, lock: transaction.LOCK.UPDATE });
  const beforeBalance = Number(lockedWallet.balance) || 0;
  const amountNum = Number(amount);
  await lockedWallet.increment({ balance: amountNum, playBalance: amountNum }, { transaction });
  const afterBalance = beforeBalance + amountNum;

  await db.WalletLedger.create({
    userId: order.userId,
    entryType: 'CREDIT',
    assetType: 'PSC',
    amount,
    balanceBefore: beforeBalance,
    balanceAfter: afterBalance,
    reason: 'DEPOSIT_SUCCESS',
    referenceType: 'DEPOSIT_ORDER',
    referenceId: String(order.id),
    idempotencyKey,
    metadata: {
      provider: PROVIDER,
      providerTransactionId,
      paymentLinkToken: extractLinkToken(tx),
      providerApplicationId: extractApplicationId(tx)
    }
  }, { transaction });

  if (db.UserTransaction) {
    const packageMeta = normalizePackageMeta(meta);
    const depositDescription = packageMeta
      ? formatPackageDepositDescription(packageMeta, displayCurrency)
      : `Deposit ${extractMethod(tx) || PROVIDER}`;
    const depositMetadata = {
      deposit_order_id: order.id,
      provider_transaction_id: providerTransactionId,
      ...(packageMeta ? packageMetaToTransactionMetadata(packageMeta) : {})
    };
    await db.UserTransaction.create({
      userId: order.userId,
      type: 'deposit',
      amount,
      currencyCode,
      description: depositDescription,
      metadata: depositMetadata
    }, { transaction });
  }

  return { credited: true, alreadyCredited: false };
}

async function processProviderTransaction(userId, tx, options = {}) {
  const providerTransactionId = String(tx?.transactionId || tx?.id || '').trim();
  if (!providerTransactionId) {
    return { processed: false, reason: 'missing_transaction_id' };
  }

  const providerStatus = tx?.status || null;
  let creditResult = { credited: false, alreadyCredited: false };
  let orderMatched = false;

  await db.sequelize.transaction(async (transaction) => {
    await upsertProviderEvent(userId, tx, providerTransactionId, transaction);
    const order = await resolveDepositOrder(userId, tx, transaction);
    if (!order) return;

    orderMatched = true;
    const nextAttemptCount = Number(order.syncAttemptCount || 0) + 1;
    const baseUpdate = {
      lastSyncedAt: new Date(),
      syncAttemptCount: nextAttemptCount,
      lastSyncError: null
    };

    if (!isSuccessStatus(providerStatus)) {
      const pendingStatus = TERMINAL_ORDER_STATUSES.has(order.status) ? order.status : 'PENDING';
      await order.update({
        ...baseUpdate,
        status: pendingStatus,
        providerTransactionId: order.providerTransactionId || providerTransactionId
      }, { transaction });
      return;
    }

    creditResult = await creditWalletOnce(order, tx, providerTransactionId, transaction);

    if (creditResult.credited || creditResult.alreadyCredited) {
      if (creditResult.credited) {
        const depositReq = await ensureCompletedDepositRequest(order, providerTransactionId, tx, transaction);
        await applyBonusesForDepositRequest(order, depositReq, transaction);
        await applyReferralForDepositRequest(order.userId, depositReq, transaction);
        const orderMeta = order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
        await redeemActivePayDiscount(order.userId, orderMeta, {
          depositRequestId: depositReq.id,
          transaction,
          currencyCode: 'USD'
        });
      }
      await order.update({
        ...baseUpdate,
        status: 'SUCCESS',
        providerTransactionId: providerTransactionId,
        completedAt: order.completedAt || new Date()
      }, { transaction });
    } else {
      await order.update({
        ...baseUpdate,
        status: TERMINAL_ORDER_STATUSES.has(order.status) ? order.status : 'PENDING',
        lastSyncError: 'Credit not applied (amount invalid or ledger state)',
        providerTransactionId: order.providerTransactionId || providerTransactionId
      }, { transaction });
    }
  });

  if (options.throwOnNonSuccess) {
    if (!isSuccessStatus(providerStatus)) {
      paymentErrorLog('depositV2: payment not confirmed for user', {
        userId,
        providerTransactionId,
        providerStatus: providerStatus || null
      });
      const err = new Error('Payment is not confirmed yet. Try again in a moment.');
      err.statusCode = 400;
      throw err;
    }
    if (isSuccessStatus(providerStatus) && !orderMatched) {
      paymentErrorLog('depositV2: success status but no matching deposit order', {
        userId,
        providerTransactionId
      });
      const err = new Error(
        'We could not verify this payment for your account. If you were charged, contact support.'
      );
      err.statusCode = 400;
      throw err;
    }
    if (isSuccessStatus(providerStatus) && orderMatched && !creditResult.credited && !creditResult.alreadyCredited) {
      paymentErrorLog('depositV2: success but wallet credit skipped', {
        userId,
        providerTransactionId
      });
      const err = new Error('Deposit could not be completed. Please contact support if funds were charged.');
      err.statusCode = 400;
      throw err;
    }
  }

  return {
    processed: true,
    success: isSuccessStatus(providerStatus),
    credited: creditResult.credited,
    alreadyProcessed: creditResult.alreadyCredited
  };
}

module.exports = {
  isSuccessStatus,
  extractLinkToken,
  extractApplicationId,
  processProviderTransaction
};
