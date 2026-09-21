'use strict';

/** Remove platform (default) roles: drop FK and column from store_roles, drop platform_roles table. Only store_admin creates and manages roles. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;

    await queryInterface.sequelize.query(
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_roles_platform_role_id_fkey') THEN
          ALTER TABLE store_roles DROP CONSTRAINT store_roles_platform_role_id_fkey;
        END IF;
      END $$`,
      { transaction }
    );

    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_roles' AND column_name = 'platform_role_id'`,
      { transaction }
    );
    if (cols && cols.length) {
      await queryInterface.removeColumn('store_roles', 'platform_role_id', { transaction });
    }

    await queryInterface.sequelize.query(
      `DROP TABLE IF EXISTS platform_roles`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.createTable(
      'platform_roles',
      {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        name: { type: Sequelize.STRING(128), allowNull: false },
        slug: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      },
      { transaction }
    );
    await queryInterface.addColumn('store_roles', 'platform_role_id', { type: Sequelize.INTEGER, allowNull: true }, { transaction });
    await queryInterface.sequelize.query(
      `ALTER TABLE store_roles ADD CONSTRAINT store_roles_platform_role_id_fkey FOREIGN KEY (platform_role_id) REFERENCES platform_roles(id) ON DELETE SET NULL`,
      { transaction }
    );
  }
};
