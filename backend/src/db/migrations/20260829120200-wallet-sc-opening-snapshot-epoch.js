'use strict';

/**
 * Opening snapshots were inserted with NOW(), so they look like "today's credits"
 * instead of starting leftover. Move them to a date before any real activity.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE wallet_sc_ledger
      SET created_at = TIMESTAMPTZ '2020-01-01 00:00:00+00'
      WHERE event_type = 'OPENING_SNAPSHOT'
        AND source_type = 'MIGRATION'
    `);
    await queryInterface.sequelize.query(`
      UPDATE bonus_sc_lots
      SET created_at = TIMESTAMPTZ '2020-01-01 00:00:00+00',
          updated_at = TIMESTAMPTZ '2020-01-01 00:00:00+00'
      WHERE bonus_type = 'LEGACY_BALANCE'
        AND source_type = 'MIGRATION'
    `);
  },

  async down() {}
};
