'use strict';

/**
 * Smoke / integration checks for deposit packages (run from backend folder).
 * Usage: node scripts/test-deposit-packages-e2e.js
 */
require('dotenv').config();
const db = require('../src/db/models');
const {
  getActiveCatalogForScope,
  getAdminCatalogForScope,
  isWithinWindow
} = require('../src/services/depositPackages/getDepositPackagesCatalog.service');
const { resolveDepositPackageForUser } = require('../src/services/depositPackages/resolveDepositPackage.service');
const { getDepositPackageSettings } = require('../src/services/depositPackages/getDepositPackageSettings.service');
const { applyDepositBonuses } = require('../src/services/promotions/applyDepositBonuses.service');
const { applyNewUserDepositBonus } = require('../src/services/depositBonuses/applyNewUserDepositBonus.service');

const issues = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log(`  ✓ ${msg}`);
}

function fail(msg, detail) {
  issues.push({ msg, detail });
  console.log(`  ✗ ${msg}`);
  if (detail) console.log(`    ${detail}`);
}

async function main() {
  console.log('\n=== Deposit Packages E2E Smoke Test ===\n');

  // 1. Legacy bonuses disabled
  const legacyBonuses = await applyDepositBonuses(1, 100, {});
  const newUserBonuses = await applyNewUserDepositBonus(1, 100, {});
  if (Array.isArray(legacyBonuses) && legacyBonuses.length === 0) {
    pass('Legacy applyDepositBonuses returns empty (no extra SC)');
  } else {
    fail('Legacy applyDepositBonuses still applies bonuses', JSON.stringify(legacyBonuses));
  }
  if (Array.isArray(newUserBonuses) && newUserBonuses.length === 0) {
    pass('applyNewUserDepositBonus returns empty');
  } else {
    fail('applyNewUserDepositBonus still applies bonuses', JSON.stringify(newUserBonuses));
  }

  // 2. Find a store with packages enabled
  const settingsRows = await db.Setting.findAll({
    where: { key: 'deposit_package_settings' },
    limit: 20,
    raw: true
  });

  if (!settingsRows.length) {
    fail('No deposit_package_settings found in DB — enable packages in admin first');
    printSummary();
    await db.sequelize.close();
    process.exit(issues.length ? 1 : 0);
  }

  let testScope = null;
  let settings = null;
  for (const row of settingsRows) {
    try {
      const val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      if (val?.enabled) {
        testScope = {
          distributorCode: row.distributorCode || row.distributor_code,
          storeCode: row.storeCode || row.store_code
        };
        settings = val;
        break;
      }
    } catch (_) {}
  }

  if (!testScope) {
    fail('No store has deposit packages enabled', 'Enable in admin and re-run');
    printSummary();
    await db.sequelize.close();
    process.exit(1);
  }

  pass(`Found enabled store: ${testScope.distributorCode}/${testScope.storeCode}`);

  // 3. Catalog
  const user = await db.User.findOne({
    where: {
      distributorCode: testScope.distributorCode,
      storeCode: testScope.storeCode,
      isActive: true
    },
    attributes: ['userId', 'createdAt', 'distributorCode', 'storeCode'],
    order: [['userId', 'DESC']]
  });

  if (!user) {
    fail('No active user found for test store');
    printSummary();
    await db.sequelize.close();
    process.exit(1);
  }

  const catalog = await getActiveCatalogForScope(testScope, { userId: user.userId });
  if (catalog.enabled) {
    pass(`Catalog enabled with ${catalog.groups.length} group(s)`);
  } else {
    fail('Catalog reports disabled despite settings');
  }

  const totalPackages = catalog.groups.reduce((n, g) => n + (g.packages?.length || 0), 0);
  if (totalPackages > 0) {
    pass(`${totalPackages} package(s) visible to user ${user.userId}`);
  } else {
    fail('No packages visible in catalog', 'Add packages in admin or check schedules/limits');
  }

  // 4. General group last
  const groupKeys = catalog.groups.map((g) => g.group_key);
  const generalIdx = groupKeys.indexOf('general');
  if (generalIdx === -1 || generalIdx === groupKeys.length - 1) {
    pass('General group is last (or absent)');
  } else {
    fail('General group is not last in catalog order', groupKeys.join(', '));
  }

  // 5. Resolve first visible package
  let testPkg = null;
  for (const group of catalog.groups) {
    if (group.packages?.length) {
      testPkg = group.packages[0];
      break;
    }
  }

  if (testPkg) {
    try {
      const resolved = await resolveDepositPackageForUser(user.userId, testPkg.id);
      if (resolved.payAmount === testPkg.final_price && resolved.creditAmount === testPkg.final_sc) {
        pass(`Package #${testPkg.id} resolves: pay $${resolved.payAmount}, credit ${resolved.creditAmount} SC`);
      } else {
        fail('Resolved amounts mismatch catalog', JSON.stringify({ resolved, testPkg }));
      }
    } catch (err) {
      fail(`resolveDepositPackageForUser failed for package #${testPkg.id}`, err.message);
    }
  }

  // 6. Package below min deposit check
  const limitsSetting = await db.Setting.findOne({
    where: {
      key: 'wallet_limits',
      distributorCode: testScope.distributorCode,
      storeCode: testScope.storeCode
    },
    raw: true
  });
  let depositMin = 10;
  try {
    const lim = typeof limitsSetting?.value === 'string' ? JSON.parse(limitsSetting.value) : limitsSetting?.value;
    if (lim?.depositMin != null) depositMin = Number(lim.depositMin);
  } catch (_) {}

  const belowMinPkgs = [];
  for (const group of catalog.groups) {
    for (const pkg of group.packages || []) {
      if (Number(pkg.final_price) < depositMin) belowMinPkgs.push({ id: pkg.id, price: pkg.final_price, group: group.group_key });
    }
  }
  if (belowMinPkgs.length) {
    fail(
      `${belowMinPkgs.length} package(s) priced below deposit minimum ($${depositMin}) — frontend submit will be blocked`,
      belowMinPkgs.map((p) => `#${p.id} $${p.price} (${p.group})`).join(', ')
    );
  } else {
    pass(`All visible packages meet deposit minimum ($${depositMin})`);
  }

  // 7. Non-general groups should have max_purchases_per_user in DB
  const adminCatalog = await getAdminCatalogForScope(testScope);
  for (const group of adminCatalog.groups) {
    if (group.group_key === 'general') continue;
    for (const pkg of group.packages || []) {
      if (pkg.max_purchases_per_user == null) {
        fail(`Package #${pkg.id} in ${group.group_key} missing max_purchases_per_user in admin`, 'Required for non-general groups');
      }
    }
  }
  pass('Admin catalog loads; max purchase limits checked for non-general packages');

  // 8. Welcome window
  const welcomeGroup = catalog.groups.find((g) => g.group_key === 'welcome');
  if (welcomeGroup) {
    const signupAge = Date.now() - new Date(user.createdAt).getTime();
    const within24h = signupAge < 24 * 60 * 60 * 1000;
    if (within24h) {
      pass(`Welcome group shown for user within 24h signup window`);
    } else {
      fail('Welcome group shown for user OUTSIDE 24h window', `User created ${user.createdAt}`);
    }
  } else {
    pass('Welcome group hidden (user outside window or no welcome packages)');
  }

  // 9. isWithinWindow export sanity
  if (isWithinWindow(null, null) === true) {
    pass('isWithinWindow(null,null) true for general-style windows');
  }

  // 10. Chime package columns exist
  const chimeAttrs = db.ChimeDepositRequest.rawAttributes;
  if (chimeAttrs.packageId && chimeAttrs.creditSc) {
    pass('ChimeDepositRequest has packageId and creditSc columns');
  } else {
    fail('ChimeDepositRequest missing package columns — run migrations');
  }

  printSummary();
  await db.sequelize.close();
  process.exit(issues.length ? 1 : 0);
}

function printSummary() {
  console.log('\n--- Summary ---');
  console.log(`Passed: ${passes.length}`);
  console.log(`Issues: ${issues.length}`);
  if (issues.length) {
    console.log('\nBugs / warnings found:');
    issues.forEach((i, idx) => {
      console.log(`${idx + 1}. ${i.msg}`);
      if (i.detail) console.log(`   ${i.detail}`);
    });
  } else {
    console.log('\nNo blocking issues detected in automated checks.');
  }
}

main().catch((err) => {
  console.error('Test script failed:', err);
  process.exit(1);
});
