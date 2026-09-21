'use strict';

const KEY = 'new_user_deposit_bonus_settings';

const DEFAULT_VALUE = JSON.stringify({
  enabled: true,
  expiryHours: 24,
  applyToAllStores: true,
  storeCodes: [],
  tiers: [
    {
      depositNumber: 1,
      enabled: true,
      bonusType: 'percentage',
      bonusValue: 10,
      minTriggerAmount: 0,
      maxBonusCap: null,
      title: '1st Deposit Bonus'
    },
    {
      depositNumber: 2,
      enabled: true,
      bonusType: 'percentage',
      bonusValue: 30,
      minTriggerAmount: 0,
      maxBonusCap: null,
      title: '2nd Deposit Bonus'
    },
    {
      depositNumber: 3,
      enabled: true,
      bonusType: 'percentage',
      bonusValue: 70,
      minTriggerAmount: 0,
      maxBonusCap: null,
      title: '3rd Deposit Bonus'
    }
  ]
});

/** Seed global new-user deposit bonus settings (1st 10%, 2nd 30%, 3rd 70%, 24h window). */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `INSERT INTO settings (key, value, distributor_code, store_code, created_at, updated_at)
       SELECT $1::varchar, $2::text, NULL, NULL, NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM settings
         WHERE key = $1::varchar AND distributor_code IS NULL AND store_code IS NULL
       )`,
      { bind: [KEY, DEFAULT_VALUE], transaction }
    );
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `DELETE FROM settings WHERE key = $1 AND distributor_code IS NULL AND store_code IS NULL`,
      { bind: [KEY], transaction }
    );
  }
};
