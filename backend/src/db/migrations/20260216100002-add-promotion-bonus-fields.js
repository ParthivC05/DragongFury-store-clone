'use strict';

const PROMOTIONS_TABLE = 'promotions';
const USER_PROMOTION_BONUSES_TABLE = 'user_promotion_bonuses';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE ${PROMOTIONS_TABLE}
        ADD COLUMN IF NOT EXISTS bonus_trigger_type VARCHAR(64),
        ADD COLUMN IF NOT EXISTS bonus_type VARCHAR(16),
        ADD COLUMN IF NOT EXISTS bonus_value DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS min_trigger_amount DECIMAL(18,2),
        ADD COLUMN IF NOT EXISTS max_bonus_cap DECIMAL(18,2)
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS ${USER_PROMOTION_BONUSES_TABLE} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
        reference_type VARCHAR(16) NOT NULL,
        reference_id INTEGER NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, promotion_id, reference_type, reference_id)
      )
    `);
    await q(`CREATE INDEX IF NOT EXISTS user_promotion_bonuses_user_promotion_idx ON ${USER_PROMOTION_BONUSES_TABLE}(user_id, promotion_id)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await queryInterface.dropTable(USER_PROMOTION_BONUSES_TABLE, { transaction });

    await q(`
      ALTER TABLE ${PROMOTIONS_TABLE}
        DROP COLUMN IF EXISTS bonus_trigger_type,
        DROP COLUMN IF EXISTS bonus_type,
        DROP COLUMN IF EXISTS bonus_value,
        DROP COLUMN IF EXISTS min_trigger_amount,
        DROP COLUMN IF EXISTS max_bonus_cap
    `);
  }
};
