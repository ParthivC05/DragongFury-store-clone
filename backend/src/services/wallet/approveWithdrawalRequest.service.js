const db = require('../../db/models');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { applyWithdrawalBonuses } = require('../promotions/applyWithdrawalBonuses.service');
const paymentProviders = require('../paymentProviders');
const { logger } = require('../../libs/logger');
const { zeroRemainingWalletsAfterNeverDepositedWithdraw } = require('./neverDepositedWithdraw.service');
const { rscAvailableToWithdraw } = require('./walletBuckets.service');
const {
  reservedFrozenByOtherWithdrawals,
  thisRequestFrozenSlice,
  captureThisWithdrawalFreeze
} = require('./withdrawalFreeze.service');

/**
 * Approve a pending withdrawal request: deduct balance and release freeze. (Used only for platform pending requests, if any.)
 * Only admin (or partner) may call. Caller must pass isAdmin (or isPartner) from their role.
 */
async function approveWithdrawalRequest(requestId, adminUserId, isAdmin) {
  if (!isAdmin) {
    const err = new Error('Only an admin or partner can approve withdrawal requests.');
    err.statusCode = 403;
    throw err;
  }

  const request = await db.WithdrawalRequest.findByPk(requestId);
  if (!request) {
    const err = new Error('Withdrawal request not found.');
    err.statusCode = 404;
    throw err;
  }
  if (request.status !== 'pending') {
    const err = new Error('Only pending withdrawal requests can be approved.');
    err.statusCode = 400;
    throw err;
  }

  const userId = request.userId;
  const amount = Number(request.amount);
  const displayCurrencyCode = await getCurrencySetting();
  const currencyCode = REDEEMABLE_CURRENCY_CODE;

  const wallet = await db.Wallet.findOne({
    where: { userId, currencyCode }
  });
  if (!wallet) {
    const err = new Error('User wallet not found.');
    err.statusCode = 404;
    throw err;
  }

  const availableToWithdraw = rscAvailableToWithdraw(wallet);
  if (amount > availableToWithdraw) {
    const err = new Error('Insufficient withdrawable balance for this user. Cannot approve.');
    err.statusCode = 400;
    throw err;
  }
  const othersReservedForApprove = await reservedFrozenByOtherWithdrawals(userId, {
    excludeLegacyId: requestId
  });
  if (amount > thisRequestFrozenSlice(wallet, amount, othersReservedForApprove) + 0.005) {
    const err = new Error('Frozen balance does not match this request. Cannot approve.');
    err.statusCode = 400;
    throw err;
  }

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
      excludeLegacyId: requestId,
      transaction: t
    });
    const captured = await captureThisWithdrawalFreeze(lockedWallet, {
      amount,
      othersReserved,
      transaction: t
    });
    await request.update(
      { status: 'completed', approvedByUserId: adminUserId },
      { transaction: t }
    );
    if (db.UserTransaction && captured.debit > 0.005) {
      await db.UserTransaction.create(
        {
          userId,
          type: 'withdraw',
          amount: captured.debit,
          currencyCode,
          description: `Withdrawal approved (request #${requestId})`
        },
        { transaction: t }
      );
    }
    if (db.Promotion && db.UserPromotionBonus) {
      await applyWithdrawalBonuses(userId, request.id, amount, currencyCode, t);
    }
    if (db.Notification) {
      const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
      await db.Notification.create(
        {
          userId,
          type: 'withdrawal',
          title: 'Withdrawal approved',
          message: `Your withdrawal request of ${displayCurrencyCode} ${amountStr} has been approved and processed.`,
          actionUrl: '/wallet'
        },
        { transaction: t }
      );
    }
    await zeroRemainingWalletsAfterNeverDepositedWithdraw(userId, { transaction: t });
  });

  const speedPayoutAddress = request.cryptoAddress || request.linkedAccountId;
  if (request.method === 'scrypto' && speedPayoutAddress) {
    const scryptoProvider = paymentProviders.getProvider('scrypto');
    if (scryptoProvider && typeof scryptoProvider.createWithdrawal === 'function') {
      try {
        await scryptoProvider.createWithdrawal({
          amount,
          currency: request.currency || 'USD',
          address: speedPayoutAddress
        });
        logger.info('[approveWithdrawalRequest] Crypto payout sent', { requestId, amount, userId });
      } catch (speedErr) {
        logger.error('[approveWithdrawalRequest] Crypto payout failed (balance already deducted)', {
          requestId,
          userId,
          message: speedErr.message
        });
      }
    }
  }

  return {
    success: true,
    message: 'Withdrawal request approved and processed.',
    data: {
      id: request.id,
      status: 'completed',
      amount,
      currency: request.currency || displayCurrencyCode,
      createdAt: request.created_at
    }
  };
}

module.exports = { approveWithdrawalRequest };
