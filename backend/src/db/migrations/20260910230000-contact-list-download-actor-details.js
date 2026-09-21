'use strict';

/**
 * Extra snapshot fields so download tracking still shows who exported
 * after the admin account is later changed or removed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [nameCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'contact_list_downloads'
         AND column_name = 'downloaded_by_name'`
    );
    if (!nameCol.length) {
      await queryInterface.addColumn('contact_list_downloads', 'downloaded_by_name', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }
    const [roleCol] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'contact_list_downloads'
         AND column_name = 'downloaded_by_role'`
    );
    if (!roleCol.length) {
      await queryInterface.addColumn('contact_list_downloads', 'downloaded_by_role', {
        type: Sequelize.STRING(64),
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    const qi = queryInterface;
    const [nameCol] = await qi.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'contact_list_downloads'
         AND column_name = 'downloaded_by_name'`
    );
    if (nameCol.length) await qi.removeColumn('contact_list_downloads', 'downloaded_by_name');
    const [roleCol] = await qi.sequelize.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'contact_list_downloads'
         AND column_name = 'downloaded_by_role'`
    );
    if (roleCol.length) await qi.removeColumn('contact_list_downloads', 'downloaded_by_role');
  }
};
