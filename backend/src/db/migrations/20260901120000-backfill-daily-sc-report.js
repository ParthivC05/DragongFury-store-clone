'use strict';

/**
 * Grant daily_sc_report to admin/store roles that already have SC coin story or reports.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"daily_sc_report": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'daily_sc_report')
         AND (
           COALESCE((permissions->>'reports')::boolean, false) = true
           OR COALESCE((permissions->>'wallet_sc_reconciliation')::boolean, false) = true
           OR COALESCE((permissions->>'wallet_adjust_report')::boolean, false) = true
           OR COALESCE((permissions->>'bonus_sc_usage')::boolean, false) = true
           OR COALESCE((permissions->>'store_wallet_summary')::boolean, false) = true
         )`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"daily_sc_report": true}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'daily_sc_report')
         AND (
           COALESCE((permissions->>'reports')::boolean, false) = true
           OR COALESCE((permissions->>'wallet_sc_reconciliation')::boolean, false) = true
         )`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'daily_sc_report',
           updated_at = NOW()
       WHERE permissions ? 'daily_sc_report'`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions - 'daily_sc_report',
           updated_at = NOW()
       WHERE permissions ? 'daily_sc_report'`,
      { transaction }
    );
  }
};
