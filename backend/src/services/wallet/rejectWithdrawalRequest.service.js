const db = require('../../db/models');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const {
  reservedFrozenByOtherWithdrawals,
  releaseThisWithdrawalFreeze
} = require('./withdrawalFreeze.service');

/**
 * Reject a pending withdrawal request. Releases frozen amount back to available; no balance change.
 * Only admin (or partner) may call.
 */
async function rejectWithdrawalRequest(requestId, adminUserId, isAdmin, rejectionReason) {
  if (!isAdmin) {
    const err = new Error('Only an admin or partner can reject withdrawal requests.');
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
    const err = new Error('Only pending withdrawal requests can be rejected.');
    err.statusCode = 400;
    throw err;
  }

  const amount = Number(request.amount) || 0;
  const displayCurrencyCode = await getCurrencySetting().catch(() => 'SC');
  const reason = (rejectionReason ?? '').toString().trim().slice(0, 2000) || null;
  const userId = request.userId;
  await db.sequelize.transaction(async (t) => {
    const locked = await db.WithdrawalRequest.findByPk(requestId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!locked || locked.status !== 'pending') {
      const err = new Error('Only pending withdrawal requests can be rejected.');
      err.statusCode = 400;
      throw err;
    }
    await locked.update(
      { status: 'rejected', rejectionReason: reason, approvedByUserId: adminUserId },
      { transaction: t }
    );
    const wallet = await db.Wallet.findOne({
      where: { userId, currencyCode: REDEEMABLE_CURRENCY_CODE },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (wallet && amount > 0) {
      const othersReserved = await reservedFrozenByOtherWithdrawals(userId, {
        excludeLegacyId: locked.id,
        transaction: t
      });
      await releaseThisWithdrawalFreeze(wallet, {
        amount,
        othersReserved,
        transaction: t
      });
    }
    if (db.Notification) {
      const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
      let message = `Your withdrawal request of ${displayCurrencyCode} ${amountStr} was rejected.`;
      if (reason) message += ` Reason: ${reason.slice(0, 300)}`;
      await db.Notification.create(
        {
          userId,
          type: 'withdrawal',
          title: 'Withdrawal rejected',
          message,
          actionUrl: '/wallet'
        },
        { transaction: t }
      );
    }
  });

  return {
    success: true,
    message: 'Withdrawal request rejected.',
    data: {
      id: request.id,
      status: 'rejected',
      amount: Number(request.amount),
      currency: request.currency,
      rejectionReason: reason,
      createdAt: request.created_at
    }
  };
}

module.exports = { rejectWithdrawalRequest };
