'use strict';

/**
 * PlayJuwa browser push campaigns: guest-capable device registry,
 * multiple admin campaigns, send/click tracking.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE user_device_tokens
        ALTER COLUMN user_id DROP NOT NULL
    `);
    await q(`
      ALTER TABLE user_device_tokens
        ALTER COLUMN token DROP NOT NULL
    `);

    await q(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN (
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'user_device_tokens'::regclass
            AND contype = 'f'
            AND pg_get_constraintdef(oid) ILIKE '%user_id%'
        ) LOOP
          EXECUTE format('ALTER TABLE user_device_tokens DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);
    await q(`
      ALTER TABLE user_device_tokens
        ADD CONSTRAINT user_device_tokens_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
    `);

    await q(`
      ALTER TABLE user_device_tokens
        ADD COLUMN IF NOT EXISTS device_id VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS permission_status VARCHAR(16) NOT NULL DEFAULT 'default',
        ADD COLUMN IF NOT EXISTS user_agent TEXT NULL,
        ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NULL
    `);

    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_device_tokens_store_device_uidx
      ON user_device_tokens (store_code, device_id)
      WHERE device_id IS NOT NULL AND store_code IS NOT NULL
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS user_device_tokens_push_eligible_idx
      ON user_device_tokens (store_code, permission_status, client)
      WHERE token IS NOT NULL
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS push_campaigns (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        name VARCHAR(128) NOT NULL,
        title VARCHAR(128) NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        image_url TEXT NULL,
        icon_url TEXT NULL,
        action_url VARCHAR(512) NULL,
        test_mode BOOLEAN NOT NULL DEFAULT TRUE,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        created_by_user_id INTEGER NULL,
        last_sent_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await q(`
      CREATE UNIQUE INDEX IF NOT EXISTS push_campaigns_store_name_uidx
      ON push_campaigns (store_code, lower(name))
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS push_campaign_test_users (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (campaign_id, user_id)
      )
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS push_campaign_sends (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES push_campaigns(id) ON DELETE CASCADE,
        device_token_id INTEGER NULL REFERENCES user_device_tokens(id) ON DELETE SET NULL,
        user_id INTEGER NULL REFERENCES users(user_id) ON DELETE SET NULL,
        click_token VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        success_token_count INTEGER NOT NULL DEFAULT 0,
        failure_token_count INTEGER NOT NULL DEFAULT 0,
        error TEXT NULL,
        sent_at TIMESTAMPTZ NULL,
        clicked_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (click_token)
      )
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS push_campaign_sends_campaign_status_idx
      ON push_campaign_sends (campaign_id, status)
    `);
    await q(`
      CREATE INDEX IF NOT EXISTS push_campaign_sends_clicked_idx
      ON push_campaign_sends (campaign_id)
      WHERE clicked_at IS NOT NULL
    `);

    await q(`
      UPDATE store_roles
      SET permissions = permissions || '{"push_campaigns": true}'::jsonb,
          updated_at = NOW()
      WHERE COALESCE((permissions->>'email_campaigns')::boolean, false) = true
         OR COALESCE((permissions->>'bonus_codes')::boolean, false) = true
    `);

    await q(`
      UPDATE admin_roles
      SET permissions = permissions || '{"push_campaigns": true}'::jsonb,
          updated_at = NOW()
      WHERE COALESCE((permissions->>'email_campaigns')::boolean, false) = true
         OR COALESCE((permissions->>'bonus_codes')::boolean, false) = true
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS push_campaign_sends`);
    await q(`DROP TABLE IF EXISTS push_campaign_test_users`);
    await q(`DROP TABLE IF EXISTS push_campaigns`);
    await q(`DROP INDEX IF EXISTS user_device_tokens_store_device_uidx`);
    await q(`DROP INDEX IF EXISTS user_device_tokens_push_eligible_idx`);
  }
};
