'use strict';

const db = require('../../db/models');
const { getCurrencySetting } = require('../wallet/getCurrencySetting.service');
const { logger } = require('../../libs/logger');

/**
 * Update local Speed withdraw-request record from webhook (paid / deactivated).
 * Does not deduct balance; callers can add that when platform amount is known.
 * @param {{ providerReference: string, status: string }} params - Speed id and new status
 * @returns {Promise<{ updated: boolean, row?: object }>}
 */
async function updateSpeedWithdrawFromWebhook(params) {
  const ref = (params?.providerReference ?? params?.id ?? '').toString().trim();
  const status = (params?.status ?? '').toString().toLowerCase();

  if (!ref || !['paid', 'deactivated'].includes(status)) {
    return { updated: false };
  }

  const row = await db.SpeedWithdrawRequest.findOne({
    where: { providerReference: ref, provider: 'scrypto' }
  });

  if (!row) {
    logger.info('[updateSpeedWithdrawFromWebhook] No local record', { providerReference: ref });
    return { updated: false };
  }

  const now = new Date();
  const updates = { status, updatedAt: now };

  if (status === 'paid') {
    updates.claimedAt = now;
    updates.completedAt = now;
  } else if (status === 'deactivated') {
    updates.deactivatedAt = now;
  }

  await row.update(updates);

  logger.info('[updateSpeedWithdrawFromWebhook] Updated', {
    withdrawId: row.id,
    providerReference: ref,
    status,
    userId: row.userId
  });

  return { updated: true, row };
}

module.exports = { updateSpeedWithdrawFromWebhook };
