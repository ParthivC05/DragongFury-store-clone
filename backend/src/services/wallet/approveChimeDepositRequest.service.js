const db = require('../../db/models');
const { getCurrencySetting } = require('./getCurrencySetting.service');
const { deposit } = require('./deposit.service');
const { canAccessRequest } = require('./approveChimeCashappWithdrawalRequest.service');
const { logger } = require('../../libs/logger');
const { resolvePackageDepositMeta, normalizePackageMeta } = require('../depositPackages/depositPackageMeta.service');
const { assertPackagePurchaseLimitForCompletion } = require('../depositPackages/packageEligibility.service');

/**
 * Approve manual Chime deposit: credit Standard SC via deposit service.
 */
async function approveChimeDepositRequest(requestId, adminUserId, req) {
  const row = await db.ChimeDepositRequest.findByPk(requestId, {
    include: [{ model: db.User, as: 'User', attributes: ['userId', 'username', 'email', 'firstName', 'lastName'], required: false }]
  });
  if (!row) {
    const err = new Error('Request not found.');
    err.statusCode = 404;
    throw err;
  }
  if (row.status !== 'pending') {
    const err = new Error('Only pending requests can be approved.');
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
  const creditSc = row.creditSc != null ? Number(row.creditSc) : null;
  const walletCredit = creditSc != null && Number.isFinite(creditSc) && creditSc > 0 ? creditSc : amount;
  const displayCurrencyCode = await getCurrencySetting();
  const methodLabel = row.depositType === 'chime' ? 'chime' : 'cashapp';

  if (row.packageId) {
    await assertPackagePurchaseLimitForCompletion(userId, row.packageId, {
      excludeChimeRequestId: row.id
    });
  }

  await row.update({ status: 'processing' });
  try {
    let packageMetadata = null;
    if (row.packageId) {
      packageMetadata = await resolvePackageDepositMeta(row.packageId, {
        payAmount: amount,
        creditAmount: walletCredit
      });
      // Still mark as package deposit if catalog row was removed, so wallet min/max are skipped.
      if (!packageMetadata) {
        packageMetadata = {
          packageId: Number(row.packageId),
          payAmount: amount,
          creditAmount: walletCredit
        };
      }
      // Preserve daily-bonus voucher discount details saved at request create time.
      const voucherMeta = normalizePackageMeta({
        ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
        packageId: row.packageId,
        payAmount: amount,
        creditAmount: walletCredit
      });
      if (voucherMeta) {
        packageMetadata = {
          ...packageMetadata,
          ...voucherMeta,
          payAmount: amount,
          creditAmount: walletCredit
        };
      }
    } else if (row.metadata && typeof row.metadata === 'object') {
      // Custom amount + email campaign pay discount
      packageMetadata = {
        creditAmount: walletCredit,
        ...row.metadata
      };
    }
    await deposit(userId, {
      amount,
      creditAmount: walletCredit,
      method: methodLabel,
      provider: 'manual-chime-deposit',
      providerTransactionId: `cdr-${row.id}-${Date.now()}`,
      excludeChimeRequestId: row.id,
      ...(packageMetadata ? { packageMetadata } : {})
    });
    await row.update({
      status: 'completed',
      approvedByUserId: adminUserId,
      approvedAt: new Date()
    });
  } catch (err) {
    await row.update({ status: 'pending' });
    throw err;
  }

  if (db.Notification) {
    const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
    const label = row.depositType === 'chime' ? 'Chime' : 'Cash App';
    await db.Notification.create({
      userId,
      type: 'deposit',
      title: 'Deposit approved',
      message: `Your ${label} deposit of ${displayCurrencyCode} ${amountStr} has been credited to your wallet.`,
      actionUrl: '/deposit'
    });
  }

  logger.info('[approveChimeDepositRequest] approved', { requestId, userId, amount });

  return {
    success: true,
    message: 'Deposit approved. Player wallet has been credited.',
    data: {
      id: row.id,
      status: 'completed',
      amount,
      currency: row.currency || displayCurrencyCode,
      approvedAt: row.approvedAt
    }
  };
}

module.exports = { approveChimeDepositRequest };
