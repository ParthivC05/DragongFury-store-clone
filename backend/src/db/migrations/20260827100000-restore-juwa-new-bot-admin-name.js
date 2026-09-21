'use strict';

/**
 * Repair: juwanewbot store games may have been saved as name "Juwa" via store-facing
 * display-name helpers. Admin should show "Juwa new bot"; players still see "Juwa" via API.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE games
       SET name = 'Juwa new bot', updated_at = NOW()
       WHERE LOWER(REPLACE(REPLACE(REPLACE(COALESCE(game_key, ''), ' ', ''), '_', ''), '-', '')) = 'juwanewbot'
         AND TRIM(COALESCE(name, '')) IN ('Juwa', 'juwa')`
    );
  },

  async down() {
    // Non-destructive: leave repaired names in place.
  }
};
