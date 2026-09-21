'use strict';

const NOTIFICATIONS_TABLE = 'notifications';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${NOTIFICATIONS_TABLE}
      ADD COLUMN IF NOT EXISTS action_url VARCHAR(512)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${NOTIFICATIONS_TABLE}
      DROP COLUMN IF EXISTS action_url
    `);
  }
};
