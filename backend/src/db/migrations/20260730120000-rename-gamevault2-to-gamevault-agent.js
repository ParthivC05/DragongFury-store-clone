'use strict';

/**
 * Rename Game Vault agent integration key: gamevault2 → gamevault_agent
 * on game_templates and games (keeps linked accounts; routing uses game_key).
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET game_key = 'gamevault_agent'
         WHERE LOWER(REPLACE(REPLACE(REPLACE(TRIM(game_key), ' ', ''), '_', ''), '-', '')) IN ('gamevault2', 'gamevaultagent')`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE games
         SET game_key = 'gamevault_agent'
         WHERE LOWER(REPLACE(REPLACE(REPLACE(TRIM(game_key), ' ', ''), '_', ''), '-', '')) IN ('gamevault2', 'gamevaultagent')`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `COMMENT ON COLUMN games.game_key IS 'Integration key (e.g. juwa20 bot, juwa20_agent direct API, gamevault_agent)'`,
        { transaction }
      ).catch(() => {});
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `UPDATE game_templates
         SET game_key = 'gamevault2'
         WHERE LOWER(REPLACE(REPLACE(REPLACE(TRIM(game_key), ' ', ''), '_', ''), '-', '')) = 'gamevaultagent'`,
        { transaction }
      );
      await queryInterface.sequelize.query(
        `UPDATE games
         SET game_key = 'gamevault2'
         WHERE LOWER(REPLACE(REPLACE(REPLACE(TRIM(game_key), ' ', ''), '_', ''), '-', '')) = 'gamevaultagent'`,
        { transaction }
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
