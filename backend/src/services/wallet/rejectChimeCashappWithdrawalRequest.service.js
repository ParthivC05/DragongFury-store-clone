const db = require('../../db/models');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { canAccessRequest } = require('./approveChimeCashappWithdrawalRequest.service');
const {
  reservedFrozenByOtherWithdrawals,
  releaseThisWithdrawalFreeze
} = require('./withdrawalFreeze.service');

/**
 * Reject pending Chime/Cash App withdrawal — releases frozen RSC for this request only.
 */
async function rejectChimeCashappWithdrawalRequest(requestId, adminUserId, req, rejectionReason) {
  const row = await db.ChimeCashappWithdrawalRequest.findByPk(requestId);
  if (!row) {
    const err = new Error('Request not found.');
    err.statusCode = 404;
    throw err;
  }
  if (row.status !== 'pending') {
    const err = new Error('Only pending requests can be rejected.');
    err.statusCode = 400;
    throw err;
  }
  if (!canAccessRequest(req, row)) {
    const err = new Error('You are not allowed to reject this request.');
    err.statusCode = 403;
    throw err;
  }

  const amount = Number(row.amount) || 0;
  const displayCurrencyCode = await getCurrencySetting().catch(() => 'SC');
  const reason = (rejectionReason ?? '').toString().trim().slice(0, 2000) || null;
  const userId = row.userId;

  await db.sequelize.transaction(async (t) => {
    const locked = await db.ChimeCashappWithdrawalRequest.findByPk(requestId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!locked || locked.status !== 'pending') {
      const err = new Error('Only pending requests can be rejected.');
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
        excludeChimeId: locked.id,
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
          actionUrl: '/withdraw'
        },
        { transaction: t }
      );
    }
  });

  return {
    success: true,
    message: 'Request rejected. Frozen balance has been released for the player.',
    data: {
      id: row.id,
      status: 'rejected',
      amount,
      currency: row.currency
    }
  };
}

module.exports = { rejectChimeCashappWithdrawalRequest };
