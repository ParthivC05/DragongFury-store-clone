'use strict';

const db = require('../../db/models');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { logger } = require('../../libs/logger');
const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
const dollarpay = require('../paymentProviders/dollarpay/dollarpay.client');
const { zeroRemainingWalletsAfterNeverDepositedWithdraw } = require('./neverDepositedWithdraw.service');
const {
  reservedFrozenByOtherWithdrawals,
  captureThisWithdrawalFreeze,
  releaseThisWithdrawalFreeze
} = require('./withdrawalFreeze.service');

function payoutLabel(payoutType) {
  if (payoutType === 'chime') return 'Chime';
  if (payoutType === 'paypal') return 'PayPal';
  if (payoutType === 'venmo') return 'Venmo';
  if (payoutType === 'zelle') return 'Zelle';
  if (payoutType === 'card') return 'Card';
  if (payoutType === 'bank_transfer') return 'ACH';
  return 'Cash App';
}

/**
 * Finalize a DollarPay withdrawal after provider confirms pay_status=1:
 * deduct RSC, release freeze, mark completed.
 */
async function finalizeDollarpayWithdrawalSuccess(row, { transactionId, adminUserId } = {}) {
  if (!row || String(row.status) === 'completed') {
    return { alreadyProcessed: true };
  }
  if (String(row.status) !== 'processing') {
    return { skipped: true };
  }

  const userId = row.userId;
  const amount = Number(row.amount);
  const currencyCode = REDEEMABLE_CURRENCY_CODE;
  const displayCurrencyCode = await getCurrencySetting();

  await db.sequelize.transaction(async (t) => {
    const locked = await db.ChimeCashappWithdrawalRequest.findByPk(row.id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!locked || locked.status !== 'processing') {
      return;
    }

    const wallet = await db.Wallet.findOne({
      where: { userId, currencyCode },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!wallet) {
      const err = new Error('User wallet not found.');
      err.statusCode = 404;
      throw err;
    }

    const othersReserved = await reservedFrozenByOtherWithdrawals(userId, {
      excludeChimeId: locked.id,
      transaction: t
    });
    const captured = await captureThisWithdrawalFreeze(wallet, {
      amount,
      othersReserved,
      transaction: t
    });

    if (captured.debit > 0.005) {
      const { recordWalletChange } = require('./scLedger.service');
      await wallet.reload({ transaction: t });
      await recordWalletChange({
        userId,
        currencyCode,
        direction: 'DEBIT',
        amount: captured.debit,
        wallet,
        ledger: {
          eventType: 'WITHDRAWAL',
          sourceType: 'WITHDRAWAL',
          sourceId: locked.id,
          paymentId: locked.id,
          remarks: `${payoutLabel(locked.payoutType)} withdrawal`
        },
        transaction: t
      });
    }

    const updates = {
      status: 'completed',
      approvedAt: locked.approvedAt || new Date()
    };
    if (adminUserId && !locked.approvedByUserId) updates.approvedByUserId = adminUserId;
    if (transactionId) updates.providerTransactionId = String(transactionId).slice(0, 128);
    await locked.update(updates, { transaction: t });

    if (db.UserTransaction && captured.debit > 0.005) {
      await db.UserTransaction.create(
        {
          userId,
          type: 'withdraw',
          amount: captured.debit,
          currencyCode,
          description: `${payoutLabel(locked.payoutType)} withdrawal completed (request #${locked.id})`
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
          title: 'Withdrawal completed',
          message: `Your ${payoutLabel(locked.payoutType)} withdrawal of ${displayCurrencyCode} ${amountStr} has been paid.`,
          actionUrl: '/withdraw'
        },
        { transaction: t }
      );
    }

    await zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, { transaction: t });

    Object.assign(row, locked.get({ plain: true }));
  });

  logger.info('[finalizeDollarpayWithdrawalSuccess]', { requestId: row.id, userId, amount });
  return { success: true };
}

/**
 * DollarPay payout failed after approve: release freeze, mark failed (RSC stays with user).
 */
async function finalizeDollarpayWithdrawalFailure(row, { reason } = {}) {
  if (!row || String(row.status) === 'failed' || String(row.status) === 'rejected' || String(row.status) === 'completed') {
    return { alreadyProcessed: true };
  }
  if (String(row.status) !== 'processing') {
    return { skipped: true };
  }

  const amount = Number(row.amount) || 0;
  const currencyCode = REDEEMABLE_CURRENCY_CODE;
  const displayCurrencyCode = await getCurrencySetting().catch(() => 'SC');

  await db.sequelize.transaction(async (t) => {
    const locked = await db.ChimeCashappWithdrawalRequest.findByPk(row.id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!locked || locked.status !== 'processing') {
      return;
    }

    const wallet = await db.Wallet.findOne({
      where: { userId: locked.userId, currencyCode },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (wallet && amount > 0) {
      const othersReserved = await reservedFrozenByOtherWithdrawals(locked.userId, {
        excludeChimeId: locked.id,
        transaction: t
      });
      await releaseThisWithdrawalFreeze(wallet, {
        amount,
        othersReserved,
        transaction: t
      });
    }

    await locked.update(
      {
        status: 'failed',
        rejectionReason: (reason || 'DollarPay payout failed').toString().slice(0, 2000)
      },
      { transaction: t }
    );

    if (db.Notification) {
      const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
      await db.Notification.create(
        {
          userId: locked.userId,
          type: 'withdrawal',
          title: 'Withdrawal failed',
          message: `Your ${payoutLabel(locked.payoutType)} withdrawal of ${displayCurrencyCode} ${amountStr} could not be paid. Funds were released back to your wallet.`,
          actionUrl: '/withdraw'
        },
        { transaction: t }
      );
    }
  });

  logger.info('[finalizeDollarpayWithdrawalFailure]', { requestId: row.id, reason });
  return { success: true };
}

/**
 * Query DollarPay for a processing withdrawal and settle if terminal.
 */
async function syncDollarpayWithdrawalStatus(row) {
  if (!row || String(row.paymentProvider || '').toLowerCase() !== 'dollarpay') return null;
  if (String(row.status) !== 'processing') return null;
  if (!row.outerOrderSn || !row.dollarpayMerchantId || !row.dollarpayKeyEncrypted) return null;

  let apiKey;
  try {
    apiKey = decryptPaymentPassword(row.dollarpayKeyEncrypted);
  } catch {
    return null;
  }
  if (!apiKey) return null;

  const data = await dollarpay.queryPayout({
    merchantId: row.dollarpayMerchantId,
    apiKey,
    outerOrderSn: row.outerOrderSn
  });
  const payStatus = String(data?.pay_status ?? '').trim();
  const transactionId = String(data?.transaction_id || row.providerTransactionId || row.outerOrderSn).trim();

  if (payStatus === '1') {
    return finalizeDollarpayWithdrawalSuccess(row, { transactionId });
  }
  if (payStatus === '4' || payStatus === '5') {
    return finalizeDollarpayWithdrawalFailure(row, {
      reason: data?.msg || data?.message || `DollarPay payout failed (status ${payStatus})`
    });
  }
  return { pending: true, payStatus };
}

module.exports = {
  finalizeDollarpayWithdrawalSuccess,
  finalizeDollarpayWithdrawalFailure,
  syncDollarpayWithdrawalStatus,
  payoutLabel
};
