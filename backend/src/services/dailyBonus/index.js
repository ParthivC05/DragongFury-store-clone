'use strict';

const dailyBonusSettings = require('./dailyBonusSettings.service');
const { getDailyBonusStatus } = require('./getDailyBonusStatus.service');
const { claimDailyBonus } = require('./claimDailyBonus.service');
const { performDailyBonusSpin } = require('./performDailyBonusSpin.service');
const {
  applyDailyBonusVoucher,
  listAvailableVouchersForUser,
  expireStaleDailyBonusVouchers
} = require('./applyDailyBonusVoucher.service');
const { expireDailyBonusVouchers } = require('./expireDailyBonusVouchers.service');

module.exports = {
  dailyBonusSettings,
  getDailyBonusStatus,
  claimDailyBonus,
  performDailyBonusSpin,
  applyDailyBonusVoucher,
  listAvailableVouchersForUser,
  expireStaleDailyBonusVouchers,
  expireDailyBonusVouchers
};
