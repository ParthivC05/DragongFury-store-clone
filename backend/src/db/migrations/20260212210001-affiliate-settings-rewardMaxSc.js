'use strict';

/** Ensure affiliate_settings has rewardMaxSc (add 0 if missing). Targets platform row when distributor_code exists. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    let whereClause = "key = 'affiliate_settings'";
    if (dialect === 'postgres') {
      const [colRows] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code' LIMIT 1`,
        { transaction }
      );
      if ((colRows || []).length > 0) {
        whereClause = "key = 'affiliate_settings' AND distributor_code IS NULL AND store_code IS NULL";
      }
    }
    const [rows] = await sequelize.query(
      `SELECT id, value FROM settings WHERE ${whereClause}`,
      { transaction }
    );
    if (!rows || rows.length === 0) return;
    const row = rows[0];
    let parsed;
    try {
      parsed = JSON.parse(row.value);
    } catch (e) {
      return;
    }
    if (parsed.rewardMaxSc !== undefined) return;
    parsed.rewardMaxSc = 0;
    await sequelize.query(
      `UPDATE settings SET value = $1, updated_at = NOW() WHERE id = $2`,
      { bind: [JSON.stringify(parsed), row.id], transaction }
    );
  },

  async down() {}
};
