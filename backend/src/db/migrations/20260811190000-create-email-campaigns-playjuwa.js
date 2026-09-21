'use strict';

/**
 * DragonFury no-deposit email campaigns (isolated from other stores).
 * No seed data — admin configures campaigns, codes, and test users.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS email_campaigns (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        name VARCHAR(128) NOT NULL,
        trigger_type VARCHAR(32) NOT NULL DEFAULT 'no_deposit',
        trigger_days INTEGER NOT NULL DEFAULT 3,
        is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        test_mode BOOLEAN NOT NULL DEFAULT TRUE,
        subject VARCHAR(255) NOT NULL DEFAULT '',
        preheader VARCHAR(255) NULL,
        blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
        discount_code VARCHAR(64) NULL,
        discount_value_type VARCHAR(16) NULL,
        discount_value DECIMAL(12, 4) NULL,
        discount_min_deposit DECIMAL(18, 2) NULL,
        discount_max_bonus_cap DECIMAL(18, 2) NULL,
        bonus_code_id INTEGER NULL REFERENCES bonus_codes(id) ON DELETE SET NULL,
        batch_size INTEGER NULL,
        max_per_hour INTEGER NULL,
        claim_token_ttl_days INTEGER NOT NULL DEFAULT 7,
        created_by_user_id INTEGER NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS email_campaigns_store_name_uidx
      ON email_campaigns (store_code, lower(name));
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS email_campaign_test_users (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (campaign_id, user_id)
      );
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS email_campaign_sends (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        mailgun_id VARCHAR(128) NULL,
        error TEXT NULL,
        discount_code_snapshot VARCHAR(64) NULL,
        claim_token VARCHAR(64) NOT NULL,
        claim_status VARCHAR(32) NOT NULL DEFAULT 'unclaimed',
        claimed_at TIMESTAMPTZ NULL,
        code_applied_at TIMESTAMPTZ NULL,
        sent_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (campaign_id, user_id),
        UNIQUE (claim_token)
      );
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS email_campaign_sends_status_idx
      ON email_campaign_sends (campaign_id, status);
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS email_unsubscribes (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS email_unsubscribes_store_email_uidx
      ON email_unsubscribes (store_code, lower(email));
    `);

    await q(`
      UPDATE store_roles
      SET permissions = permissions || '{"email_campaigns": true}'::jsonb,
          updated_at = NOW()
      WHERE LOWER(REGEXP_REPLACE(COALESCE(store_code, ''), '[^a-z0-9]', '', 'g')) = 'dragonfury'
        AND (
          COALESCE((permissions->>'bonus_codes')::boolean, false) = true
          OR COALESCE((permissions->>'blog_posts')::boolean, false) = true
        );
    `);

    await q(`
      UPDATE admin_roles
      SET permissions = permissions || '{"email_campaigns": true}'::jsonb,
          updated_at = NOW()
      WHERE COALESCE((permissions->>'bonus_codes')::boolean, false) = true
         OR COALESCE((permissions->>'blog_posts')::boolean, false) = true;
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS email_campaign_sends;`);
    await q(`DROP TABLE IF EXISTS email_campaign_test_users;`);
    await q(`DROP TABLE IF EXISTS email_unsubscribes;`);
    await q(`DROP TABLE IF EXISTS email_campaigns;`);
  }
};
