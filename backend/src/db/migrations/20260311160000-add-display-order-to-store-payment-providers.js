'use strict';

/**
 * Add display_order to store_payment_providers so store admin can reorder providers.
 * NULL = use global payment_providers.display_order.
 */
const TABLE = 'store_payment_providers';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction: opts.transaction });
    await q(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS display_order SMALLINT NULL`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    await queryInterface.removeColumn(TABLE, 'display_order', { transaction: opts.transaction }).catch(() => {});
  }
};
