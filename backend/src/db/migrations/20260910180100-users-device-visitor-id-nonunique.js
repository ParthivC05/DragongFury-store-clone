'use strict';

/**
 * Occupancy is enforced in app code per store. Allowlisted IPs may create
 * multiple accounts on the same device, so device_visitor_id cannot be unique.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`DROP INDEX IF EXISTS users_device_visitor_id_unique`);

    await q(`
      CREATE INDEX IF NOT EXISTS users_device_visitor_id_idx
      ON users (store_code, device_visitor_id)
      WHERE device_visitor_id IS NOT NULL
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`DROP INDEX IF EXISTS users_device_visitor_id_idx`);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_device_visitor_id_unique
      ON users (device_visitor_id)
      WHERE device_visitor_id IS NOT NULL
    `);
  }
};
