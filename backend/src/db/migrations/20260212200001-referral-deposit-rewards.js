'use strict';

/**
 * Idempotent: create referral_deposit_rewards table and index if they do not exist.
 */
const TABLE = 'referral_deposit_rewards';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        referrer_user_id INTEGER NOT NULL REFERENCES users(user_id),
        referred_user_id INTEGER NOT NULL REFERENCES users(user_id),
        deposit_request_id INTEGER REFERENCES deposit_requests(id),
        amount DECIMAL(18,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS referral_deposit_rewards_referrer_referred
      ON ${TABLE}(referrer_user_id, referred_user_id)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(TABLE, { transaction });
  }
};
