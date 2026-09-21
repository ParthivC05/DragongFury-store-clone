'use strict';

/** Seed default spin_wheel_settings in settings table. */

const DEFAULT_SPIN_WHEEL_SETTINGS = {
  segments: [
    { type: 'sc_coins', value: 2, label: '2 SC', color: '#9b59b6', probability: 5 },
    { type: 'sc_coins', value: 3, label: '3 SC', color: '#3498db', probability: 1 },
    { type: 'free_spin', value: 1, label: '1 Free Spin', color: '#e91e63', probability: 1 },
    { type: 'sc_coins', value: 1, label: '1 SC', color: '#1a5276', probability: 15 },
    { type: 'no_win', value: 0, label: 'No Win', color: '#e74c3c', probability: 40 },
    { type: 'free_spin', value: 10, label: '10 Free Spins', color: '#f39c12', probability: 0 },
    { type: 'sc_coins', value: 10, label: '10 SC', color: '#27ae60', probability: 1 },
    { type: 'no_win', value: 0, label: 'No Win', color: '#8e44ad', probability: 37 }
  ],
  probabilityOverrides: [
    {
      whenFreeSpinsAtLeast: 10,
      segmentProbabilities: { '0': 5, '1': 0, '2': 0, '3': 10, '4': 45, '5': 0, '6': 0, '7': 40 }
    }
  ]
};

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    let whereClause = "key = 'spin_wheel_settings'";
    if (dialect === 'postgres') {
      const [colRows] = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'distributor_code' LIMIT 1`,
        { transaction }
      );
      if ((colRows || []).length > 0) {
        whereClause = "key = 'spin_wheel_settings' AND distributor_code IS NULL AND store_code IS NULL";
      }
    }
    const [rows] = await sequelize.query(
      `SELECT id FROM settings WHERE ${whereClause}`,
      { transaction }
    );
    if (rows && rows.length > 0) return;
    const value = JSON.stringify(DEFAULT_SPIN_WHEEL_SETTINGS);
    if (whereClause.includes('distributor_code')) {
      await sequelize.query(
        `INSERT INTO settings (key, distributor_code, store_code, value, created_at, updated_at) VALUES ('spin_wheel_settings', NULL, NULL, $1, NOW(), NOW())`,
        { bind: [value], transaction }
      );
    } else {
      await sequelize.query(
        `INSERT INTO settings (key, value, created_at, updated_at) VALUES ('spin_wheel_settings', $1, NOW(), NOW())`,
        { bind: [value], transaction }
      );
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`DELETE FROM settings WHERE key = 'spin_wheel_settings'`, { transaction }).catch(() => {});
  }
};
