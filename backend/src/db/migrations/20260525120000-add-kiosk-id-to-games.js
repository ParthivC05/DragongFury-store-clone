'use strict';

/** Golden Dragon: store POS kiosk id (7 digits) for add-client and credential updates. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE games
      ADD COLUMN IF NOT EXISTS kiosk_id VARCHAR(16)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('games', 'kiosk_id', { transaction }).catch(() => {});
  }
};
