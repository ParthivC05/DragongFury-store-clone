'use strict';

const {
  applyCampaignPayDiscountForUser,
  redeemCampaignPayDiscount,
  campaignDiscountMetadata
} = require('../emailCampaigns/applyCampaignPayDiscount.service');
const {
  applyPayDiscountForUser,
  spinWheelCouponMetadata,
  redeemSpinWheelCoupon
} = require('../spinWheel/spinWheelCoupon.service');

async function applyActivePayDiscountForUser(userId, basePay, options = {}) {
  const spin = await applyPayDiscountForUser(userId, basePay, options);
  if (spin.applied) return spin;
  return applyCampaignPayDiscountForUser(userId, basePay, options);
}

function payDiscountMetadata(applied) {
  if (!applied?.applied) return {};
  if (applied.source === 'spin_wheel') return spinWheelCouponMetadata(applied);
  return campaignDiscountMetadata(applied);
}

async function redeemActivePayDiscount(userId, meta, options = {}) {
  await redeemSpinWheelCoupon(userId, meta, options);
  await redeemCampaignPayDiscount(userId, meta, options);
}

module.exports = {
  applyActivePayDiscountForUser,
  payDiscountMetadata,
  redeemActivePayDiscount
};
