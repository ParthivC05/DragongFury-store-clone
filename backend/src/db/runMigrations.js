/**
 * Run pending migrations once per environment. History is stored in settings._migration_history.
 */
const path = require('path');
const fs = require('fs');
const { logger } = require('../libs/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_HISTORY_KEY = '_migration_history';

async function ensureSettingsTable(sequelize) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(128) NOT NULL UNIQUE,
      value TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

const DEFAULT_CURRENCY = 'SC';
const DEFAULT_WALLET_LIMITS = JSON.stringify({
  depositMin: 10,
  depositMax: 5000,
  withdrawMin: 10,
  withdrawMax: 50,
  withdrawLimitHours: 24
});
const DEFAULT_AFFILIATE_SETTINGS = JSON.stringify({
  rewardType: 'percentage',
  rewardPercentage: 10,
  rewardFixedSc: 0,
  rewardMaxSc: 0,
  maxRewardsPerReferral: 3
});

async function settingsHasScopeColumns(sequelize) {
  if (sequelize.getDialect() !== 'postgres') return false;
  const rows = await sequelize.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code'
     LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return (rows || []).length > 0;
}

async function seedSettingsDefaults(sequelize) {
  const hasScopeColumns = await settingsHasScopeColumns(sequelize);

  if (hasScopeColumns) {
    for (const [key, value] of [
      ['currency', DEFAULT_CURRENCY],
      ['wallet_limits', DEFAULT_WALLET_LIMITS],
      ['affiliate_settings', DEFAULT_AFFILIATE_SETTINGS]
    ]) {
      await sequelize.query(
        `INSERT INTO settings (key, distributor_code, store_code, value, created_at, updated_at)
         SELECT $1::VARCHAR(128), NULL, NULL, $2::TEXT, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM settings WHERE key = $1::VARCHAR(128) AND distributor_code IS NULL AND store_code IS NULL
         )`,
        { bind: [key, value] }
      );
    }
    return;
  }

  await sequelize.query(
    `INSERT INTO settings (key, value, created_at, updated_at) VALUES ('currency', $1, NOW(), NOW())
     ON CONFLICT (key) DO NOTHING`,
    { bind: [DEFAULT_CURRENCY] }
  );
  await sequelize.query(
    `INSERT INTO settings (key, value, created_at, updated_at) VALUES ('wallet_limits', $1, NOW(), NOW())
     ON CONFLICT (key) DO NOTHING`,
    { bind: [DEFAULT_WALLET_LIMITS] }
  );
  await sequelize.query(
    `INSERT INTO settings (key, value, created_at, updated_at) VALUES ('affiliate_settings', $1, NOW(), NOW())
     ON CONFLICT (key) DO NOTHING`,
    { bind: [DEFAULT_AFFILIATE_SETTINGS] }
  );
}

async function tableExists(sequelize, tableName) {
  const rows = await sequelize.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    { bind: [tableName], type: sequelize.QueryTypes.SELECT }
  );
  return (rows || []).length > 0;
}

async function getMigrationHistory(sequelize, transaction) {
  const queryOpts = transaction ? { transaction } : {};
  const hasScopeColumns = await settingsHasScopeColumns(sequelize);

  const rows = hasScopeColumns
    ? await sequelize.query(
        `SELECT value FROM settings
         WHERE key = $1 AND distributor_code IS NULL AND store_code IS NULL
         LIMIT 1`,
        { bind: [MIGRATION_HISTORY_KEY], type: sequelize.QueryTypes.SELECT, ...queryOpts }
      )
    : await sequelize.query(
        `SELECT value FROM settings WHERE key = $1 LIMIT 1`,
        { bind: [MIGRATION_HISTORY_KEY], type: sequelize.QueryTypes.SELECT, ...queryOpts }
      );

  if (!rows?.length || rows[0].value == null) return [];

  try {
    const parsed = JSON.parse(rows[0].value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveMigrationHistory(sequelize, history, transaction) {
  const value = JSON.stringify(history);
  const queryOpts = transaction ? { transaction } : {};
  const hasScopeColumns = await settingsHasScopeColumns(sequelize);

  if (hasScopeColumns) {
    const [, metadata] = await sequelize.query(
      `UPDATE settings SET value = $2, updated_at = NOW()
       WHERE key = $1 AND distributor_code IS NULL AND store_code IS NULL`,
      { bind: [MIGRATION_HISTORY_KEY, value], ...queryOpts }
    );
    if (!metadata?.rowCount) {
      await sequelize.query(
        `INSERT INTO settings (key, distributor_code, store_code, value, created_at, updated_at)
         VALUES ($1, NULL, NULL, $2, NOW(), NOW())`,
        { bind: [MIGRATION_HISTORY_KEY, value], ...queryOpts }
      );
    }
    return;
  }

  await sequelize.query(
    `INSERT INTO settings (key, value, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    { bind: [MIGRATION_HISTORY_KEY, value], ...queryOpts }
  );
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.js'))
    .sort();
}

/**
 * Heal missing footer CMS tables when migration history was bootstrapped/repaired
 * without actually creating footer_menus / footer_pages (common on long-lived prod DBs).
 */
async function ensureFooterMenusPagesSchema(sequelize) {
  const hasMenus = await tableExists(sequelize, 'footer_menus');
  if (hasMenus) {
    await sequelize.query(`
      ALTER TABLE footer_pages
      ADD COLUMN IF NOT EXISTS redirect_path VARCHAR(512) NULL
    `);
    await sequelize.query(`
      ALTER TABLE footer_pages
      ADD COLUMN IF NOT EXISTS meta_title VARCHAR(512) NULL
    `);
    await sequelize.query(`
      ALTER TABLE footer_pages
      ADD COLUMN IF NOT EXISTS meta_description TEXT NULL
    `);
    await sequelize.query(`
      ALTER TABLE footer_pages
      ADD COLUMN IF NOT EXISTS meta_tags VARCHAR(1024) NULL
    `);
    await sequelize.query(`
      ALTER TABLE footer_pages
      ADD COLUMN IF NOT EXISTS allow_index BOOLEAN NOT NULL DEFAULT TRUE
    `);
    await sequelize.query(`
      ALTER TABLE footer_pages
      ADD COLUMN IF NOT EXISTS sections JSONB NULL
    `);
    return;
  }

  logger.warn('footer_menus table missing — applying footer schema self-heal');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS footer_menus (
      id SERIAL PRIMARY KEY,
      store_code VARCHAR(64) NOT NULL,
      label VARCHAR(255) NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS footer_menus_store_sort_idx
    ON footer_menus (store_code, sort_order ASC, id ASC)
  `);
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS footer_pages (
      id SERIAL PRIMARY KEY,
      store_code VARCHAR(64) NOT NULL,
      menu_id INTEGER NOT NULL REFERENCES footer_menus(id) ON DELETE CASCADE,
      title VARCHAR(512) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sequelize.query(`
    ALTER TABLE footer_pages
    ADD COLUMN IF NOT EXISTS redirect_path VARCHAR(512) NULL
  `);
  await sequelize.query(`
    ALTER TABLE footer_pages
    ADD COLUMN IF NOT EXISTS meta_title VARCHAR(512) NULL
  `);
  await sequelize.query(`
    ALTER TABLE footer_pages
    ADD COLUMN IF NOT EXISTS meta_description TEXT NULL
  `);
  await sequelize.query(`
    ALTER TABLE footer_pages
    ADD COLUMN IF NOT EXISTS meta_tags VARCHAR(1024) NULL
  `);
  await sequelize.query(`
    ALTER TABLE footer_pages
    ADD COLUMN IF NOT EXISTS allow_index BOOLEAN NOT NULL DEFAULT TRUE
  `);
  await sequelize.query(`
    ALTER TABLE footer_pages
    ADD COLUMN IF NOT EXISTS sections JSONB NULL
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS footer_pages_store_slug_uidx
    ON footer_pages (store_code, slug)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS footer_pages_menu_sort_idx
    ON footer_pages (menu_id, sort_order ASC, id ASC)
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS footer_pages_store_active_idx
    ON footer_pages (store_code, is_active)
  `);
  logger.info('footer_menus / footer_pages schema ensured');
}

/**
 * Heal missing staff-shift tables when migration history was bootstrapped/repaired
 * without actually creating them (same class of issue as footer CMS on prod).
 * The migration's up() is idempotent and only creates tables that are missing.
 */
async function ensureStoreStaffAttendanceSchema(sequelize) {
  const hasShifts = await tableExists(sequelize, 'store_staff_shifts');
  if (hasShifts) return;

  logger.warn('store_staff_shifts table missing — applying staff attendance schema self-heal');
  const mig = require('./migrations/20260813120000-create-store-staff-attendance');
  await mig.up(sequelize.getQueryInterface(), sequelize.Sequelize);
  logger.info('store_staff_shifts / store_staff_attendance schema ensured');
}

/**
 * Heal missing Mafia Agent template when migration history was repaired/skipped
 * without running the seed (common on prod when an older-dated seed file was added
 * after a newer migration was already applied).
 */
async function ensureMafiaAgentTemplate(sequelize) {
  const rows = await sequelize.query(
    `SELECT id FROM game_templates
     WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'mafiaagent'
     LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  if ((rows || []).length) return;

  logger.warn('Mafia (Agent) game template missing — applying template self-heal');
  const mig = require('./migrations/20260822160000-seed-mafia-agent-template');
  await mig.up(sequelize.getQueryInterface(), sequelize.Sequelize);
  logger.info('Mafia (Agent) game template ensured');
}

/**
 * Heal missing Milkyway Agent template when migration history was repaired/skipped
 * without running the seed (same class of issue as Mafia Agent).
 */
async function ensureMilkywayAgentTemplate(sequelize) {
  const rows = await sequelize.query(
    `SELECT id FROM game_templates
     WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'milkywayagent'
     LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  if ((rows || []).length) return;

  logger.warn('Milkyway (Agent) game template missing — applying template self-heal');
  const mig = require('./migrations/20260915120000-seed-milkyway-agent-template');
  await mig.up(sequelize.getQueryInterface(), sequelize.Sequelize);
  logger.info('Milkyway (Agent) game template ensured');
}

/**
 * Heal missing Juwa new bot template when migration history was repaired/skipped
 * without running the seed (out-of-order migration bootstrap on prod).
 */
async function ensureJuwaNewBotTemplate(sequelize) {
  const rows = await sequelize.query(
    `SELECT id, streamlit_token FROM game_templates
     WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwanewbot'
     LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const missing = !(rows || []).length;
  const needsToken = rows?.[0] && !String(rows[0].streamlit_token || '').trim();
  if (!missing && !needsToken) return;

  logger.warn('Juwa new bot game template missing or incomplete — applying template self-heal');
  const mig = require('./migrations/20260826130000-ensure-juwa-new-bot-template');
  await mig.up(sequelize.getQueryInterface(), sequelize.Sequelize);
  logger.info('Juwa new bot game template ensured');
}

/**
 * Heal missing Pandamaster new bot template when migration history was repaired/skipped.
 */
async function ensurePandamasterNewBotTemplate(sequelize) {
  const rows = await sequelize.query(
    `SELECT id, streamlit_token FROM game_templates
     WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'pandamaster2'
     LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const missing = !(rows || []).length;
  const needsToken = rows?.[0] && !String(rows[0].streamlit_token || '').trim();
  if (!missing && !needsToken) return;

  logger.warn('Pandamaster new bot game template missing or incomplete — applying template self-heal');
  const mig = require('./migrations/20260831140100-ensure-pandamaster-new-bot-template');
  await mig.up(sequelize.getQueryInterface(), sequelize.Sequelize);
  logger.info('Pandamaster new bot game template ensured');
}

/**
 * Heal missing games.deposit_discount_percent when migration history was
 * bootstrapped/repaired without running 20260907120000.
 */
async function ensureGamesDepositDiscountColumn(sequelize) {
  if (!(await tableExists(sequelize, 'games'))) return;
  await sequelize.query(`
    ALTER TABLE games
    ADD COLUMN IF NOT EXISTS deposit_discount_percent DECIMAL(6,2) NOT NULL DEFAULT 0
  `);
}

async function runMigrations(sequelize) {
  await ensureSettingsTable(sequelize);
  await seedSettingsDefaults(sequelize);

  try {
    const files = listMigrationFiles();
    if (!files.length) return;

    let history = await getMigrationHistory(sequelize);
    const isExistingDb = await tableExists(sequelize, 'users');

    // Live production DBs already have schema — mark all current migrations as done once.
    if (!history.length && isExistingDb) {
      await saveMigrationHistory(sequelize, files);
      logger.info('Bootstrapped migration history for existing database', { count: files.length });
      return;
    }

    const completed = new Set(history);
    let pending = files.filter((file) => !completed.has(file));

    // Failed deploys can leave partial history and re-run dozens of old migrations.
    if (isExistingDb && pending.length > 0) {
      const lastApplied = history.length ? history[history.length - 1] : null;
      const firstPending = pending[0];
      // Only repair when history claims a newer migration ran but an older file is still pending
      // (out-of-order / partial history). Do NOT skip when multiple new files were simply added.
      const looksLikePartialHistory = lastApplied && firstPending <= lastApplied;

      if (looksLikePartialHistory) {
        await saveMigrationHistory(sequelize, files);
        logger.info('Repaired partial migration history on existing database', {
          previous: history.length,
          pendingSkipped: pending.length,
          total: files.length
        });
        return;
      }
    }

    if (!pending.length) {
      logger.info('No pending migrations');
      return;
    }

    logger.info('Running pending migrations', { count: pending.length });

    for (const file of pending) {
      const mod = require(path.join(MIGRATIONS_DIR, file));
      if (typeof mod.up !== 'function') {
        completed.add(file);
        await saveMigrationHistory(sequelize, [...completed].sort());
        continue;
      }

      await sequelize.transaction(async (transaction) => {
        await mod.up(sequelize.getQueryInterface(), sequelize.Sequelize, {
          transaction,
          fromAppMigrations: true
        });
        completed.add(file);
      });
      await saveMigrationHistory(sequelize, [...completed].sort());

      logger.info('Migration applied', { file });
    }
  } finally {
    // Always heal missing schema (even when history bootstrap/repair skips ups).
    await ensureFooterMenusPagesSchema(sequelize);
    await ensureStoreStaffAttendanceSchema(sequelize);
    await ensureGamesDepositDiscountColumn(sequelize);
    await ensureMafiaAgentTemplate(sequelize);
    await ensureMilkywayAgentTemplate(sequelize);
    await ensureJuwaNewBotTemplate(sequelize);
    await ensurePandamasterNewBotTemplate(sequelize);
  }
}

module.exports = { runMigrations };
