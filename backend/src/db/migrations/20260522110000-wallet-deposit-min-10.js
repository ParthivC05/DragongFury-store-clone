'use strict';

/** Platform minimum deposit: 10 SC. Updates global wallet_limits only (idempotent). */
const DEPOSIT_MIN = 10;

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    let hasScopeColumns = false;
    if (dialect === 'postgres') {
      const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code' LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      hasScopeColumns = (rows || []).length > 0;
    }

    const whereGlobal = hasScopeColumns
      ? `key = 'wallet_limits' AND distributor_code IS NULL AND store_code IS NULL`
      : `key = 'wallet_limits'`;

    const [existing] = await sequelize.query(
      `SELECT value FROM settings WHERE ${whereGlobal} LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );

    let parsed = {
      depositMin: DEPOSIT_MIN,
      depositMax: 5000,
      withdrawMin: 10,
      withdrawMax: 50,
      withdrawLimitHours: 24
    };
    if (existing?.value) {
      try {
        parsed = { ...parsed, ...JSON.parse(existing.value), depositMin: DEPOSIT_MIN };
      } catch (_) {
        parsed.depositMin = DEPOSIT_MIN;
      }
    }

    const value = JSON.stringify(parsed);

    if (hasScopeColumns) {
      await sequelize.query(
        `UPDATE settings SET value = $1::TEXT, updated_at = NOW() WHERE ${whereGlobal}`,
        { bind: [value], transaction }
      );
      await sequelize.query(
        `INSERT INTO settings (key, distributor_code, store_code, value, created_at, updated_at)
         SELECT 'wallet_limits', NULL, NULL, $1::TEXT, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM settings WHERE ${whereGlobal})`,
        { bind: [value], transaction }
      );
    } else {
      await sequelize.query(
        `INSERT INTO settings (key, value, created_at, updated_at) VALUES ('wallet_limits', $1, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        { bind: [value], transaction }
      );
    }
  },

  async down() {}
};
