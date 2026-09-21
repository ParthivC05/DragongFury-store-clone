'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { WELCOME_SIGNUP_WINDOW_HOURS } = require('../../constants/depositPackageGroups');
const {
  countUserPackagePurchases,
  countCompletedUserPackagePurchases,
  countUserPackagePurchasesBatch,
  releaseAbandonedPackageCardCheckouts
} = require('./countUserPackagePurchases.service');

function parseDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getWelcomeWindowEnd(userCreatedAt, windowHours = WELCOME_SIGNUP_WINDOW_HOURS) {
  const signupAt = parseDate(userCreatedAt);
  if (!signupAt) return null;
  const hours = Number(windowHours);
  const ms = signupAt.getTime() + (Number.isFinite(hours) && hours > 0 ? hours : WELCOME_SIGNUP_WINDOW_HOURS) * 60 * 60 * 1000;
  return new Date(ms);
}

function isWithinWelcomeWindow(userCreatedAt, now = new Date(), windowHours = WELCOME_SIGNUP_WINDOW_HOURS) {
  const end = getWelcomeWindowEnd(userCreatedAt, windowHours);
  if (!end) return false;
  return now < end;
}

function getPurchasesRemaining(maxPurchasesPerUser, purchasesUsed) {
  const max = maxPurchasesPerUser != null ? parseInt(maxPurchasesPerUser, 10) : null;
  if (!Number.isInteger(max) || max < 1) return null;
  const used = parseInt(purchasesUsed, 10) || 0;
  return Math.max(0, max - used);
}

function isPurchaseLimitReached(maxPurchasesPerUser, purchasesUsed) {
  const remaining = getPurchasesRemaining(maxPurchasesPerUser, purchasesUsed);
  return remaining != null && remaining <= 0;
}

function getPackageMaxPurchases(pkg) {
  if (!pkg) return null;
  return pkg.maxPurchasesPerUser ?? pkg.max_purchases_per_user ?? null;
}

function parsePositiveLimit(value) {
  if (value == null || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function getWelcomeGroupMaxPurchases(groupOrPkg) {
  const group = groupOrPkg?.Group || groupOrPkg?.group || groupOrPkg;
  const key = group?.groupKey ?? group?.group_key;
  if (key !== 'welcome') return null;
  return parsePositiveLimit(group?.maxPurchasesPerUser ?? group?.max_purchases_per_user);
}

function sumPurchaseCounts(purchaseCounts, packageIds) {
  if (!purchaseCounts || !Array.isArray(packageIds)) return 0;
  return packageIds.reduce((sum, id) => sum + (parseInt(purchaseCounts.get(id), 10) || 0), 0);
}

async function getWelcomePackageIdsForStore(distributorCode, storeCode) {
  const dist = String(distributorCode || '').trim().toLowerCase();
  const store = String(storeCode || '').trim().toLowerCase();
  if (!dist || !store) return [];
  const groups = await db.DepositPackageGroup.findAll({
    where: {
      groupKey: 'welcome',
      [Op.and]: [
        db.sequelize.where(db.sequelize.fn('lower', db.sequelize.col('distributor_code')), dist),
        db.sequelize.where(db.sequelize.fn('lower', db.sequelize.col('store_code')), store)
      ]
    },
    attributes: ['id']
  });
  if (!groups.length) return [];
  const pkgs = await db.DepositPackage.findAll({
    where: { groupId: { [Op.in]: groups.map((g) => g.id) } },
    attributes: ['id']
  });
  return pkgs.map((p) => p.id);
}

async function loadWelcomeGroupLimitContext(userId, packageIdOrPkg) {
  const pkg = packageIdOrPkg && typeof packageIdOrPkg === 'object' ? packageIdOrPkg : null;
  let packageId = pkg ? (pkg.id ?? pkg.packageId) : packageIdOrPkg;
  packageId = packageId != null ? parseInt(packageId, 10) : NaN;

  let group = pkg?.Group || pkg?.group || null;
  let knownKey = group?.groupKey ?? group?.group_key;
  if (knownKey && knownKey !== 'welcome') return null;

  let distributorCode = pkg?.distributorCode ?? pkg?.distributor_code ?? group?.distributorCode ?? group?.distributor_code;
  let storeCode = pkg?.storeCode ?? pkg?.store_code ?? group?.storeCode ?? group?.store_code;
  let max = getWelcomeGroupMaxPurchases(group);

  if (knownKey !== 'welcome' && Number.isInteger(packageId) && packageId > 0) {
    const row = await db.DepositPackage.findByPk(packageId, {
      include: [{
        model: db.DepositPackageGroup,
        as: 'Group',
        required: true,
        attributes: ['id', 'groupKey', 'maxPurchasesPerUser', 'distributorCode', 'storeCode']
      }],
      attributes: ['id', 'distributorCode', 'storeCode', 'groupId']
    });
    if (!row?.Group || row.Group.groupKey !== 'welcome') return null;
    group = row.Group;
    knownKey = 'welcome';
    distributorCode = row.distributorCode || row.Group.distributorCode;
    storeCode = row.storeCode || row.Group.storeCode;
    max = getWelcomeGroupMaxPurchases(row.Group);
    packageId = row.id;
  }

  if (knownKey !== 'welcome' || max == null) return null;
  const welcomeIds = await getWelcomePackageIdsForStore(distributorCode, storeCode);
  if (!welcomeIds.length) return null;
  return { max, welcomeIds, packageId, userId };
}

async function assertWelcomeGroupPurchaseLimit(userId, pkg) {
  const ctx = await loadWelcomeGroupLimitContext(userId, pkg);
  if (!ctx) return;
  const counts = await countUserPackagePurchasesBatch(userId, ctx.welcomeIds);
  const used = sumPurchaseCounts(counts, ctx.welcomeIds);
  if (isPurchaseLimitReached(ctx.max, used)) {
    const err = new Error('You have reached the Welcome Package purchase limit.');
    err.statusCode = 400;
    throw err;
  }
}

async function assertWelcomeGroupPurchaseLimitForCompletion(userId, packageIdOrPkg, options = {}) {
  const ctx = await loadWelcomeGroupLimitContext(userId, packageIdOrPkg);
  if (!ctx) return;
  let used = 0;
  for (const id of ctx.welcomeIds) {
    used += await countCompletedUserPackagePurchases(userId, id, {
      excludeChimeRequestId: Number(id) === Number(ctx.packageId) ? options.excludeChimeRequestId : null,
      includeOtherInFlightChime: true
    });
  }
  if (isPurchaseLimitReached(ctx.max, used)) {
    const err = new Error('You have reached the Welcome Package purchase limit.');
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Checkout gate: release abandoned card sessions for this package, then enforce limit.
 * Abandoned card/crypto pending checkouts do not consume the limit; open Chime does.
 */
async function assertPackagePurchaseLimit(userId, pkg) {
  const max = getPackageMaxPurchases(pkg);
  const packageId = pkg?.id ?? pkg?.packageId;
  if (max != null) {
    await releaseAbandonedPackageCardCheckouts(userId, packageId);
    const used = await countUserPackagePurchases(userId, packageId);
    if (isPurchaseLimitReached(max, used)) {
      const err = new Error('You have reached the purchase limit for this package.');
      err.statusCode = 400;
      throw err;
    }
  } else if (packageId != null) {
    await releaseAbandonedPackageCardCheckouts(userId, packageId);
  }

  await assertWelcomeGroupPurchaseLimit(userId, pkg);
}

/**
 * Completion gate (wallet credit / Chime approve): only completed purchases count.
 * Prevents going beyond the limit if multiple checkouts somehow succeed.
 */
async function assertPackagePurchaseLimitForCompletion(userId, packageIdOrPkg, options = {}) {
  const pkg = packageIdOrPkg && typeof packageIdOrPkg === 'object' ? packageIdOrPkg : null;
  const packageId = pkg ? (pkg.id ?? pkg.packageId) : packageIdOrPkg;
  const max = pkg ? getPackageMaxPurchases(pkg) : options.maxPurchasesPerUser;

  let maxVal = max;
  if (maxVal == null && packageId != null) {
    const row = await db.DepositPackage.findByPk(packageId, {
      attributes: ['id', 'maxPurchasesPerUser']
    });
    maxVal = row?.maxPurchasesPerUser ?? null;
  }
  if (maxVal != null) {
    const used = await countCompletedUserPackagePurchases(userId, packageId, {
      excludeChimeRequestId: options.excludeChimeRequestId,
      includeOtherInFlightChime: true
    });
    if (isPurchaseLimitReached(maxVal, used)) {
      const err = new Error('You have reached the purchase limit for this package.');
      err.statusCode = 400;
      throw err;
    }
  }

  await assertWelcomeGroupPurchaseLimitForCompletion(userId, packageIdOrPkg, options);
}

module.exports = {
  getWelcomeWindowEnd,
  isWithinWelcomeWindow,
  getPurchasesRemaining,
  isPurchaseLimitReached,
  parsePositiveLimit,
  getWelcomeGroupMaxPurchases,
  sumPurchaseCounts,
  getWelcomePackageIdsForStore,
  assertPackagePurchaseLimit,
  assertPackagePurchaseLimitForCompletion
};
