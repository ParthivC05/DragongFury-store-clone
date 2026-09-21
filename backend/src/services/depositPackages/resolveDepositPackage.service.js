'use strict';

const db = require('../../db/models');
const { isWithinWindow } = require('./getDepositPackagesCatalog.service');
const { normalizeScope } = require('./getDepositPackageSettings.service');
const { isWithinWelcomeWindow, assertPackagePurchaseLimit } = require('./packageEligibility.service');
const { applyDailyBonusVoucher } = require('../dailyBonus/applyDailyBonusVoucher.service');
const {
  applyActivePayDiscountForUser,
  payDiscountMetadata
} = require('../payDiscount/applyActivePayDiscount.service');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate a deposit package for checkout. Returns pay amount (final_price) and credit amount (final_sc).
 * Optional options.voucherId applies a daily-bonus percent-off voucher to payAmount.
 * Pass options.consumeVoucher=true to mark the voucher used at checkout start.
 */
async function resolveDepositPackageForUser(userId, packageId, options = {}) {
  const id = packageId != null ? parseInt(packageId, 10) : NaN;
  if (!Number.isInteger(id) || id < 1) {
    const err = new Error('Valid package is required.');
    err.statusCode = 400;
    throw err;
  }

  const user = await db.User.findByPk(userId, {
    attributes: ['userId', 'distributorCode', 'storeCode', 'createdAt'],
    raw: true
  });
  if (!user?.distributorCode || !user?.storeCode) {
    const err = new Error('Packages are not available for your account.');
    err.statusCode = 400;
    throw err;
  }

  const scope = normalizeScope({
    distributorCode: user.distributorCode,
    storeCode: user.storeCode
  });

  const settings = await require('./getDepositPackageSettings.service').getDepositPackageSettings(scope);
  if (!settings.enabled) {
    const err = new Error('Deposit packages are not enabled for your store.');
    err.statusCode = 400;
    throw err;
  }

  const pkg = await db.DepositPackage.findByPk(id, {
    include: [{ model: db.DepositPackageGroup, as: 'Group', required: true }]
  });
  if (!pkg || !pkg.Group) {
    const err = new Error('Package not found.');
    err.statusCode = 404;
    throw err;
  }

  if (
    String(pkg.distributorCode || '').toLowerCase() !== scope.distributorCode ||
    String(pkg.storeCode || '').toLowerCase() !== scope.storeCode
  ) {
    const err = new Error('Package not found.');
    err.statusCode = 404;
    throw err;
  }

  if (pkg.isActive === false || pkg.Group.isActive === false) {
    const err = new Error('This package is no longer available.');
    err.statusCode = 400;
    throw err;
  }

  const groupKey = pkg.Group.groupKey;

  if (groupKey === 'welcome') {
    if (!isWithinWelcomeWindow(user.createdAt)) {
      const err = new Error('Welcome packages are only available during your first 24 hours after signup.');
      err.statusCode = 400;
      throw err;
    }
  } else if (groupKey !== 'general' && !isWithinWindow(pkg.Group.startsAt, pkg.Group.endsAt)) {
    const err = new Error('This package offer has expired.');
    err.statusCode = 400;
    throw err;
  }

  if (groupKey !== 'welcome' && !isWithinWindow(pkg.startsAt, pkg.endsAt)) {
    const err = new Error('This package offer has expired.');
    err.statusCode = 400;
    throw err;
  }

  await assertPackagePurchaseLimit(userId, pkg);

  let payAmount = toNumber(pkg.finalPrice);
  const creditAmount = toNumber(pkg.finalSc);
  const creditGc = Math.max(0, toNumber(pkg.gcCoin) || 0);
  if (payAmount == null || payAmount <= 0 || creditAmount == null || creditAmount <= 0) {
    const err = new Error('Package pricing is invalid.');
    err.statusCode = 400;
    throw err;
  }

  const originalPayAmount = payAmount;
  let voucherMeta = null;
  const voucherId = options.voucherId ?? options.voucher_id ?? null;
  if (voucherId != null && voucherId !== '') {
    const applied = await applyDailyBonusVoucher(userId, pkg.id, payAmount, {
      voucherId,
      consume: options.consumeVoucher === true,
      transaction: options.transaction || null
    });
    if (applied) {
      payAmount = applied.payAmount;
      voucherMeta = {
        voucherId: applied.voucherId,
        percentOff: applied.percentOff,
        originalPayAmount: applied.originalPayAmount,
        discountAmount: applied.discountAmount
      };
    }
  }

  let campaignMeta = null;
  const payDiscount = await applyActivePayDiscountForUser(userId, payAmount, {
    transaction: options.transaction || null
  });
  if (payDiscount.applied) {
    payAmount = payDiscount.payAmount;
    campaignMeta = payDiscountMetadata(payDiscount);
  }

  return {
    packageId: pkg.id,
    groupId: pkg.groupId,
    groupKey: pkg.Group.groupKey,
    title: pkg.title || pkg.Group.title,
    payAmount,
    originalPayAmount,
    creditAmount,
    creditGc,
    actualPrice: toNumber(pkg.actualPrice),
    discountLabel: pkg.discountLabel || null,
    voucher: voucherMeta,
    campaign: campaignMeta,
    metadata: {
      packageId: pkg.id,
      creditAmount,
      creditGc,
      packageTitle: pkg.title || pkg.Group.title,
      groupKey: pkg.Group.groupKey,
      ...(voucherMeta
        ? {
            dailyBonusVoucherId: voucherMeta.voucherId,
            dailyBonusPercentOff: voucherMeta.percentOff,
            dailyBonusDiscountAmount: voucherMeta.discountAmount,
            originalPayAmount: voucherMeta.originalPayAmount
          }
        : {}),
      ...(campaignMeta || {})
    }
  };
}

module.exports = { resolveDepositPackageForUser };
