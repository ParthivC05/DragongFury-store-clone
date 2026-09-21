'use strict';

const PROMOTIONS_TABLE = 'promotions';

/** Set first-deposit-bonus to give 5% extra on first deposit (admin can change later). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE ${PROMOTIONS_TABLE}
      SET
        bonus_trigger_type = 'first_deposit',
        bonus_type = 'percentage',
        bonus_value = 5,
        min_trigger_amount = 0,
        max_bonus_cap = NULL,
        description = 'GET 5% EXTRA ON YOUR FIRST TOP-UP. INSTANT BONUS CREDITED TO YOUR BALANCE.'
      WHERE slug = 'first-deposit-bonus'
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE ${PROMOTIONS_TABLE}
      SET
        bonus_trigger_type = NULL,
        bonus_type = NULL,
        bonus_value = NULL,
        min_trigger_amount = NULL,
        max_bonus_cap = NULL,
        description = 'GET 100% EXTRA ON YOUR FIRST TOP-UP. DOUBLE YOUR BALANCE INSTANTLY.'
      WHERE slug = 'first-deposit-bonus'
    `);
  }
};
