'use strict';

const KEY = 'redeem_percentage';
const DEFAULT_VALUE = '15';

/** Seed global redeem win % (last top-up + N% required to redeem from game). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `INSERT INTO settings (key, value, distributor_code, store_code, created_at, updated_at)
       SELECT $1::varchar, $2::text, NULL, NULL, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM settings
         WHERE key = $1::varchar AND distributor_code IS NULL AND store_code IS NULL
       )`,
      { bind: [KEY, DEFAULT_VALUE], transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DELETE FROM settings WHERE key = $1 AND distributor_code IS NULL AND store_code IS NULL`,
      { bind: [KEY], transaction }
    );
  }
};
