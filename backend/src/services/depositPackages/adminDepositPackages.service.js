'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { DEPOSIT_PACKAGE_GROUP_KEYS } = require('../../constants/depositPackageGroups');
const {
  ensureDefaultGroups,
  getActiveCatalogForScope,
  getAdminCatalogForScope,
  parseDate
} = require('./getDepositPackagesCatalog.service');
const {
  getDepositPackageSettings,
  updateDepositPackageSettings,
  normalizeScope
} = require('./getDepositPackageSettings.service');
const { isGcCoinsStore } = require('../../constants/gcCoins');

function assertAdminScope(req, scope) {
  const normalized = normalizeScope(scope);
  if (!normalized) {
    const err = new Error('Store scope is required (distributorCode and storeCode).');
    err.statusCode = 400;
    throw err;
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const reqStore = normalizeScope({ distributorCode: req.distributorCode, storeCode: req.storeCode });
    if (
      !reqStore ||
      reqStore.distributorCode !== normalized.distributorCode ||
      reqStore.storeCode !== normalized.storeCode
    ) {
      const err = new Error('You can only manage packages for your store.');
      err.statusCode = 403;
      throw err;
    }
  }
  return normalized;
}

async function assertGroupScope(req, groupId, scope) {
  const normalized = assertAdminScope(req, scope);
  const id = parseInt(groupId, 10);
  if (!Number.isInteger(id) || id < 1) {
    const err = new Error('Package group not found.');
    err.statusCode = 404;
    throw err;
  }
  const group = await db.DepositPackageGroup.findByPk(id);
  if (
    !group ||
    String(group.distributorCode || '').toLowerCase() !== normalized.distributorCode ||
    String(group.storeCode || '').toLowerCase() !== normalized.storeCode
  ) {
    const err = new Error('Package group not found.');
    err.statusCode = 404;
    throw err;
  }
  return { group, scope: normalized };
}

async function assertPackageScope(req, packageId, scope) {
  const normalized = assertAdminScope(req, scope);
  const pkg = await db.DepositPackage.findByPk(packageId, {
    include: [{ model: db.DepositPackageGroup, as: 'Group', required: true }]
  });
  if (
    !pkg ||
    String(pkg.distributorCode || '').toLowerCase() !== normalized.distributorCode ||
    String(pkg.storeCode || '').toLowerCase() !== normalized.storeCode
  ) {
    const err = new Error('Package not found.');
    err.statusCode = 404;
    throw err;
  }
  return { pkg, scope: normalized };
}

function parseMoney(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`${fieldName} must be a valid number.`);
    err.statusCode = 400;
    throw err;
  }
  return Math.round(n * 100) / 100;
}

function parseOptionalGc(value, storeCode) {
  if (!isGcCoinsStore(storeCode)) return 0;
  if (value == null || value === '') return 0;
  return parseMoney(value, 'gc_coin');
}

function parseMaxPurchasesPerUser(value, groupKey) {
  const isGeneral = groupKey === 'general';
  if (value == null || value === '') {
    if (isGeneral) return null;
    const err = new Error('Max purchases per user is required for this package group.');
    err.statusCode = 400;
    throw err;
  }
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1) {
    const err = new Error('Max purchases per user must be at least 1.');
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function groupUsesSchedule(groupKey) {
  return groupKey !== 'general' && groupKey !== 'welcome';
}

async function getAdminCatalog(req, scope) {
  assertAdminScope(req, scope);
  const catalog = await getAdminCatalogForScope(scope);
  return catalog;
}

async function updateSettings(req, scope, payload) {
  const normalized = assertAdminScope(req, scope);
  return updateDepositPackageSettings(normalized, payload);
}

async function updateGroup(req, scope, groupId, body) {
  const { group } = await assertGroupScope(req, groupId, scope);
  const updates = {};
  if (body.title != null) updates.title = String(body.title).trim().slice(0, 128) || group.title;
  if (body.sort_order != null || body.sortOrder != null) {
    updates.sortOrder = parseInt(body.sort_order ?? body.sortOrder, 10) || 0;
  }
  if (groupUsesSchedule(group.groupKey)) {
    if (body.starts_at !== undefined || body.startsAt !== undefined) {
      updates.startsAt = parseDate(body.starts_at ?? body.startsAt);
    }
    if (body.ends_at !== undefined || body.endsAt !== undefined) {
      updates.endsAt = parseDate(body.ends_at ?? body.endsAt);
    }
  } else {
    updates.startsAt = null;
    updates.endsAt = null;
  }
  if (body.is_active != null || body.isActive != null) {
    updates.isActive = body.is_active ?? body.isActive;
  }
  if (group.groupKey === 'welcome' && (
    body.max_purchases_per_user !== undefined || body.maxPurchasesPerUser !== undefined
  )) {
    const raw = body.max_purchases_per_user ?? body.maxPurchasesPerUser;
    if (raw == null || raw === '') {
      updates.maxPurchasesPerUser = null;
    } else {
      const n = parseInt(raw, 10);
      if (!Number.isInteger(n) || n < 1) {
        const err = new Error('Welcome purchase limit must be at least 1, or left blank for no section limit.');
        err.statusCode = 400;
        throw err;
      }
      updates.maxPurchasesPerUser = n;
    }
  }
  await group.update(updates);
  return group;
}

async function createPackage(req, scope, body) {
  assertAdminScope(req, scope);
  const groupId = parseInt(body.group_id ?? body.groupId, 10);
  if (!Number.isInteger(groupId) || groupId < 1) {
    const err = new Error('group_id is required.');
    err.statusCode = 400;
    throw err;
  }
  const { group, scope: normalized } = await assertGroupScope(req, groupId, scope);

  const finalSc = parseMoney(body.final_sc ?? body.finalSc, 'final_sc');
  const gcCoin = parseOptionalGc(body.gc_coin ?? body.gcCoin, normalized.storeCode);
  const actualPrice = parseMoney(body.actual_price ?? body.actualPrice, 'actual_price');
  const finalPrice = parseMoney(body.final_price ?? body.finalPrice, 'final_price');

  if (finalPrice > actualPrice && actualPrice > 0) {
    // allowed - sale price lower than actual
  }

  const maxPurchasesPerUser = parseMaxPurchasesPerUser(
    body.max_purchases_per_user ?? body.maxPurchasesPerUser,
    group.groupKey
  );
  const row = await db.DepositPackage.create({
    groupId: group.id,
    distributorCode: normalized.distributorCode,
    storeCode: normalized.storeCode,
    title: body.title != null ? String(body.title).trim().slice(0, 128) || null : null,
    finalSc,
    gcCoin,
    actualPrice,
    finalPrice,
    discountLabel: body.discount_label ?? body.discountLabel
      ? String(body.discount_label ?? body.discountLabel).trim().slice(0, 32)
      : null,
    sortOrder: parseInt(body.sort_order ?? body.sortOrder, 10) || 0,
    startsAt: groupUsesSchedule(group.groupKey) ? parseDate(body.starts_at ?? body.startsAt) : null,
    endsAt: groupUsesSchedule(group.groupKey) ? parseDate(body.ends_at ?? body.endsAt) : null,
    maxPurchasesPerUser,
    isActive: body.is_active != null || body.isActive != null ? (body.is_active ?? body.isActive) !== false : true
  });
  return row;
}

async function updatePackage(req, scope, packageId, body) {
  const { pkg } = await assertPackageScope(req, packageId, scope);
  const groupKey = pkg.Group?.groupKey;
  const targetGroupKey = groupKey;
  const updates = {};
  if (body.title !== undefined) updates.title = body.title ? String(body.title).trim().slice(0, 128) : null;
  if (body.final_sc != null || body.finalSc != null) updates.finalSc = parseMoney(body.final_sc ?? body.finalSc, 'final_sc');
  if (body.gc_coin !== undefined || body.gcCoin !== undefined) {
    updates.gcCoin = parseOptionalGc(body.gc_coin ?? body.gcCoin, pkg.storeCode);
  }
  if (body.actual_price != null || body.actualPrice != null) {
    updates.actualPrice = parseMoney(body.actual_price ?? body.actualPrice, 'actual_price');
  }
  if (body.final_price != null || body.finalPrice != null) {
    updates.finalPrice = parseMoney(body.final_price ?? body.finalPrice, 'final_price');
  }
  if (body.discount_label !== undefined || body.discountLabel !== undefined) {
    updates.discountLabel = body.discount_label ?? body.discountLabel
      ? String(body.discount_label ?? body.discountLabel).trim().slice(0, 32)
      : null;
  }
  if (body.sort_order != null || body.sortOrder != null) {
    updates.sortOrder = parseInt(body.sort_order ?? body.sortOrder, 10) || 0;
  }
  if (body.is_active != null || body.isActive != null) {
    updates.isActive = body.is_active ?? body.isActive;
  }
  if (body.group_id != null || body.groupId != null) {
    const nextGroupId = parseInt(body.group_id ?? body.groupId, 10);
    const { group } = await assertGroupScope(req, nextGroupId, scope);
    if (!DEPOSIT_PACKAGE_GROUP_KEYS.includes(group.groupKey)) {
      const err = new Error('Invalid package group.');
      err.statusCode = 400;
      throw err;
    }
    updates.groupId = group.id;
  }
  const effectiveGroupKey = updates.groupId != null
    ? (await db.DepositPackageGroup.findByPk(updates.groupId, { attributes: ['groupKey'] }))?.groupKey
    : targetGroupKey;
  if (body.max_purchases_per_user !== undefined || body.maxPurchasesPerUser !== undefined) {
    updates.maxPurchasesPerUser = parseMaxPurchasesPerUser(
      body.max_purchases_per_user ?? body.maxPurchasesPerUser,
      effectiveGroupKey
    );
  }
  if (groupUsesSchedule(effectiveGroupKey)) {
    if (body.starts_at !== undefined || body.startsAt !== undefined) {
      updates.startsAt = parseDate(body.starts_at ?? body.startsAt);
    }
    if (body.ends_at !== undefined || body.endsAt !== undefined) {
      updates.endsAt = parseDate(body.ends_at ?? body.endsAt);
    }
  } else if (
    body.starts_at !== undefined || body.startsAt !== undefined
    || body.ends_at !== undefined || body.endsAt !== undefined
  ) {
    updates.startsAt = null;
    updates.endsAt = null;
  }
  await pkg.update(updates);
  return pkg;
}

async function deletePackage(req, scope, packageId) {
  const { pkg } = await assertPackageScope(req, packageId, scope);
  await pkg.destroy();
  return { deleted: true };
}

module.exports = {
  getAdminCatalog,
  updateSettings,
  updateGroup,
  createPackage,
  updatePackage,
  deletePackage,
  assertAdminScope
};
