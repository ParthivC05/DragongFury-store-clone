'use strict';

const TABLE = 'user_device_tokens';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        client VARCHAR(32) NOT NULL DEFAULT 'web',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT user_device_tokens_token_key UNIQUE (token)
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS user_device_tokens_user_id_idx ON ${TABLE}(user_id)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    await queryInterface.dropTable(TABLE, { transaction: opts.transaction });
  }
};
