'use strict';

const KEY = 'daily_bonus_settings';

const DEFAULT_SPIN_SEGMENTS = [
  { id: 'db1', type: 'sc_coins', value: 1, label: '1 SC', color: '#1a9b6c', probability: 30 },
  { id: 'db2', type: 'sc_coins', value: 2, label: '2 SC', color: '#0d7a52', probability: 25 },
  { id: 'db3', type: 'sc_coins', value: 5, label: '5 SC', color: '#f0b429', probability: 15 },
  { id: 'db4', type: 'no_win', value: 0, label: 'Try Again', color: '#64748b', probability: 30 }
];

const DEFAULT_DAYS = [
  { dayIndex: 1, rewardType: 'sc_coins', amountSc: 5, label: 'Day 1' },
  { dayIndex: 2, rewardType: 'bonus_spin', spinCount: 1, label: 'Day 2' },
  {
    dayIndex: 3,
    rewardType: 'discount_voucher',
    percentOff: 10,
    packageScope: 'all',
    packageIds: [],
    label: 'Day 3'
  },
  { dayIndex: 4, rewardType: 'sc_coins', amountSc: 10, label: 'Day 4' },
  { dayIndex: 5, rewardType: 'bonus_spin', spinCount: 2, label: 'Day 5' },
  {
    dayIndex: 6,
    rewardType: 'discount_voucher',
    percentOff: 15,
    packageScope: 'all',
    packageIds: [],
    label: 'Day 6'
  },
  { dayIndex: 7, rewardType: 'sc_coins', amountSc: 25, label: 'Day 7' }
];

const SEED_VALUE = JSON.stringify({
  enabled: true,
  days: DEFAULT_DAYS,
  spinSegments: DEFAULT_SPIN_SEGMENTS,
  updatedBy: 'migration',
  updatedAt: new Date().toISOString()
});

/**
 * Seed daily bonus settings for dragonfury only (enabled with sample 7-day config).
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
           AND LOWER(REGEXP_REPLACE(TRIM(u.store_code), '[^a-zA-Z0-9]', '', 'g')) = 'dragonfury'
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
      `DELETE FROM settings WHERE key = $1`,
      { bind: [KEY], transaction }
    );
  }
};
