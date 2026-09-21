'use strict';

/**
 * Backfill user_transactions from deposit_requests and withdrawal_requests
 * so existing history appears on the transactions page. Runs once.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    const [rows] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM user_transactions`,
      { transaction }
    );
    if (rows && rows[0] && Number(rows[0].count) > 0) return;

    await sequelize.query(
      `INSERT INTO user_transactions (user_id, type, amount, currency_code, description, created_at, updated_at)
       SELECT user_id, 'deposit', amount, 'SC', 'Deposit ' || COALESCE(method, 'test'), created_at, updated_at
       FROM deposit_requests`,
      { transaction }
    );
    await sequelize.query(
      `INSERT INTO user_transactions (user_id, type, amount, currency_code, description, created_at, updated_at)
       SELECT user_id, 'withdraw', amount, 'SC', 'Withdrawal ' || COALESCE(method, 'test'), created_at, updated_at
       FROM withdrawal_requests`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    await sequelize.query(
      `DELETE FROM user_transactions WHERE type IN ('deposit', 'withdraw')`,
      { transaction }
    );
  }
};
