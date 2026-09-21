'use strict';

const KEY = 'welcome_signup_bonus_settings';

const SEED_VALUE = JSON.stringify({
  enabled: true,
  amountSc: 10,
  updatedBy: 'migration',
  updatedAt: new Date().toISOString()
});

/**
 * Seed welcome signup bonus for dragonfury + winners4 (enabled, 10 SC).
 * Other stores remain without a row (effective: disabled).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `INSERT INTO settings (key, value, distributor_code, store_code, created_at, updated_at)
       SELECT $1::varchar, $2::text, src.distributor_code, src.store_code, NOW(), NOW()
       FROM (
         SELECT DISTINCT ON (LOWER(TRIM(u.store_code)), COALESCE(u.distributor_code, ''))
           u.distributor_code,
           u.store_code
         FROM users u
         WHERE u.role = 'store_admin'
           AND u.store_role_id IS NULL
           AND u.store_code IS NOT NULL
           AND LOWER(TRIM(u.store_code)) IN ('dragonfury', 'winners4')
         ORDER BY LOWER(TRIM(u.store_code)), COALESCE(u.distributor_code, ''), u.user_id ASC
       ) src
       WHERE NOT EXISTS (
         SELECT 1 FROM settings s
         WHERE s.key = $1::varchar
           AND s.store_code = src.store_code
           AND s.distributor_code IS NOT DISTINCT FROM src.distributor_code
       )`,
      { bind: [KEY, SEED_VALUE], transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DELETE FROM settings
       WHERE key = $1
         AND LOWER(TRIM(store_code)) IN ('dragonfury', 'winners4')`,
      { bind: [KEY], transaction }
    );
  }
};
