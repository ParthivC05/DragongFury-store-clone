'use strict';

/**
 * Email campaign send retry fields + attempt logs.
 * Also sets DragonFury campaign max_per_hour to 30 and requeues retryable API failures once.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE email_campaign_sends
        ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS error_class VARCHAR(16) NULL,
        ADD COLUMN IF NOT EXISTS error_code VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NULL,
        ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(32) NULL,
        ADD COLUMN IF NOT EXISTS attempts_log JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS email_campaign_sends_retry_idx
      ON email_campaign_sends (campaign_id, status)
      WHERE status IN ('pending', 'pending_retry');
    `);

    await q(`
      CREATE TABLE IF NOT EXISTS email_campaign_send_attempts (
        id SERIAL PRIMARY KEY,
        send_id INTEGER NOT NULL REFERENCES email_campaign_sends(id) ON DELETE CASCADE,
        attempt_no INTEGER NOT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'api',
        result VARCHAR(32) NOT NULL,
        error TEXT NULL,
        error_code VARCHAR(64) NULL,
        error_class VARCHAR(16) NULL,
        mailgun_id VARCHAR(128) NULL,
        raw JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS email_campaign_send_attempts_send_idx
      ON email_campaign_send_attempts (send_id, attempt_no);
    `);

    // Cap throughput for live DragonFury campaigns.
    await q(`
      UPDATE email_campaigns
      SET max_per_hour = 30,
          batch_size = COALESCE(NULLIF(batch_size, 0), 15),
          updated_at = NOW()
      WHERE store_code = 'dragonfury';
    `);

    // Seed attempt_count / error_class from existing rows.
    await q(`
      UPDATE email_campaign_sends
      SET attempt_count = 1,
          last_attempt_at = COALESCE(sent_at, updated_at, created_at),
          error_class = CASE
            WHEN status = 'sent' THEN NULL
            WHEN status = 'skipped' THEN 'permanent'
            WHEN error ILIKE '%420%'
              OR error ILIKE '%timeout%'
              OR error ILIKE '%ECONN%'
              OR error ILIKE '%ETIMEDOUT%'
              OR error ILIKE '%429%'
              OR error ILIKE '%502%'
              OR error ILIKE '%503%'
              OR error ILIKE '%504%'
              OR lower(error) LIKE '%rate limit%'
              OR lower(error) LIKE '%too many%'
              THEN 'retryable'
            WHEN error IS NULL OR trim(error) = '' THEN 'permanent'
            ELSE 'permanent'
          END,
          error_code = CASE
            WHEN error ILIKE '%420%' THEN '420'
            WHEN error ILIKE '%Unauthorized%' THEN '401'
            WHEN error ILIKE '%Forbidden%' THEN '403'
            ELSE NULL
          END
      WHERE attempt_count = 0
        AND status IN ('sent', 'failed', 'skipped');
    `);

    // One automatic retry for existing retryable API failures (e.g. Mailgun 420).
    await q(`
      UPDATE email_campaign_sends
      SET status = 'pending_retry',
          updated_at = NOW()
      WHERE status = 'failed'
        AND error_class = 'retryable'
        AND attempt_count < max_attempts;
    `);

    // Keep Forbidden/Unauthorized as permanent unless clearly rate-limit related —
    // but allow one retry for those historical API auth blips so ops can recover after key fix.
    await q(`
      UPDATE email_campaign_sends
      SET error_class = 'retryable',
          status = 'pending_retry',
          updated_at = NOW()
      WHERE status = 'failed'
        AND attempt_count < max_attempts
        AND (
          error ILIKE '%Unauthorized%'
          OR error ILIKE '%Forbidden%'
        );
    `);

    // Insert initial attempt log rows for existing failures / sends.
    await q(`
      INSERT INTO email_campaign_send_attempts
        (send_id, attempt_no, source, result, error, error_code, error_class, mailgun_id, created_at)
      SELECT
        s.id,
        GREATEST(1, s.attempt_count),
        'api',
        CASE WHEN s.status = 'sent' THEN 'sent' WHEN s.status = 'skipped' THEN 'skipped' ELSE 'failed' END,
        s.error,
        s.error_code,
        s.error_class,
        s.mailgun_id,
        COALESCE(s.last_attempt_at, s.updated_at, s.created_at)
      FROM email_campaign_sends s
      WHERE s.attempt_count > 0
        AND NOT EXISTS (
          SELECT 1 FROM email_campaign_send_attempts a WHERE a.send_id = s.id
        );
    `);

    await q(`
      UPDATE email_campaign_sends s
      SET attempts_log = COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'attemptNo', a.attempt_no,
            'source', a.source,
            'result', a.result,
            'error', a.error,
            'errorCode', a.error_code,
            'errorClass', a.error_class,
            'mailgunId', a.mailgun_id,
            'at', a.created_at
          ) ORDER BY a.attempt_no ASC, a.id ASC
        )
        FROM email_campaign_send_attempts a
        WHERE a.send_id = s.id
      ), '[]'::jsonb)
      WHERE s.attempt_count > 0;
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
    await q(`DROP TABLE IF EXISTS email_campaign_send_attempts;`);
    await q(`DROP INDEX IF EXISTS email_campaign_sends_retry_idx;`);
    await q(`
      ALTER TABLE email_campaign_sends
        DROP COLUMN IF EXISTS attempt_count,
        DROP COLUMN IF EXISTS max_attempts,
        DROP COLUMN IF EXISTS error_class,
        DROP COLUMN IF EXISTS error_code,
        DROP COLUMN IF EXISTS last_attempt_at,
        DROP COLUMN IF EXISTS delivery_status,
        DROP COLUMN IF EXISTS attempts_log;
    `);
  }
};
