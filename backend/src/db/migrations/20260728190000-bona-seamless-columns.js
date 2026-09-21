'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE bona_user_mappings
      ADD COLUMN IF NOT EXISTS bona_uid VARCHAR(64)
    `);
    await q(`
      ALTER TABLE bona_user_mappings
      ADD COLUMN IF NOT EXISTS last_token VARCHAR(128)
    `);
    await q(`
      ALTER TABLE bona_user_mappings
      ADD COLUMN IF NOT EXISTS wallet_mode INTEGER NOT NULL DEFAULT 2
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS bona_user_mappings_bona_uid_idx
      ON bona_user_mappings(bona_uid)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP INDEX IF EXISTS bona_user_mappings_bona_uid_idx`);
    await q(`ALTER TABLE bona_user_mappings DROP COLUMN IF EXISTS wallet_mode`);
    await q(`ALTER TABLE bona_user_mappings DROP COLUMN IF EXISTS last_token`);
    await q(`ALTER TABLE bona_user_mappings DROP COLUMN IF EXISTS bona_uid`);
  }
};
