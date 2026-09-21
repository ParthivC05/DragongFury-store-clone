'use strict';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;

    await queryInterface.createTable(
      'subscriptions',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        distributor_code: { type: Sequelize.STRING(64), allowNull: false },
        name: { type: Sequelize.STRING(255), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        price_display: { type: Sequelize.STRING(64), allowNull: true },
        duration_months: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS subscriptions_distributor_code_idx ON subscriptions (distributor_code)',
      { transaction }
    );

    await queryInterface.createTable(
      'store_subscription_requests',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        distributor_code: { type: Sequelize.STRING(64), allowNull: false },
        store_code: { type: Sequelize.STRING(64), allowNull: false },
        subscription_id: { type: Sequelize.INTEGER, allowNull: false },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'pending' },
        requested_at: { type: Sequelize.DATE, allowNull: false },
        requested_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
        approved_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
        approved_at: { type: Sequelize.DATE, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS store_sub_req_dist_store_idx ON store_subscription_requests (distributor_code, store_code)',
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS store_sub_req_status_idx ON store_subscription_requests (status)',
      { transaction }
    );

    await queryInterface.createTable(
      'store_subscriptions',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        distributor_code: { type: Sequelize.STRING(64), allowNull: false },
        store_code: { type: Sequelize.STRING(64), allowNull: false },
        subscription_id: { type: Sequelize.INTEGER, allowNull: false },
        starts_at: { type: Sequelize.DATE, allowNull: false },
        ends_at: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'active' },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS store_subscriptions_dist_store_active_idx ON store_subscriptions (distributor_code, store_code) WHERE status = \'active\'',
      { transaction }
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS store_subscriptions_dist_store_idx ON store_subscriptions (distributor_code, store_code)',
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable('store_subscriptions', { transaction });
    await queryInterface.dropTable('store_subscription_requests', { transaction });
    await queryInterface.dropTable('subscriptions', { transaction });
  }
};
