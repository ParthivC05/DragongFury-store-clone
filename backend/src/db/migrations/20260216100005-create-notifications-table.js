'use strict';

const NOTIFICATIONS_TABLE = 'notifications';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${NOTIFICATIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        type VARCHAR(64) NOT NULL DEFAULT 'promotion_bonus',
        title VARCHAR(256) NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON ${NOTIFICATIONS_TABLE}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON ${NOTIFICATIONS_TABLE}(user_id, read_at)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    await queryInterface.dropTable(NOTIFICATIONS_TABLE, { transaction: opts.transaction });
  }
};
