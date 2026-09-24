'use strict';

/**
 * Enable deposit packages for dragonfury and seed live-matching chests.
 * Usage (from backend folder): node scripts/seed-dragonfury-store-packages.js
 */
require('dotenv').config();

const { Op } = require('sequelize');
const db = require('../src/db/models');
const { ROLES } = require('../src/constants/roles');
const { ensureDefaultGroups } = require('../src/services/depositPackages/getDepositPackagesCatalog.service');
const { updateDepositPackageSettings } = require('../src/services/depositPackages/getDepositPackageSettings.service');

const STORE_CODE = 'dragonfury';

const GENERAL_PACKS = [
  { title: 'Starter Chest', final_sc: 5, actual_price: 4.99, final_price: 4.99, sort_order: 10 },
  { title: 'Premium Chest', final_sc: 10, actual_price: 9.99, final_price: 9.99, sort_order: 20 },
  { title: 'Royal Chest', final_sc: 25, actual_price: 24.99, final_price: 24.99, sort_order: 30 },
  { title: 'Epic Chest', final_sc: 50, actual_price: 49.99, final_price: 49.99, sort_order: 40 },
  { title: 'Legendary Chest', final_sc: 100, actual_price: 99.99, final_price: 99.99, sort_order: 50 },
  { title: 'Mythic Chest', final_sc: 200, actual_price: 199.99, final_price: 199.99, sort_order: 60 },
  { title: 'Premium Chest', final_sc: 15, actual_price: 14.99, final_price: 14.99, sort_order: 70 },
  { title: 'Royal Chest', final_sc: 20, actual_price: 19.99, final_price: 19.99, sort_order: 80 },
  { title: 'Legendary Chest', final_sc: 150, actual_price: 149.99, final_price: 149.99, sort_order: 90 },
  { title: 'Mythic Chest', final_sc: 250, actual_price: 249.99, final_price: 249.99, sort_order: 100 },
  { title: 'Mythic Chest', final_sc: 300, actual_price: 299.99, final_price: 299.99, sort_order: 110 }
];

const LIMITED_PACKS = [
  { title: 'Limited Offer', final_sc: 29, actual_price: 24.99, final_price: 24.99, sort_order: 10, discount_label: '+18% SC' },
  { title: 'Limited Offer', final_sc: 59, actual_price: 49.99, final_price: 49.99, sort_order: 20, discount_label: '+18% SC' },
  { title: 'Limited Offer', final_sc: 165, actual_price: 149.99, final_price: 149.99, sort_order: 30, discount_label: '+10% SC' },
  { title: 'Limited Offer', final_sc: 275, actual_price: 249.99, final_price: 249.99, sort_order: 40, discount_label: '+10% SC' }
];

async function resolveScope() {
  const admin = await db.User.findOne({
    where: {
      role: ROLES.STORE_ADMIN,
      storeRoleId: null,
      [Op.and]: [
        db.sequelize.where(
          db.sequelize.fn(
            'lower',
            db.sequelize.fn('regexp_replace', db.sequelize.fn('trim', db.sequelize.col('store_code')), '[^a-zA-Z0-9]', '', 'g')
          ),
          STORE_CODE
        )
      ]
    },
    attributes: ['userId', 'email', 'distributorCode', 'storeCode'],
    order: [['userId', 'ASC']]
  });

  if (admin?.distributorCode && admin?.storeCode) {
    return {
      distributorCode: String(admin.distributorCode).trim().toLowerCase(),
      storeCode: String(admin.storeCode).trim().toLowerCase(),
      via: `store_admin ${admin.email || admin.userId}`
    };
  }

  // Fallback: any setting / group already scoped to dragonfury
  const setting = await db.Setting.findOne({
    where: {
      [Op.or]: [
        { storeCode: STORE_CODE },
        { store_code: STORE_CODE }
      ]
    },
    order: [['id', 'ASC']]
  });
  if (setting?.distributorCode || setting?.distributor_code) {
    return {
      distributorCode: String(setting.distributorCode || setting.distributor_code).trim().toLowerCase(),
      storeCode: STORE_CODE,
      via: 'settings row'
    };
  }

  throw new Error(`Could not resolve distributor for store_code=${STORE_CODE}. Create a store_admin first.`);
}

async function upsertPackage(scope, group, spec, { requireLimit = false } = {}) {
  const existing = await db.DepositPackage.findOne({
    where: {
      distributorCode: scope.distributorCode,
      storeCode: scope.storeCode,
      groupId: group.id,
      finalSc: spec.final_sc,
      finalPrice: spec.final_price
    }
  });

  const payload = {
    distributorCode: scope.distributorCode,
    storeCode: scope.storeCode,
    groupId: group.id,
    title: spec.title,
    finalSc: spec.final_sc,
    actualPrice: spec.actual_price,
    finalPrice: spec.final_price,
    discountLabel: spec.discount_label || null,
    sortOrder: spec.sort_order ?? 0,
    startsAt: spec.starts_at || null,
    endsAt: spec.ends_at || null,
    isActive: true,
    maxPurchasesPerUser: requireLimit ? (spec.max_purchases_per_user ?? 50) : null
  };

  if (existing) {
    await existing.update(payload);
    return { id: existing.id, created: false };
  }
  const created = await db.DepositPackage.create(payload);
  return { id: created.id, created: true };
}

async function main() {
  console.log('\n=== Seed Dragon Fury store packages ===\n');
  const scope = await resolveScope();
  console.log(`Scope: ${scope.distributorCode}/${scope.storeCode} (${scope.via})`);

  const settings = await updateDepositPackageSettings(scope, { enabled: true });
  console.log(`Settings enabled: ${settings.enabled}`);

  const groups = await ensureDefaultGroups(scope);
  const byKey = Object.fromEntries(groups.map((g) => [g.groupKey || g.group_key, g]));

  const general = byKey.general;
  const limited = byKey.limited_time;
  if (!general || !limited) {
    throw new Error('Default groups missing after ensureDefaultGroups');
  }

  // Activate limited-time window for the next 30 days
  const startsAt = new Date();
  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await limited.update({
    isActive: true,
    startsAt,
    endsAt,
    title: 'Limited Time Offers'
  });
  console.log(`Limited group #${limited.id} active until ${endsAt.toISOString()}`);

  let created = 0;
  let updated = 0;

  for (const spec of GENERAL_PACKS) {
    const res = await upsertPackage(scope, general, spec, { requireLimit: false });
    if (res.created) created += 1;
    else updated += 1;
  }

  for (const spec of LIMITED_PACKS) {
    const res = await upsertPackage(
      scope,
      limited,
      {
        ...spec,
        starts_at: startsAt,
        ends_at: endsAt,
        max_purchases_per_user: 50
      },
      { requireLimit: true }
    );
    if (res.created) created += 1;
    else updated += 1;
  }

  const total = await db.DepositPackage.count({
    where: {
      distributorCode: scope.distributorCode,
      storeCode: scope.storeCode,
      isActive: true
    }
  });

  console.log(`Packages created: ${created}, updated: ${updated}, active total: ${total}`);
  console.log('\nDone. Refresh /store to see real catalog packages.\n');
  await db.sequelize.close();
}

main().catch(async (err) => {
  console.error('\nSeed failed:', err.message || err);
  try {
    await db.sequelize.close();
  } catch (_) {}
  process.exit(1);
});
