'use strict';

/** Welcome deposit packages replace legacy 1st/2nd/3rd deposit bonuses. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE settings
      SET value = (
        COALESCE(value::jsonb, '{}'::jsonb)
        || '{"enabled": false}'::jsonb
      )::text,
      updated_at = NOW()
      WHERE key = 'new_user_deposit_bonus_settings'
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    // No-op: prior enabled state is not restored.
  }
};
