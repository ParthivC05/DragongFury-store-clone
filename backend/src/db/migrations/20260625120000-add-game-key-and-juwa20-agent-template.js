'use strict';

/**
 * Store integration key on games (bot vs agent API) and seed Juwa 2.0 Agent API template.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [gameKeyCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'game_key'`
    );
    if (gameKeyCol.length === 0) {
      await queryInterface.addColumn('games', 'game_key', {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'Integration key (e.g. juwa20 bot, juwa20_agent direct API, gamevault2)'
      });
    }

    const [templateIdCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'game_template_id'`
    );
    if (templateIdCol.length === 0) {
      await queryInterface.addColumn('games', 'game_template_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'game_templates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Source game template used when the store added this game'
      });
    }

    // Backfill agent-API games that predate game_key column.
    await queryInterface.sequelize.query(`
      UPDATE games
      SET game_key = 'gamevault2'
      WHERE game_key IS NULL
        AND agent_id IS NOT NULL
        AND api_secret_key IS NOT NULL
        AND LOWER(REPLACE(REPLACE(REPLACE(TRIM(name), ' ', ''), '_', ''), '-', '')) LIKE '%gamevault%2%'
    `);

    const [existing] = await queryInterface.sequelize.query(
      `SELECT id FROM game_templates WHERE LOWER(REPLACE(game_key, ' ', '')) = 'juwa20_agent' LIMIT 1`
    );
    if (!existing.length) {
      await queryInterface.bulkInsert('game_templates', [{
        name: 'Juwa 2.0',
        game_key: 'juwa20_agent',
        streamlit_token: null,
        bot_base_url: 'https://apiinterface.juwa2.xin',
        game_link: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM game_templates WHERE LOWER(REPLACE(game_key, ' ', '')) = 'juwa20_agent'`
    ).catch(() => {});
    await queryInterface.removeColumn('games', 'game_template_id').catch(() => {});
    await queryInterface.removeColumn('games', 'game_key').catch(() => {});
  }
};
