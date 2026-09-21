'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS bona_user_mappings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        bona_username VARCHAR(64) NOT NULL,
        wallet_initialized BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT bona_user_mappings_user_id_unique UNIQUE (user_id),
        CONSTRAINT bona_user_mappings_bona_username_unique UNIQUE (bona_username)
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS bona_user_mappings_bona_username_idx
      ON bona_user_mappings(bona_username)
    `);

    await q(`
      ALTER TABLE gitslotpark_transactions
      ADD COLUMN IF NOT EXISTS provider VARCHAR(32) NOT NULL DEFAULT 'gitslotpark'
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS gitslotpark_transactions_provider_idx
      ON gitslotpark_transactions(provider)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS gitslotpark_transactions_provider_created_at_idx
      ON gitslotpark_transactions(provider, created_at DESC)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`DROP INDEX IF EXISTS gitslotpark_transactions_provider_created_at_idx`);
    await q(`DROP INDEX IF EXISTS gitslotpark_transactions_provider_idx`);
    await q(`ALTER TABLE gitslotpark_transactions DROP COLUMN IF EXISTS provider`);
    await queryInterface.dropTable('bona_user_mappings', { transaction });
  }
};
