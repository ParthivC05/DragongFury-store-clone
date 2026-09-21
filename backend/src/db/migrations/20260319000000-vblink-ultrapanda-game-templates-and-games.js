'use strict';

/**
 * Vblink / UltraPanda / Egame99 support:
 * - game_templates: allow game_key and streamlit_token to be null (for these games admin only sets name, bot_base_url, game_link).
 * - games: add app_id and app_secret for store-level credentials (store partner enters these when adding Vblink/UltraPanda/Egame99).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    // game_templates: make game_key and streamlit_token nullable
    await q(`
      ALTER TABLE game_templates
        ALTER COLUMN game_key DROP NOT NULL
    `);
    await q(`
      ALTER TABLE game_templates
        ALTER COLUMN streamlit_token DROP NOT NULL
    `);

    // games: add app_id and app_secret
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'games' AND column_name IN ('app_id', 'app_secret')`,
      { transaction }
    );
    const hasAppId = cols.some((c) => c.column_name === 'app_id');
    const hasAppSecret = cols.some((c) => c.column_name === 'app_secret');
    if (!hasAppId) {
      await queryInterface.addColumn('games', 'app_id', { type: Sequelize.STRING(256), allowNull: true }, { transaction });
    }
    if (!hasAppSecret) {
      await queryInterface.addColumn('games', 'app_secret', { type: Sequelize.STRING(512), allowNull: true }, { transaction });
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeColumn('games', 'app_secret', { transaction });
    await queryInterface.removeColumn('games', 'app_id', { transaction });
    await queryInterface.sequelize.query(
      `ALTER TABLE game_templates ALTER COLUMN game_key SET NOT NULL, ALTER COLUMN streamlit_token SET NOT NULL`,
      { transaction }
    ).catch(() => {});
  }
};
