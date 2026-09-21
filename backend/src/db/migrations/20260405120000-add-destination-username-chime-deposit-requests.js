'use strict';

/** Which store Chime receive account the player was instructed to pay (uniform pick from store config). */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'chime_deposit_requests' AND column_name = 'destination_username'`
    );
    if (cols.length > 0) return;

    await queryInterface.addColumn('chime_deposit_requests', 'destination_username', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('chime_deposit_requests', 'destination_username');
  }
};
