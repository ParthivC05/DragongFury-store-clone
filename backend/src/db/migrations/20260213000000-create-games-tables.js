'use strict';

/**
 * Idempotent: creates games, user_game_accounts, game_activities if they do not exist.
 * Safe to run on every server start (matches runMigrations pattern).
 */
const GAMES_TABLE = 'games';
const USER_GAME_ACCOUNTS_TABLE = 'user_game_accounts';
const GAME_ACTIVITIES_TABLE = 'game_activities';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql, replacements) =>
      queryInterface.sequelize.query(sql, { transaction, replacements });

    await q(`
      CREATE TABLE IF NOT EXISTS ${GAMES_TABLE} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        image_url VARCHAR(512),
        bot_type VARCHAR(32) NOT NULL,
        bot_api_url VARCHAR(512),
        bot_username VARCHAR(256),
        bot_password VARCHAR(256),
        is_active BOOLEAN NOT NULL DEFAULT true,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${USER_GAME_ACCOUNTS_TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        game_id INTEGER NOT NULL REFERENCES ${GAMES_TABLE}(id),
        bot_username VARCHAR(128),
        bot_password VARCHAR(256),
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, game_id)
      )
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_game_accounts_user_id_game_id_unique ON ${USER_GAME_ACCOUNTS_TABLE}(user_id, game_id)
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS user_game_accounts_user_id_idx ON ${USER_GAME_ACCOUNTS_TABLE}(user_id)
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS user_game_accounts_game_id_idx ON ${USER_GAME_ACCOUNTS_TABLE}(game_id)
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${GAME_ACTIVITIES_TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id),
        game_id INTEGER NOT NULL REFERENCES ${GAMES_TABLE}(id),
        activity_type VARCHAR(32) NOT NULL,
        amount DECIMAL(18, 2),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS game_activities_user_id_idx ON ${GAME_ACTIVITIES_TABLE}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS game_activities_user_created_idx ON ${GAME_ACTIVITIES_TABLE}(user_id, created_at)`);
    await q(`CREATE INDEX IF NOT EXISTS game_activities_game_id_idx ON ${GAME_ACTIVITIES_TABLE}(game_id)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(GAME_ACTIVITIES_TABLE, { transaction });
    await queryInterface.dropTable(USER_GAME_ACCOUNTS_TABLE, { transaction });
    await queryInterface.dropTable(GAMES_TABLE, { transaction });
  }
};
