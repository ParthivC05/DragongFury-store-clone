'use strict';

/**
 * Add columns to payment_pending_deposits for Speed POST /payments flow:
 * target_currency, payment_method, target_amount, payment_request, ttl, raw_provider_response.
 * No Tron — USDT supports lightning, ethereum, solana only.
 */
const TABLE = 'payment_pending_deposits';

const COLUMNS = [
  ['target_currency', 'VARCHAR(32) NULL'],
  ['payment_method', 'VARCHAR(64) NULL'],
  ['target_amount', 'DECIMAL(18, 8) NULL'],
  ['payment_request', 'TEXT NULL'],
  ['ttl', 'INTEGER NULL'],
  ['raw_provider_response', 'JSONB NULL']
];

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    for (const [colName, colDef] of COLUMNS) {
      await q(`
        ALTER TABLE ${TABLE}
        ADD COLUMN IF NOT EXISTS ${colName} ${colDef}
      `);
    }
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const cols = [
      'target_currency',
      'payment_method',
      'target_amount',
      'payment_request',
      'ttl',
      'raw_provider_response'
    ];
    for (const col of cols) {
      await queryInterface.removeColumn(TABLE, col, { transaction }).catch(() => {});
    }
  }
};
