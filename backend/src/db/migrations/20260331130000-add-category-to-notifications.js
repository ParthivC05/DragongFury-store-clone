'use strict';

/**
 * Idempotent: matches project pattern (migrations run every startup without SequelizeMeta).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS category VARCHAR(32) NOT NULL DEFAULT 'other'
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS notifications_user_id_category_idx ON notifications (user_id, category)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface
      .removeIndex('notifications', 'notifications_user_id_category_idx', { transaction })
      .catch(() => {});
    await queryInterface.removeColumn('notifications', 'category', { transaction }).catch(() => {});
  }
};
