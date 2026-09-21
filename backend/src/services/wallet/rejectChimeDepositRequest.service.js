const db = require('../../db/models');
const { getCurrencySetting } = require('./getCurrencySetting.service');
const { canAccessRequest } = require('./approveChimeCashappWithdrawalRequest.service');

/**
 * Reject pending Chime deposit — no wallet change (user had not been credited).
 */
async function rejectChimeDepositRequest(requestId, adminUserId, req, rejectionReason) {
  const row = await db.ChimeDepositRequest.findByPk(requestId);
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

  await row.update({
    status: 'rejected',
    rejectionReason: reason,
    approvedByUserId: adminUserId
  });

  if (db.Notification) {
    const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
    let message = `Your deposit request of ${displayCurrencyCode} ${amountStr} was rejected.`;
    if (reason) message += ` Reason: ${reason.slice(0, 300)}`;
    await db.Notification.create({
      userId,
      type: 'deposit',
      title: 'Deposit request rejected',
      message,
      actionUrl: '/deposit'
    });
  }

  return {
    success: true,
    message: 'Deposit request rejected.',
    data: {
      id: row.id,
      status: 'rejected',
      amount,
      currency: row.currency
    }
  };
}

module.exports = { rejectChimeDepositRequest };
