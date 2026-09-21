'use strict';

/**
 * Drop SequelizeMeta when migrations run on app startup (runMigrations.js).
 * Skip when using `npx sequelize-cli db:migrate` so CLI migration history is not wiped mid-run.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    if (!opts.fromAppMigrations) return;

    const sequelize = queryInterface.sequelize;
    const transaction = opts.transaction;
    await sequelize.query(`DROP TABLE IF EXISTS "SequelizeMeta"`, { transaction });
  },

  async down() {}
};
