'use strict';

/**
 * Rename amount_sc -> amount in deposit_requests and withdrawal_requests.
 * Backfill NULL amount to 0. Safe to run if column is already "amount".
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const sequelize = queryInterface.sequelize;
    const transaction = opts.transaction;

    for (const table of ['deposit_requests', 'withdrawal_requests']) {
      const [rows] = await sequelize.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ? AND column_name IN ('amount_sc', 'amount')`,
        { replacements: [table], transaction }
      );

      const hasAmountSc = (rows || []).some((r) => r.column_name === 'amount_sc');
      const hasAmount = (rows || []).some((r) => r.column_name === 'amount');

      if (hasAmountSc && !hasAmount) {
        await queryInterface.renameColumn(table, 'amount_sc', 'amount', { transaction });
      } else if (!hasAmount && !hasAmountSc) {
        await queryInterface.addColumn(table, 'amount', {
          type: Sequelize.DECIMAL(18, 2),
          allowNull: false,
          defaultValue: 0
        }, { transaction });
      }

      if (hasAmount || hasAmountSc) {
        await sequelize.query(
          `UPDATE ${table} SET amount = 0 WHERE amount IS NULL`,
          { transaction }
        ).catch(() => {});
        await sequelize.query(
          `ALTER TABLE ${table} ALTER COLUMN amount SET NOT NULL`,
          { transaction }
        ).catch(() => {});
      }
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const sequelize = queryInterface.sequelize;
    const transaction = opts.transaction;

    for (const table of ['deposit_requests', 'withdrawal_requests']) {
      const [rows] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ? AND column_name = 'amount'`,
        { replacements: [table], transaction }
      );
      if (rows && rows.length > 0) {
        await queryInterface.renameColumn(table, 'amount', 'amount_sc', { transaction });
      }
    }
  }
};
