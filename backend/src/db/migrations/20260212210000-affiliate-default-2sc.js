'use strict';

/** Set default affiliate reward to 2 SC fixed (first deposit only). Idempotent: works with key-only unique or (key, distributor_code, store_code) unique. */
const NEW_DEFAULT = {
  rewardType: 'fixed',
  rewardPercentage: 0,
  rewardFixedSc: 2,
  maxRewardsPerReferral: 1
};

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    const value = JSON.stringify(NEW_DEFAULT);

    let hasScopeColumns = false;
    if (dialect === 'postgres') {
      const rows = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code' LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      hasScopeColumns = (rows || []).length > 0;
    }

    if (hasScopeColumns) {
      await sequelize.query(
        `UPDATE settings SET value = $1::TEXT, updated_at = NOW()
         WHERE key = 'affiliate_settings' AND distributor_code IS NULL AND store_code IS NULL`,
        { bind: [value], transaction }
      );
      await sequelize.query(
        `INSERT INTO settings (key, distributor_code, store_code, value, created_at, updated_at)
         SELECT 'affiliate_settings', NULL, NULL, $1::TEXT, NOW(), NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM settings WHERE key = 'affiliate_settings' AND distributor_code IS NULL AND store_code IS NULL
         )`,
        { bind: [value], transaction }
      );
    } else {
      await sequelize.query(
        `INSERT INTO settings (key, value, created_at, updated_at) VALUES ('affiliate_settings', $1, NOW(), NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        { bind: [value], transaction }
      );
    }
  },

  async down() {}
};
