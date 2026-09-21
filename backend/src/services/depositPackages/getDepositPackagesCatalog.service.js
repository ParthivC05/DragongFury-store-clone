'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { DEPOSIT_PACKAGE_GROUP_DEFS, WELCOME_SIGNUP_WINDOW_HOURS } = require('../../constants/depositPackageGroups');
const { normalizeScope } = require('./getDepositPackageSettings.service');
const { countUserPackagePurchasesBatch } = require('./countUserPackagePurchases.service');
const {
  getWelcomeWindowEnd,
  isWithinWelcomeWindow,
  getPurchasesRemaining,
  isPurchaseLimitReached,
  parsePositiveLimit,
  sumPurchaseCounts
} = require('./packageEligibility.service');

function parseDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWithinWindow(startsAt, endsAt, now = new Date()) {
  const start = parseDate(startsAt);
  const end = parseDate(endsAt);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function resolveCountdownEndsAt(startsAt, endsAt) {
  const end = parseDate(endsAt);
  if (!end) return null;
  const now = new Date();
  if (now >= end) return null;
  const start = parseDate(startsAt);
  if (start && now < start) return end.toISOString();
  return end.toISOString();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function serializePackage(row, { adminMode = false, purchasesUsed = null } = {}) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const maxPurchases = plain.maxPurchasesPerUser ?? plain.max_purchases_per_user;
  const maxParsed = maxPurchases != null ? parseInt(maxPurchases, 10) : null;
  const used = purchasesUsed != null ? parseInt(purchasesUsed, 10) || 0 : 0;
  const payload = {
    id: plain.id,
    group_id: plain.groupId,
    title: plain.title || null,
    final_sc: toNumber(plain.finalSc),
    gc_coin: toNumber(plain.gcCoin ?? plain.gc_coin),
    actual_price: toNumber(plain.actualPrice),
    final_price: toNumber(plain.finalPrice),
    discount_label: plain.discountLabel || null,
    sort_order: plain.sortOrder ?? 0,
    starts_at: plain.startsAt ? new Date(plain.startsAt).toISOString() : null,
    ends_at: plain.endsAt ? new Date(plain.endsAt).toISOString() : null,
    is_active: plain.isActive !== false,
    max_purchases_per_user: Number.isInteger(maxParsed) && maxParsed > 0 ? maxParsed : null,
    countdown_ends_at: resolveCountdownEndsAt(plain.startsAt, plain.endsAt)
  };
  if (!adminMode && payload.max_purchases_per_user != null) {
    payload.purchases_used = used;
    payload.purchases_remaining = getPurchasesRemaining(payload.max_purchases_per_user, used);
  }
  return payload;
}

function serializeGroup(row, packages = [], {
  adminMode = false,
  purchaseCounts = null,
  welcomeWindowEnd = null
} = {}) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const isWelcome = plain.groupKey === 'welcome';
  const isGeneral = plain.groupKey === 'general';
  const packageRows = adminMode
    ? packages
    : packages.filter((p) => {
      const pkg = p.get ? p.get({ plain: true }) : p;
      if (pkg.isActive === false || !isWithinWindow(pkg.startsAt, pkg.endsAt)) return false;
      const max = pkg.maxPurchasesPerUser ?? pkg.max_purchases_per_user;
      const used = purchaseCounts?.get(pkg.id) ?? 0;
      return !isPurchaseLimitReached(max, used);
    });
  const welcomeEndIso = welcomeWindowEnd instanceof Date && !Number.isNaN(welcomeWindowEnd.getTime())
    ? welcomeWindowEnd.toISOString()
    : null;
  let groupCountdown = null;
  if (isWelcome && welcomeEndIso && new Date() < welcomeWindowEnd) {
    groupCountdown = welcomeEndIso;
  } else if (!isGeneral && !isWelcome) {
    groupCountdown = resolveCountdownEndsAt(plain.startsAt, plain.endsAt);
  }
  const groupMax = isWelcome
    ? parsePositiveLimit(plain.maxPurchasesPerUser ?? plain.max_purchases_per_user)
    : null;
  const welcomeUsed = isWelcome && !adminMode
    ? sumPurchaseCounts(
      purchaseCounts,
      packages.map((p) => {
        const pkg = p.get ? p.get({ plain: true }) : p;
        return pkg.id;
      })
    )
    : 0;
  return {
    id: plain.id,
    group_key: plain.groupKey,
    title: plain.title,
    sort_order: plain.sortOrder ?? 0,
    starts_at: plain.startsAt ? new Date(plain.startsAt).toISOString() : null,
    ends_at: plain.endsAt ? new Date(plain.endsAt).toISOString() : null,
    is_active: plain.isActive !== false,
    supports_schedule: !isGeneral && !isWelcome,
    signup_window_hours: isWelcome ? WELCOME_SIGNUP_WINDOW_HOURS : null,
    max_purchases_per_user: groupMax,
    ...(isWelcome && !adminMode && groupMax != null
      ? {
        purchases_used: welcomeUsed,
        purchases_remaining: getPurchasesRemaining(groupMax, welcomeUsed)
      }
      : {}),
    countdown_ends_at: groupCountdown,
    packages: packageRows.map((pkg) => {
      const pkgPlain = pkg.get ? pkg.get({ plain: true }) : pkg;
      return serializePackage(pkg, {
        adminMode,
        purchasesUsed: purchaseCounts?.get(pkgPlain.id) ?? 0
      });
    })
  };
}

function scopeWhereClause(normalized) {
  return {
    [Op.and]: [
      db.sequelize.where(
        db.sequelize.fn('lower', db.sequelize.col('distributor_code')),
        normalized.distributorCode
      ),
      db.sequelize.where(
        db.sequelize.fn('lower', db.sequelize.col('store_code')),
        normalized.storeCode
      )
    ]
  };
}

async function ensureDefaultGroups(scope) {
  const normalized = normalizeScope(scope);
  if (!normalized) return [];
  const existing = await db.DepositPackageGroup.findAll({
    where: scopeWhereClause(normalized)
  });
  const existingKeys = new Set(existing.map((g) => g.groupKey));
  const toCreate = DEPOSIT_PACKAGE_GROUP_DEFS.filter((def) => !existingKeys.has(def.groupKey));
  if (toCreate.length > 0) {
    await db.DepositPackageGroup.bulkCreate(
      toCreate.map((def) => ({
        distributorCode: normalized.distributorCode,
        storeCode: normalized.storeCode,
        groupKey: def.groupKey,
        title: def.title,
        sortOrder: def.defaultSortOrder,
        isActive: true
      }))
    );
  }
  return db.DepositPackageGroup.findAll({
    where: scopeWhereClause(normalized),
    order: [['sortOrder', 'ASC'], ['id', 'ASC']]
  });
}

async function getActiveCatalogForScope(scope, { includeInactive = false, userId = null } = {}) {
  const normalized = normalizeScope(scope);
  if (!normalized) return { enabled: false, groups: [] };

  const settings = await require('./getDepositPackageSettings.service').getDepositPackageSettings(normalized);
  if (!settings.enabled && !includeInactive) {
    return { enabled: false, groups: [] };
  }

  await ensureDefaultGroups(normalized);

  let userCreatedAt = null;
  if (userId && !includeInactive) {
    const user = await db.User.findByPk(userId, {
      attributes: ['createdAt'],
      raw: true
    });
    userCreatedAt = user?.createdAt ?? null;
  }

  const groups = await db.DepositPackageGroup.findAll({
    where: {
      ...scopeWhereClause(normalized),
      ...(includeInactive ? {} : { isActive: true })
    },
    order: [['sortOrder', 'ASC'], ['id', 'ASC']]
  });

  const groupIds = groups.map((g) => g.id);
  const packages = groupIds.length
    ? await db.DepositPackage.findAll({
      where: {
        groupId: { [Op.in]: groupIds },
        ...(includeInactive ? {} : { isActive: true })
      },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    })
    : [];

  const packagesByGroup = new Map();
  packages.forEach((pkg) => {
    const list = packagesByGroup.get(pkg.groupId) || [];
    list.push(pkg);
    packagesByGroup.set(pkg.groupId, list);
  });

  const purchaseCounts = userId && !includeInactive
    ? await countUserPackagePurchasesBatch(userId, packages.map((p) => p.id))
    : null;
  const welcomeWindowEnd = userCreatedAt ? getWelcomeWindowEnd(userCreatedAt) : null;
  const now = new Date();

  const serializedGroups = groups
    .filter((group) => includeInactive || group.isActive !== false)
    .filter((group) => {
      if (includeInactive) return true;
      if (group.groupKey === 'general') return true;
      if (group.groupKey === 'welcome') {
        return userCreatedAt ? isWithinWelcomeWindow(userCreatedAt, now) : false;
      }
      return isWithinWindow(group.startsAt, group.endsAt, now);
    })
    .map((group) => serializeGroup(group, packagesByGroup.get(group.id) || [], {
      adminMode: includeInactive,
      purchaseCounts,
      welcomeWindowEnd: group.groupKey === 'welcome' ? welcomeWindowEnd : null
    }))
    .filter((group) => includeInactive || group.group_key === 'general' || group.packages.length > 0)
    .filter((group) => {
      if (includeInactive) return true;
      if (group.group_key !== 'welcome') return true;
      return !isPurchaseLimitReached(group.max_purchases_per_user, group.purchases_used);
    });

  return {
    enabled: settings.enabled,
    groups: serializedGroups
  };
}

/** Admin catalog: all groups (including empty) and all packages regardless of schedule. */
async function getAdminCatalogForScope(scope) {
  const normalized = normalizeScope(scope);
  if (!normalized) return { enabled: false, groups: [] };

  const groups = await ensureDefaultGroups(normalized);
  const settings = await require('./getDepositPackageSettings.service').getDepositPackageSettings(normalized);

  const groupIds = groups.map((g) => g.id);
  const packages = groupIds.length
    ? await db.DepositPackage.findAll({
      where: { groupId: { [Op.in]: groupIds } },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    })
    : [];

  const packagesByGroup = new Map();
  packages.forEach((pkg) => {
    const list = packagesByGroup.get(pkg.groupId) || [];
    list.push(pkg);
    packagesByGroup.set(pkg.groupId, list);
  });

  return {
    enabled: settings.enabled,
    groups: groups.map((group) =>
      serializeGroup(group, packagesByGroup.get(group.id) || [], { adminMode: true })
    )
  };
}

module.exports = {
  ensureDefaultGroups,
  getActiveCatalogForScope,
  getAdminCatalogForScope,
  serializePackage,
  serializeGroup,
  isWithinWindow,
  parseDate,
  resolveCountdownEndsAt
};
