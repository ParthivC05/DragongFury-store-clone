'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'help_content',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        topic: { type: Sequelize.STRING(64), allowNull: false },
        store_code: { type: Sequelize.STRING(64), allowNull: true },
        content: { type: Sequelize.TEXT, allowNull: true },
        video_url: { type: Sequelize.STRING(512), allowNull: true },
        sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS help_content_topic_store_code_uq ON help_content (topic, store_code)',
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS help_content_store_code_idx ON help_content (store_code)',
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('help_content', { transaction });
  }
};
