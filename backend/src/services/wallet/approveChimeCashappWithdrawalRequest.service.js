'use strict';

const db = require('../../db/models');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { ROLES } = require('../../constants/roles');
const { logger, paymentLog, paymentErrorLog } = require('../../libs/logger');
const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
const dollarpay = require('../paymentProviders/dollarpay/dollarpay.client');
const { payoutLabel } = require('./settleDollarpayWithdrawal.service');
const { zeroRemainingWalletsAfterNeverDepositedWithdraw } = require('./neverDepositedWithdraw.service');
const { redeemableForFrozenWithdrawal } = require('./walletBuckets.service');
const {
  reservedFrozenByOtherWithdrawals,
  thisRequestFrozenSlice,
  captureThisWithdrawalFreeze
} = require('./withdrawalFreeze.service');

function canAccessRequest(req, row) {
  if (req.role === ROLES.MASTER_ADMIN) return true;
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    return row.distributorCode && row.distributorCode === req.distributorCode;
  }
  if (req.role === ROLES.STORE_ADMIN) {
    return row.storeCode && row.storeCode === req.storeCode;
  }
  return false;
}

/** Fresh merchant order no per approve attempt (pending retries must not reuse a failed id). */
function buildXxpayPayoutOrderSn(userId, requestId) {
  return `XXW${userId}R${requestId}T${Date.now()}`.slice(0, 100);
}

function buildDollarpayPayoutOrderSn(userId, requestId) {
  return `DPW${userId}R${requestId}T${Date.now()}`.slice(0, 64);
}

function formatXxpayPayoutCreateError(err) {
  const raw = String(err?.message || err?.raw?.msg || '').trim();
  if (raw.startsWith('Xpay') || raw.startsWith('XXPay')) return raw.replace(/^XXPay/, 'Xpay');
  return `Xpay: ${raw || 'Payout failed.'}`;
}

function isAutomatedPayoutProvider(provider) {
  const p = String(provider || '').toLowerCase();
  return p === 'dollarpay' || p === 'xxpay';
}

function normalizePaidFromTag(raw) {
  const tag = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!tag) return '';
  return tag.slice(0, 255);
}

function resolvePaidFromTag(row, options = {}) {
  if (isAutomatedPayoutProvider(row.paymentProvider)) return null;
  const payoutType = String(row.payoutType || '').toLowerCase();
  if (payoutType !== 'chime' && payoutType !== 'cashapp') return null;
  const paidFromTag = normalizePaidFromTag(options.paidFromTag ?? options.paid_from_tag);
  if (!paidFromTag) {
    const err = new Error('Enter the paying tag you are paying from.');
    err.statusCode = 400;
    throw err;
  }
  return paidFromTag;
}

/**
 * Approve Chime/Cash App/PayPal withdrawal.
 * Manual: deduct RSC + complete immediately.
 * DollarPay / XXPay: submit payout, keep RSC frozen as `processing` until webhook/query confirms.
 * Manual Chime / Cash App: requires paidFromTag so staff can track which $cashtag paid the player.
 */
async function approveChimeCashappWithdrawalRequest(requestId, adminUserId, req, options = {}) {
  const row = await db.ChimeCashappWithdrawalRequest.findByPk(requestId, {
    include: [{ model: db.User, as: 'User', attributes: ['userId', 'username', 'email', 'firstName', 'lastName'], required: false }]
  });
  if (!row) {
    const err = new Error('Request not found.');
    err.statusCode = 404;
    throw err;
  }
  if (row.status !== 'pending') {
    const err = new Error(
      row.status === 'processing'
        ? 'This payout was already sent to the provider and is waiting for confirmation.'
        : 'Only pending requests can be approved.'
    );
    err.statusCode = 400;
    throw err;
  }
  if (!canAccessRequest(req, row)) {
    const err = new Error('You are not allowed to approve this request.');
    err.statusCode = 403;
    throw err;
  }

  const userId = row.userId;
  const amount = Number(row.amount);
  const displayCurrencyCode = await getCurrencySetting();
  const currencyCode = REDEEMABLE_CURRENCY_CODE;
  const provider = String(row.paymentProvider || '').toLowerCase();
  const isDollarpay = provider === 'dollarpay';
  const isXxpay = provider === 'xxpay';
  const paidFromTag = resolvePaidFromTag(row, options);

  const wallet = await db.Wallet.findOne({ where: { userId, currencyCode } });
  if (!wallet) {
    const err = new Error('User wallet not found.');
    err.statusCode = 404;
    throw err;
  }

  const othersReservedForApprove = await reservedFrozenByOtherWithdrawals(userId, {
    excludeChimeId: requestId
  });
  const thisFrozen = thisRequestFrozenSlice(wallet, amount, othersReservedForApprove);
  if (amount > redeemableForFrozenWithdrawal(wallet) + 0.005) {
    const err = new Error('Insufficient redeemable balance for this user. Cannot approve.');
    err.statusCode = 400;
    throw err;
  }
  if (amount > thisFrozen + 0.005) {
    const err = new Error('Frozen balance does not match this request. Cannot approve.');
    err.statusCode = 400;
    throw err;
  }

  if (isXxpay) {
    const xxpay = require('../paymentProviders/xxpay/xxpay.client');
    const mchNo = row.dollarpayMerchantId;
    if (!mchNo || !row.dollarpayKeyEncrypted) {
      const err = new Error('Xpay credentials missing on this withdrawal request.');
      err.statusCode = 400;
      throw err;
    }
    let apiKey;
    try {
      apiKey = decryptPaymentPassword(row.dollarpayKeyEncrypted);
    } catch {
      const err = new Error('Xpay credentials could not be decrypted.');
      err.statusCode = 500;
      throw err;
    }
    if (!apiKey) {
      const err = new Error('Xpay credentials could not be read.');
      err.statusCode = 500;
      throw err;
    }
    const notifyBase = (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_BASE_URL || '')
      .toString()
      .replace(/\/+$/, '');
    if (!notifyBase) {
      const err = new Error(
        'BACKEND_PUBLIC_URL must be your public API URL. Example: https://api.yourdomain.com'
      );
      err.statusCode = 503;
      throw err;
    }

    // Always mint a new mchOrderNo while still pending. Reusing XXW{user}R{id} after a failed
    // create (e.g. insufficient balance) makes XXPay return "Merchant OrderNo Already Exists".
    const outerOrderSn = buildXxpayPayoutOrderSn(userId, requestId);
    await row.update({
      outerOrderSn,
      approvedByUserId: adminUserId,
      approvedAt: new Date()
    });

    let payoutData;
    try {
      payoutData = await xxpay.createTransfer({
        mchNo,
        apiKey,
        baseUrl: row.xxpayBaseUrl || null,
        mchOrderNo: outerOrderSn,
        amount,
        payoutType: row.payoutType,
        destinationUsername: row.destinationUsername,
        destinationMeta: row.destinationMeta,
        currency: 'usd',
        notifyUrl: `${notifyBase}/api/webhooks/xxpay`,
        reason: 'withdrawal'
      });
    } catch (err) {
      // Stay pending so admin can retry after topping up / fixing destination.
      logger.error('[approveChimeCashappWithdrawalRequest] XXPay payout create failed', {
        requestId,
        userId,
        payoutType: row.payoutType,
        paymentProvider: provider,
        destinationUsername: row.destinationUsername,
        message: err.message
      });
      paymentErrorLog('XXPay payout create failed', requestId, err.message);
      console.log('[XXPay] PAYOUT CREATE FAIL', {
        requestId,
        userId,
        outerOrderSn,
        payoutType: row.payoutType,
        paymentProvider: provider,
        destinationUsername: row.destinationUsername,
        message: err.message
      });
      const wrapped = new Error(formatXxpayPayoutCreateError(err));
      wrapped.statusCode = err.statusCode || 400;
      wrapped.raw = err.raw;
      throw wrapped;
    }

    const providerTransactionId = String(
      payoutData?.data?.transferOrderNo || payoutData?.transferOrderNo || outerOrderSn
    )
      .trim()
      .slice(0, 128);

    paymentLog('XXPay payout create success', {
      requestId,
      userId,
      amount,
      outerOrderSn,
      transferOrderNo: providerTransactionId,
      payoutType: row.payoutType
    });
    console.log('[XXPay] PAYOUT CREATE SUCCESS', {
      requestId,
      userId,
      amount,
      outerOrderSn,
      transferOrderNo: providerTransactionId,
      payoutType: row.payoutType
    });

    await row.update({
      status: 'processing',
      providerTransactionId,
      outerOrderSn
    });

    if (db.Notification) {
      const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
      await db.Notification.create({
        userId,
        type: 'withdrawal',
        title: 'Withdrawal processing',
        message: `Your ${payoutLabel(row.payoutType)} withdrawal of ${displayCurrencyCode} ${amountStr} was approved and is being paid.`,
        actionUrl: '/withdraw'
      }).catch(() => {});
    }

    await zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, { keepFrozenRsc: amount }).catch(() => {});

    logger.info('[approveChimeCashappWithdrawalRequest] XXPay processing', {
      requestId,
      userId,
      amount,
      outerOrderSn
    });

    return {
      success: true,
      message: 'Payout submitted to Xpay. Funds stay on hold until Xpay confirms payment.',
      data: {
        id: row.id,
        status: 'processing',
        amount,
        currency: row.currency || displayCurrencyCode,
        approvedAt: row.approvedAt,
        outerOrderSn,
        providerTransactionId
      }
    };
  }

  if (isDollarpay) {
    const merchantId = row.dollarpayMerchantId;
    if (!merchantId || !row.dollarpayKeyEncrypted) {
      const err = new Error('Dpay credentials missing on this withdrawal request.');
      err.statusCode = 400;
      throw err;
    }
    let apiKey;
    try {
      apiKey = decryptPaymentPassword(row.dollarpayKeyEncrypted);
    } catch {
      const err = new Error('Dpay credentials could not be decrypted.');
      err.statusCode = 500;
      throw err;
    }
    if (!apiKey) {
      const err = new Error('Dpay credentials could not be read.');
      err.statusCode = 500;
      throw err;
    }
    const notifyBase = (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_BASE_URL || '')
      .toString()
      .replace(/\/+$/, '');
    if (!notifyBase || /dollarpaywallet\.com/i.test(notifyBase)) {
      const err = new Error(
        'BACKEND_PUBLIC_URL must be your public API URL (not Dpay). Example: https://api.yourdomain.com'
      );
      err.statusCode = 503;
      throw err;
    }

    // New order sn per pending retry (same pattern as XXPay — avoid "already exists" after failed create).
    const outerOrderSn = buildDollarpayPayoutOrderSn(userId, requestId);
    // Persist order sn before provider call so webhook/query can match if process crashes mid-flight.
    await row.update({
      outerOrderSn,
      approvedByUserId: adminUserId,
      approvedAt: new Date()
    });

    let payoutData;
    try {
      payoutData = await dollarpay.createPayout({
        merchantId,
        apiKey,
        orderSn: outerOrderSn,
        amount,
        payoutType: row.payoutType,
        accountNo: row.destinationUsername,
        notifyUrl: `${notifyBase}/api/webhooks/dollarpay`
      });
    } catch (err) {
      // Keep pending so admin can retry; funds stay frozen.
      // Surface raw DollarPay message to admin (do not use player-facing sanitize).
      logger.error('[approveChimeCashappWithdrawalRequest] DollarPay payout create failed', {
        requestId,
        userId,
        payoutType: row.payoutType,
        paymentProvider: provider,
        message: err.rawMessage || err.message
      });
      console.log('[DollarPay] PAYOUT CREATE FAIL', {
        requestId,
        userId,
        outerOrderSn,
        payoutType: row.payoutType,
        paymentProvider: provider,
        message: err.rawMessage || err.message
      });
      const wrapped = new Error(
        `Dpay: ${err.rawMessage || err.message || 'Payout failed.'}`
      );
      wrapped.statusCode = err.statusCode || 400;
      wrapped.raw = err.raw;
      throw wrapped;
    }

    const providerTransactionId = String(
      payoutData?.transaction_id ||
        payoutData?.transactionId ||
        payoutData?.order_sn ||
        payoutData?.outer_order_sn ||
        outerOrderSn
    )
      .trim()
      .slice(0, 128);

    await row.update({
      status: 'processing',
      providerTransactionId,
      outerOrderSn
    });

    if (db.Notification) {
      const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
      await db.Notification.create({
        userId,
        type: 'withdrawal',
        title: 'Withdrawal processing',
        message: `Your ${payoutLabel(row.payoutType)} withdrawal of ${displayCurrencyCode} ${amountStr} was approved and is being paid.`,
        actionUrl: '/withdraw'
      }).catch(() => {});
    }

    logger.info('[approveChimeCashappWithdrawalRequest] DollarPay processing', { requestId, userId, amount, outerOrderSn });

    await zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, { keepFrozenRsc: amount }).catch(() => {});

    return {
      success: true,
      message: 'Payout submitted to Dpay. Funds stay on hold until Dpay confirms payment.',
      data: {
        id: row.id,
        status: 'processing',
        amount,
        currency: row.currency || displayCurrencyCode,
        approvedAt: row.approvedAt,
        outerOrderSn,
        providerTransactionId
      }
    };
  }

  // Manual (non-DollarPay): deduct immediately, but only this request's freeze.
  await db.sequelize.transaction(async (t) => {
    const lockedWallet = await db.Wallet.findOne({
      where: { userId, currencyCode },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!lockedWallet) {
      const err = new Error('User wallet not found.');
      err.statusCode = 404;
      throw err;
    }
    const othersReserved = await reservedFrozenByOtherWithdrawals(userId, {
      excludeChimeId: requestId,
      transaction: t
    });
    const captured = await captureThisWithdrawalFreeze(lockedWallet, {
      amount,
      othersReserved,
      transaction: t
    });
    if (captured.debit > 0.005) {
      const { recordWalletChange } = require('./scLedger.service');
      await lockedWallet.reload({ transaction: t });
      await recordWalletChange({
        userId,
        currencyCode,
        direction: 'DEBIT',
        amount: captured.debit,
        wallet: lockedWallet,
        ledger: {
          eventType: 'WITHDRAWAL',
          sourceType: 'CHIME_WITHDRAWAL',
          sourceId: requestId,
          paymentId: requestId,
          createdBy: adminUserId,
          remarks: `${payoutLabel(row.payoutType)} withdrawal approved`
        },
        transaction: t
      });
    }
    await row.update(
      {
        status: 'completed',
        approvedByUserId: adminUserId,
        approvedAt: new Date(),
        ...(paidFromTag ? { paidFromTag } : {})
      },
      { transaction: t }
    );
    if (db.UserTransaction && captured.debit > 0.005) {
      await db.UserTransaction.create(
        {
          userId,
          type: 'withdraw',
          amount: captured.debit,
          currencyCode,
          description: `${payoutLabel(row.payoutType)} withdrawal approved (request #${requestId})`
        },
        { transaction: t }
      );
    }
    if (db.Notification) {
      const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
      await db.Notification.create(
        {
          userId,
          type: 'withdrawal',
          title: 'Withdrawal approved',
          message: `Your ${payoutLabel(row.payoutType)} withdrawal of ${displayCurrencyCode} ${amountStr} has been approved.`,
          actionUrl: '/withdraw'
        },
        { transaction: t }
      );
    }
    await zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, { transaction: t });
  });

  logger.info('[approveChimeCashappWithdrawalRequest] approved (manual)', {
    requestId,
    userId,
    amount,
    paidFromTag: paidFromTag || null
  });

  return {
    success: true,
    message: 'Withdrawal approved. Funds have been deducted from the player wallet.',
    data: {
      id: row.id,
      status: 'completed',
      amount,
      currency: row.currency || displayCurrencyCode,
      approvedAt: row.approvedAt,
      paidFromTag: paidFromTag || null
    }
  };
}

module.exports = { approveChimeCashappWithdrawalRequest, canAccessRequest };
