'use strict';

/**
 * GameVault store credentials on games. Idempotent: safe if columns already exist.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [agentCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'agent_id'`
    );
    if (agentCol.length === 0) {
      await queryInterface.addColumn('games', 'agent_id', {
        type: Sequelize.STRING(256),
        allowNull: true,
        comment: 'Store-level agent ID for GameVault external API'
      });
    }

    const [secretCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'api_secret_key'`
    );
    if (secretCol.length === 0) {
      await queryInterface.addColumn('games', 'api_secret_key', {
        type: Sequelize.STRING(512),
        allowNull: true,
        comment: 'Store-level API secret key for GameVault external API'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('games', 'api_secret_key').catch(() => {});
    await queryInterface.removeColumn('games', 'agent_id').catch(() => {});
  }
};
