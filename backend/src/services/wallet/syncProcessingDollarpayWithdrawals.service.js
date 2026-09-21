'use strict';

const db = require('../../db/models');
const { syncDollarpayWithdrawalStatus } = require('./settleDollarpayWithdrawal.service');
const { logger } = require('../../libs/logger');

/**
 * Poll DollarPay payout query for all in-flight withdrawals and settle terminal statuses.
 * Safe to run on an interval; skips rows that are not DollarPay / processing.
 */
async function syncProcessingDollarpayWithdrawals() {
  const rows = await db.ChimeCashappWithdrawalRequest.findAll({
    where: {
      status: 'processing',
      paymentProvider: 'dollarpay'
    },
    order: [['id', 'ASC']],
    limit: 100
  });

  let checked = 0;
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let errors = 0;

  for (const row of rows) {
    checked += 1;
    try {
      const result = await syncDollarpayWithdrawalStatus(row);
      await row.reload().catch(() => {});
      const status = String(row.status);
      if (status === 'completed') completed += 1;
      else if (status === 'failed') failed += 1;
      else if (result?.pending || status === 'processing') pending += 1;
    } catch (err) {
      errors += 1;
      logger.warn(
        { err: err.message, requestId: row.id, outerOrderSn: row.outerOrderSn },
        'DollarPay withdrawal sync failed'
      );
    }
  }

  return { checked, completed, failed, pending, errors };
}

module.exports = { syncProcessingDollarpayWithdrawals };
