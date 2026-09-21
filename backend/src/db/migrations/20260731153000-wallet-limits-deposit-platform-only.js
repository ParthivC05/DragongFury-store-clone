'use strict';

/**
 * Deposit min/max are platform-wide only.
 * Strip depositMin/depositMax from store-scoped wallet_limits rows so they
 * no longer freeze an old value (e.g. 10) after platform is updated (e.g. 9.99).
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    let hasScopeColumns = false;
    if (dialect === 'postgres') {
      const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code'
         LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      hasScopeColumns = (rows || []).length > 0;
    }
    if (!hasScopeColumns) return;

    const storeRows = await sequelize.query(
      `SELECT id, value FROM settings
       WHERE key = 'wallet_limits'
         AND (distributor_code IS NOT NULL OR store_code IS NOT NULL)`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );

    for (const row of storeRows || []) {
      let parsed;
      try {
        parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      } catch (_) {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') continue;
      if (!Object.prototype.hasOwnProperty.call(parsed, 'depositMin')
        && !Object.prototype.hasOwnProperty.call(parsed, 'depositMax')) {
        continue;
      }
      delete parsed.depositMin;
      delete parsed.depositMax;
      await sequelize.query(
        `UPDATE settings SET value = $1::TEXT, updated_at = NOW() WHERE id = $2`,
        { bind: [JSON.stringify(parsed), row.id], transaction }
      );
    }
  },

  async down() {}
};
