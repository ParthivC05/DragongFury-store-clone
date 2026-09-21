'use strict';

/** Idempotent: safe if provider_user_id already exists. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [col] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'user_game_accounts' AND column_name = 'provider_user_id'`
    );
    if (col.length === 0) {
      await queryInterface.addColumn('user_game_accounts', 'provider_user_id', {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'Game provider account id (e.g. GameVault addUser user_id)'
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('user_game_accounts', 'provider_user_id').catch(() => {});
  }
};
