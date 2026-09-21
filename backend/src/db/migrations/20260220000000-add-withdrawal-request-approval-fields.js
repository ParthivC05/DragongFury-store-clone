'use strict';

/** Add fields for pending withdrawal request flow: linked account, reason, rejection, etc. Idempotent: uses IF NOT EXISTS. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    const table = 'withdrawal_requests';
    await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS linked_account_id VARCHAR(255)`);
    await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS currency VARCHAR(8)`);
    await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS reason TEXT`);
    await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS routing_type VARCHAR(64)`);
    await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS game_name VARCHAR(255)`);
    await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS game_username VARCHAR(255)`);
    await q(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const table = 'withdrawal_requests';
    const remove = (col) => queryInterface.removeColumn(table, col, { transaction }).catch(() => {});
    await remove('linked_account_id');
    await remove('currency');
    await remove('reason');
    await remove('routing_type');
    await remove('game_name');
    await remove('game_username');
    await remove('rejection_reason');
  }
};
