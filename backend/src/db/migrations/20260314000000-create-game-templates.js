'use strict';

/**
 * Creates game_templates table. Stores per-game provider credentials (streamlit token, bot base URL, game link)
 * so admins/partners can add games by selecting from dropdown without entering tokens or URLs.
 * Populate via SQL or a future admin UI; no secrets in env per game.
 */
const TABLE = 'game_templates';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) =>
      queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        game_key VARCHAR(64) NOT NULL,
        streamlit_token VARCHAR(512),
        bot_base_url VARCHAR(512),
        game_link VARCHAR(512),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS game_templates_is_active_idx ON ${TABLE}(is_active)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
