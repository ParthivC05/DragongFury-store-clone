'use strict';

const STATE_TABLE = 'vip_user_state';
const LEDGER_TABLE = 'vip_ledger';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
        user_id INTEGER NOT NULL PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
        vip_level_index INTEGER NOT NULL DEFAULT 0,
        vip_xp DECIMAL(18,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        entry_type VARCHAR(32) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        currency_code VARCHAR(10) NOT NULL DEFAULT 'SC',
        idempotency_key VARCHAR(255),
        reference_type VARCHAR(64),
        reference_id VARCHAR(128),
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS vip_ledger_user_id_idx ON ${LEDGER_TABLE}(user_id)`);
    await q(`CREATE INDEX IF NOT EXISTS vip_ledger_user_created_idx ON ${LEDGER_TABLE}(user_id, created_at)`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS vip_ledger_idempotency_key ON ${LEDGER_TABLE}(idempotency_key) WHERE idempotency_key IS NOT NULL`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    await queryInterface.dropTable(LEDGER_TABLE, { transaction: opts.transaction });
    await queryInterface.dropTable(STATE_TABLE, { transaction: opts.transaction });
  }
};
