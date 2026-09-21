'use strict';

/** Seed default platform roles: Cashier and Operation Manager. Keys must match backend/src/constants/permissions.js STORE_FEATURE_KEYS. Idempotent: skips if slug exists. */
function cashierDefaultPermissions() {
  return { reports: true, transactions: true, recharge: true, withdraw: true, users_list: true };
}

function operationManagerDefaultPermissions() {
  return { spin_wheel: true, vip: true, affiliate: true, games: true, bonus: true, users_list: true, recharge: true, redeem: true };
}

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const cashierPerms = JSON.stringify(cashierDefaultPermissions());
    const opPerms = JSON.stringify(operationManagerDefaultPermissions());
    await queryInterface.sequelize.query(
      `INSERT INTO platform_roles (name, slug, permissions, created_at, updated_at)
       SELECT 'Cashier', 'cashier', $1::jsonb, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM platform_roles WHERE slug = 'cashier')`,
      { bind: [cashierPerms], transaction }
    );
    await queryInterface.sequelize.query(
      `INSERT INTO platform_roles (name, slug, permissions, created_at, updated_at)
       SELECT 'Operation Manager', 'operation_manager', $1::jsonb, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM platform_roles WHERE slug = 'operation_manager')`,
      { bind: [opPerms], transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.bulkDelete('platform_roles', { slug: ['cashier', 'operation_manager'] }, { transaction });
  }
};
