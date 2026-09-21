'use strict';

/**
 * Grant wallet_sc_reconciliation to existing admin (technical staff) roles
 * that already have reports or related wallet/bonus reports.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"wallet_sc_reconciliation": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'wallet_sc_reconciliation')
         AND (
           COALESCE((permissions->>'reports')::boolean, false) = true
           OR COALESCE((permissions->>'wallet_adjust_report')::boolean, false) = true
           OR COALESCE((permissions->>'bonus_sc_usage')::boolean, false) = true
           OR COALESCE((permissions->>'store_wallet_summary')::boolean, false) = true
         )`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"wallet_sc_reconciliation": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'wallet_sc_reconciliation')
         AND LOWER(TRIM(slug)) IN ('technical', 'technical-staff', 'techincal-staff', 'techincal')`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'wallet_sc_reconciliation',
           updated_at = NOW()
       WHERE permissions ? 'wallet_sc_reconciliation'`,
      { transaction }
    );
  }
};
