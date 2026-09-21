'use strict';

const { createLogger } = require('../../libs/logger');
const { expireStaleDailyBonusVouchers } = require('./applyDailyBonusVoucher.service');

const log = createLogger('expireDailyBonusVouchers');

/**
 * Mark unused daily-bonus vouchers older than 24h as expired.
 */
async function expireDailyBonusVouchers() {
  const expired = await expireStaleDailyBonusVouchers();
  if (expired > 0) {
    log.info({ expired }, 'Expired daily bonus vouchers past 24h TTL');
  }
  return { expired };
}

module.exports = { expireDailyBonusVouchers };
