'use strict';

/**
 * Allow more than one daily-bonus campaign per user so stores can loop
 * Day 1–7 after a completed cycle. Claims stay unique per campaign day
 * and still only one claim per UTC date per user.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      UPDATE user_daily_bonus_campaigns c
      SET status = 'completed',
          completed_at = COALESCE(completed_at, NOW()),
          updated_at = NOW()
      WHERE status = 'active'
        AND id NOT IN (
          SELECT keep_id FROM (
            SELECT DISTINCT ON (user_id) id AS keep_id
            FROM user_daily_bonus_campaigns
            WHERE status = 'active'
            ORDER BY user_id, id DESC
          ) newest_active
        )
    `);

    await q(`DROP INDEX IF EXISTS user_daily_bonus_campaigns_user_uidx`);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_campaigns_user_active_uidx
      ON user_daily_bonus_campaigns (user_id)
      WHERE status = 'active'
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS user_daily_bonus_campaigns_user_id_idx
      ON user_daily_bonus_campaigns (user_id, id DESC)
    `);

    await q(`DROP INDEX IF EXISTS user_daily_bonus_claims_user_day_uidx`);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_claims_campaign_day_uidx
      ON user_daily_bonus_claims (campaign_id, day_index)
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      DELETE FROM user_daily_bonus_campaigns
      WHERE id NOT IN (
        SELECT keep_id FROM (
          SELECT DISTINCT ON (user_id) id AS keep_id
          FROM user_daily_bonus_campaigns
          ORDER BY user_id, id DESC
        ) newest
      )
    `);

    await q(`DROP INDEX IF EXISTS user_daily_bonus_claims_campaign_day_uidx`);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_claims_user_day_uidx
      ON user_daily_bonus_claims (user_id, day_index)
    `);

    await q(`DROP INDEX IF EXISTS user_daily_bonus_campaigns_user_active_uidx`);
    await q(`DROP INDEX IF EXISTS user_daily_bonus_campaigns_user_id_idx`);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_daily_bonus_campaigns_user_uidx
      ON user_daily_bonus_campaigns (user_id)
    `);
  }
};
