'use strict';

/**
 * Add link2play permission key to existing store/admin roles (default false).
 * Full store/master admins (no role id) already receive all keys via full*Permissions().
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions || '{"link2play": false}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'link2play')`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions || '{"link2play": false}'::jsonb,
           updated_at = NOW()
       WHERE permissions IS NOT NULL
         AND NOT (permissions ? 'link2play')`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `UPDATE store_roles
       SET permissions = permissions - 'link2play',
           updated_at = NOW()
       WHERE permissions ? 'link2play'`,
      { transaction }
    );
    await queryInterface.sequelize.query(
      `UPDATE admin_roles
       SET permissions = permissions - 'link2play',
           updated_at = NOW()
       WHERE permissions ? 'link2play'`,
      { transaction }
    );
  }
};
