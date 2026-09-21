'use strict';

/**
 * DragonFury Gold Coins (GC): optional package GC, play-coin sessions for casino play.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE deposit_packages
      ADD COLUMN IF NOT EXISTS gc_coin DECIMAL(18, 2) NOT NULL DEFAULT 0
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS play_coin_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        provider VARCHAR(32) NOT NULL,
        game_id VARCHAR(64) NOT NULL DEFAULT '',
        coin_type VARCHAR(2) NOT NULL DEFAULT 'SC',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS play_coin_sessions_user_provider_game_uidx
      ON play_coin_sessions (user_id, provider, game_id)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS play_coin_sessions_user_provider_idx
      ON play_coin_sessions (user_id, provider, updated_at DESC)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS play_coin_sessions`);
    await q(`ALTER TABLE deposit_packages DROP COLUMN IF EXISTS gc_coin`);
  }
};
