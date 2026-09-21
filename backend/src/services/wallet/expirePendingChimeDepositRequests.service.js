'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { createLogger } = require('../../libs/logger');
const { getCurrencySetting } = require('./getCurrencySetting.service');

const logger = createLogger('expirePendingChimeDepositRequests');

/** Pending Chime/Cash App manual deposit requests older than this are auto-rejected. */
const EXPIRY_MINUTES = 180; // 3 hours
const EXPIRY_MS = EXPIRY_MINUTES * 60 * 1000;

/** Max requests to process per run. */
const BATCH_SIZE = 500;

const AUTO_REJECT_REASON = `Auto-rejected: no store response within ${EXPIRY_MINUTES} minutes.`;

/**
 * Find pending Chime deposit requests older than EXPIRY (3 hours) and mark them rejected.
 * Chime deposits are external transfers (the user was never credited and no funds were
 * reserved), so there is no wallet change — we only flip the status and notify the user.
 * @returns {Promise<{ expired: number, errors: string[] }>}
 */
async function expirePendingChimeDepositRequests() {
  const cutoff = new Date(Date.now() - EXPIRY_MS);
  const displayCurrencyCode = await getCurrencySetting().catch(() => 'SC');
  const requests = await db.ChimeDepositRequest.findAll({
    where: {
      status: 'pending',
      created_at: { [Op.lt]: cutoff }
    },
    order: [['id', 'ASC']],
    limit: BATCH_SIZE
  });

  const result = { expired: 0, errors: [] };

  for (const req of requests) {
    const amount = Number(req.amount) || 0;
    try {
      await req.update({
        status: 'rejected',
        rejectionReason: AUTO_REJECT_REASON
      });

      if (db.Notification) {
        const amountStr = Number(amount) === amount && amount % 1 === 0 ? `${amount}` : Number(amount).toFixed(2);
        await db.Notification.create({
          userId: req.userId,
          type: 'deposit',
          title: 'Deposit request rejected',
          message: `Your Chime deposit request of ${displayCurrencyCode} ${amountStr} was automatically rejected because it was not confirmed in time. If you already sent the payment, please contact support.`,
          actionUrl: '/deposit'
        }).catch((err) => logger.warn({ err, requestId: req.id }, 'Failed to create auto-reject notification'));
      }

      result.expired += 1;
      logger.info({ requestId: req.id, userId: req.userId, amount }, 'Auto-rejected pending Chime deposit request');
    } catch (err) {
      result.errors.push(`Request ${req.id}: ${err.message}`);
      logger.error({ err, requestId: req.id }, 'Failed to auto-reject pending Chime deposit request');
    }
  }

  return result;
}

module.exports = {
  expirePendingChimeDepositRequests,
  EXPIRY_MINUTES,
  BATCH_SIZE
};
