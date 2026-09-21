'use strict';

/**
 * DollarPay fields on chime/cashapp/paypal withdrawal requests.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'chime_cashapp_withdrawal_requests';
    const [tables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = '${table}'`
    );
    if (tables.length === 0) return;

    const describe = await queryInterface.describeTable(table);
    if (!describe.payment_provider) {
      await queryInterface.addColumn(table, 'payment_provider', {
        type: Sequelize.STRING(32),
        allowNull: true
      });
    }
    if (!describe.outer_order_sn) {
      await queryInterface.addColumn(table, 'outer_order_sn', {
        type: Sequelize.STRING(64),
        allowNull: true
      });
    }
    if (!describe.provider_transaction_id) {
      await queryInterface.addColumn(table, 'provider_transaction_id', {
        type: Sequelize.STRING(128),
        allowNull: true
      });
    }
    if (!describe.dollarpay_merchant_id) {
      await queryInterface.addColumn(table, 'dollarpay_merchant_id', {
        type: Sequelize.STRING(128),
        allowNull: true
      });
    }
    if (!describe.dollarpay_key_encrypted) {
      await queryInterface.addColumn(table, 'dollarpay_key_encrypted', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    const [indexes] = await queryInterface.sequelize.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = '${table}' AND indexname = 'idx_ccwr_outer_order_sn'`
    );
    if (indexes.length === 0) {
      await queryInterface.addIndex(table, ['outer_order_sn'], { name: 'idx_ccwr_outer_order_sn' });
    }
  },

  async down(queryInterface) {
    const table = 'chime_cashapp_withdrawal_requests';
    const [tables] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = '${table}'`
    );
    if (tables.length === 0) return;

    try {
      await queryInterface.removeIndex(table, 'idx_ccwr_outer_order_sn');
    } catch (_) {}

    const describe = await queryInterface.describeTable(table);
    if (describe.dollarpay_key_encrypted) await queryInterface.removeColumn(table, 'dollarpay_key_encrypted');
    if (describe.dollarpay_merchant_id) await queryInterface.removeColumn(table, 'dollarpay_merchant_id');
    if (describe.provider_transaction_id) await queryInterface.removeColumn(table, 'provider_transaction_id');
    if (describe.outer_order_sn) await queryInterface.removeColumn(table, 'outer_order_sn');
    if (describe.payment_provider) await queryInterface.removeColumn(table, 'payment_provider');
  }
};
