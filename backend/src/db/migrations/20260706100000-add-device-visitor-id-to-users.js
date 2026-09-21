'use strict';

/** One account per device: store Fingerprint visitorId on signup. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'device_visitor_id'`,
      { transaction }
    );
    if (!(cols && cols.length)) {
      await queryInterface.addColumn(
        'users',
        'device_visitor_id',
        {
          type: Sequelize.STRING(64),
          allowNull: true
        },
        { transaction }
      );
    }

    const [indexes] = await queryInterface.sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'users_device_visitor_id_unique'`,
      { transaction }
    );
    if (!(indexes && indexes.length)) {
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX users_device_visitor_id_unique ON users (device_visitor_id) WHERE device_visitor_id IS NOT NULL`,
        { transaction }
      );
    }
  },

  async down(queryInterface, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.removeIndex('users', 'users_device_visitor_id_unique', { transaction }).catch(() => {});
    await queryInterface.removeColumn('users', 'device_visitor_id', { transaction }).catch(() => {});
  }
};
