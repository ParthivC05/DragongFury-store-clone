'use strict';

const TABLE = 'vip_levels';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS vip_wheel_name`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS vip_wheel_name VARCHAR(64) NOT NULL DEFAULT ''`,
      { transaction }
    );
  }
};
