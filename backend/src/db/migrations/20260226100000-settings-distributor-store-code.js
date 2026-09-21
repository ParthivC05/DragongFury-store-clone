'use strict';

/**
 * Add distributor_code and store_code to settings for proper scoping.
 * Platform (global) settings: distributor_code and store_code are NULL.
 * Store overrides: key = 'spin_wheel_settings', distributor_code = X, store_code = Y.
 * Migrate existing spin_wheel_s:dist:store rows to new format, then drop key uniqueness
 * and add unique (key, distributor_code, store_code).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    // Idempotent: skip if already applied (columns and index exist)
    if (dialect === 'postgres') {
      const [colRows] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code' LIMIT 1`,
        { transaction }
      );
      if ((colRows || []).length > 0) {
        const [idxRows] = await sequelize.query(
          `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'settings' AND indexname = 'settings_key_dist_store_uq' LIMIT 1`,
          { transaction }
        );
        if ((idxRows || []).length > 0) return;
      }
    }

    // 1) Add columns (skip if exist)
    if (dialect === 'postgres') {
      const [hasDist] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code' LIMIT 1`,
        { transaction }
      );
      if (!(hasDist || []).length) {
        await queryInterface.addColumn(
          'settings',
          'distributor_code',
          { type: Sequelize.STRING(64), allowNull: true },
          { transaction }
        );
      }
      const [hasStore] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'store_code' LIMIT 1`,
        { transaction }
      );
      if (!(hasStore || []).length) {
        await queryInterface.addColumn(
          'settings',
          'store_code',
          { type: Sequelize.STRING(64), allowNull: true },
          { transaction }
        );
      }
    } else {
      await queryInterface.addColumn(
        'settings',
        'distributor_code',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction }
      ).catch(() => {});
      await queryInterface.addColumn(
        'settings',
        'store_code',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction }
      ).catch(() => {});
    }

    // 2) Set existing rows to NULL (platform scope)
    await sequelize.query(
      `UPDATE settings SET distributor_code = NULL, store_code = NULL WHERE distributor_code IS NULL AND store_code IS NULL`,
      { transaction }
    );

    // 3) Drop unique on key BEFORE inserting store rows (so we can have multiple rows with same key, different scope)
    if (dialect === 'postgres') {
      await sequelize.query(
        `ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_key`,
        { transaction }
      ).catch(() => {});
    } else {
      await queryInterface.removeConstraint('settings', 'settings_key_key', { transaction }).catch(() => {});
    }

    // 4) Migrate spin_wheel_s:dist:store rows to new format
    const [oldRows] = await sequelize.query(
      `SELECT id, key, value FROM settings WHERE key LIKE 'spin_wheel_s:%'`,
      { transaction }
    );
    const prefix = 'spin_wheel_s:';
    for (const row of oldRows || []) {
      const key = row.key || '';
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const parts = rest.split(':');
      const distributorCode = parts[0] || null;
      const storeCode = parts.length > 1 ? parts.slice(1).join(':') : null;
      await sequelize.query(
        `INSERT INTO settings (key, distributor_code, store_code, value, created_at, updated_at)
         VALUES ('spin_wheel_settings', :distCode, :storeCode, :value, NOW(), NOW())`,
        {
          replacements: { distCode: distributorCode, storeCode, value: row.value },
          transaction
        }
      );
      await sequelize.query(`DELETE FROM settings WHERE id = :id`, {
        replacements: { id: row.id },
        transaction
      });
    }

    // 5) Add unique on (key, distributor_code, store_code) using COALESCE so one platform row (null, null)
    if (dialect === 'postgres') {
      await sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS settings_key_dist_store_uq ON settings (key, COALESCE(distributor_code, ''), COALESCE(store_code, ''))`,
        { transaction }
      );
    } else {
      try {
        await queryInterface.addIndex('settings', ['key', 'distributor_code', 'store_code'], {
          unique: true,
          name: 'settings_key_dist_store_uq',
          transaction
        });
      } catch (e) {
        if (!/already exists/i.test(e.message)) throw e;
      }
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;

    // Migrate store rows back to spin_wheel_s:dist:store keys
    const [rows] = await sequelize.query(
      `SELECT id, key, distributor_code, store_code, value FROM settings WHERE key = 'spin_wheel_settings' AND (distributor_code IS NOT NULL OR store_code IS NOT NULL)`,
      { transaction }
    );
    for (const row of rows || []) {
      const dist = row.distributor_code || '';
      const store = row.store_code || '';
      const oldKey = `spin_wheel_s:${dist}:${store}`.replace(/:$/, '');
      await sequelize.query(
        `INSERT INTO settings (key, value, created_at, updated_at) VALUES (:key, :value, NOW(), NOW())`,
        { replacements: { key: oldKey, value: row.value }, transaction }
      );
      await sequelize.query(`DELETE FROM settings WHERE id = :id`, {
        replacements: { id: row.id },
        transaction
      });
    }

    if (sequelize.getDialect() === 'postgres') {
      await sequelize.query(`DROP INDEX IF EXISTS settings_key_dist_store_uq`, { transaction }).catch(() => {});
    } else {
      await queryInterface.removeIndex('settings', 'settings_key_dist_store_uq', { transaction }).catch(() => {});
    }
    await queryInterface.addConstraint('settings', {
      fields: ['key'],
      type: 'unique',
      name: 'settings_key_key',
      transaction
    }).catch(() => {});

    await queryInterface.removeColumn('settings', 'distributor_code', { transaction });
    await queryInterface.removeColumn('settings', 'store_code', { transaction });
  }
};
