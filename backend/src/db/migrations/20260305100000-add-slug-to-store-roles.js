'use strict';

/** Add slug to store_roles. Unique per store (distributor_code, store_code, slug). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const [cols] = await queryInterface.sequelize.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_roles' AND column_name = 'slug'`,
      { transaction }
    );
    if (cols && cols.length) return;

    await queryInterface.addColumn(
      'store_roles',
      'slug',
      { type: Sequelize.STRING(64), allowNull: true },
      { transaction }
    );

    let rowQuery = `SELECT id, name FROM store_roles`;
    try {
      const [hasPlatformCol] = await queryInterface.sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'store_roles' AND column_name = 'platform_role_id'`,
        { transaction }
      );
      if (hasPlatformCol && hasPlatformCol.length) rowQuery = `SELECT id, distributor_code, store_code, platform_role_id, name FROM store_roles`;
    } catch (_) {}
    const [rows] = await queryInterface.sequelize.query(rowQuery, { transaction });

    let platformSlugById = {};
    try {
      const [platformRows] = await queryInterface.sequelize.query(
        `SELECT id, slug FROM platform_roles`,
        { transaction }
      );
      (platformRows || []).forEach((r) => { platformSlugById[r.id] = r.slug || ''; });
    } catch (_) {}

    const usedSlugs = new Set();
    for (const row of rows || []) {
      let slug = null;
      if (row.platform_role_id && platformSlugById[row.platform_role_id]) {
        slug = platformSlugById[row.platform_role_id];
      } else if (row.name) {
        slug = String(row.name).toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 64) || '';
        if (!slug) slug = `role_${row.id}`;
      } else {
        slug = `role_${row.id}`;
      }
      if (usedSlugs.has(slug)) slug = `${slug}_${row.id}`;
      usedSlugs.add(slug);
      await queryInterface.sequelize.query(
        `UPDATE store_roles SET slug = :slug WHERE id = :id`,
        { replacements: { slug: String(slug).slice(0, 64), id: row.id }, transaction }
      );
    }

    await queryInterface.sequelize.query(
      `ALTER TABLE store_roles ALTER COLUMN slug SET NOT NULL`,
      { transaction }
    );

    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS store_roles_dist_store_slug_key ON store_roles (distributor_code, store_code, slug)`,
      { transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS store_roles_dist_store_slug_key',
      { transaction }
    );
    await queryInterface.removeColumn('store_roles', 'slug', { transaction });
  }
};
