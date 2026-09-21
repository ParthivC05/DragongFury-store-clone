const db = require('../../db/models');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { canAccessRequest } = require('./approveChimeCashappWithdrawalRequest.service');

/**
 * Reject pending Chime/Cash App withdrawal — releases frozen RSC.
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
  const wallet = await db.Wallet.findOne({
    where: { userId: row.userId, currencyCode: REDEEMABLE_CURRENCY_CODE }
  });

  const reason = (rejectionReason ?? '').toString().trim().slice(0, 2000) || null;
  const userId = row.userId;

  await db.sequelize.transaction(async (t) => {
    await row.update(
      { status: 'rejected', rejectionReason: reason, approvedByUserId: adminUserId },
      { transaction: t }
    );
    if (wallet && amount > 0) {
      const frozen = Number(wallet.frozenBalance) || 0;
      const newFrozen = Math.max(0, Math.round((frozen - amount) * 100) / 100);
      await wallet.update({ frozenBalance: newFrozen }, { transaction: t });
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
