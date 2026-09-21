/**
 * One-off: apply deposit packages migration if tables are missing.
 * Run: node scripts/apply-deposit-packages-migration.js
 */
require('dotenv').config({ override: true });
const db = require('../src/db/models');
const createMigration = require('../src/db/migrations/20260704120000-create-deposit-packages');
const backfillMigration = require('../src/db/migrations/20260704130000-backfill-admin-roles-deposit-packages');

const MIGRATION_FILES = [
  '20260704120000-create-deposit-packages.js',
  '20260704130000-backfill-admin-roles-deposit-packages.js'
];

async function tableExists(name) {
  const rows = await db.sequelize.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    { bind: [name], type: db.sequelize.QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function getHistory() {
  const rows = await db.sequelize.query(
    `SELECT value FROM settings
     WHERE key = '_migration_history' AND distributor_code IS NULL AND store_code IS NULL
     LIMIT 1`,
    { type: db.sequelize.QueryTypes.SELECT }
  );
  if (!rows?.length || !rows[0].value) return [];
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return [];
  }
}

async function saveHistory(history) {
  const sorted = [...history].sort();
  await db.sequelize.query(
    `UPDATE settings SET value = $2, updated_at = NOW()
     WHERE key = $1 AND distributor_code IS NULL AND store_code IS NULL`,
    { bind: ['_migration_history', JSON.stringify(sorted)] }
  );
}

async function main() {
  await db.sequelize.authenticate();

  if (await tableExists('deposit_package_groups')) {
    console.log('deposit_package_groups already exists.');
    await db.sequelize.close();
    return;
  }

  console.log('Creating deposit package tables...');
  const qi = db.sequelize.getQueryInterface();
  await createMigration.up(qi, db.Sequelize, {});
  await backfillMigration.up(qi, db.Sequelize, {});

  let history = await getHistory();
  for (const file of MIGRATION_FILES) {
    if (!history.includes(file)) history.push(file);
  }
  await saveHistory(history);

  const ok = await tableExists('deposit_package_groups');
  console.log(ok ? 'SUCCESS: tables created.' : 'FAILED.');
  await db.sequelize.close();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.sequelize.close();
  } catch (_) {}
  process.exit(1);
});
