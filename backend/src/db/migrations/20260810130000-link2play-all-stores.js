'use strict';

/**
 * Enable Link2Play for all stores except casinoslots / grandsweeps:
 * - Clone dragonfury catalog (including uploaded S3 images) into other stores
 * - Grant link2play permission on non-excluded store roles that already manage content
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    // Target stores that have a Link2Play user page (exclude casinoslots + grandsweeps).
    await q(`
      INSERT INTO link2play_games (
        store_code, name, image_url, is_popular, is_live,
        link_web, link_android, link_ios, is_active, created_at, updated_at
      )
      SELECT
        t.store_code,
        p.name,
        p.image_url,
        p.is_popular,
        p.is_live,
        p.link_web,
        p.link_android,
        p.link_ios,
        p.is_active,
        NOW(),
        NOW()
      FROM link2play_games p
      CROSS JOIN (
        VALUES
          ('goodwork'),
          ('betgamezone'),
          ('winners4'),
          ('goodgdragon'),
          ('sweepstakebet'),
          ('myvepower')
      ) AS t(store_code)
      WHERE p.store_code = 'dragonfury'
        AND NOT EXISTS (
          SELECT 1
          FROM link2play_games g
          WHERE g.store_code = t.store_code
            AND g.name = p.name
        )
    `);

    // If a target store already has a game name but no image, copy dragonfury image.
    await q(`
      UPDATE link2play_games g
      SET
        image_url = p.image_url,
        updated_at = NOW()
      FROM link2play_games p
      WHERE p.store_code = 'dragonfury'
        AND g.store_code IN (
          'goodwork', 'betgamezone', 'winners4', 'goodgdragon', 'sweepstakebet', 'myvepower'
        )
        AND g.name = p.name
        AND (g.image_url IS NULL OR BTRIM(g.image_url) = '')
        AND p.image_url IS NOT NULL
        AND BTRIM(p.image_url) <> ''
    `);

    // Grant permission to non-excluded store roles that already manage content features.
    await q(`
      UPDATE store_roles
      SET permissions = permissions || '{"link2play": true}'::jsonb,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
        AND LOWER(REGEXP_REPLACE(COALESCE(store_code, ''), '[^a-z0-9]', '', 'g'))
          NOT IN ('casinoslots', 'grandsweeps', 'grandsweep')
        AND (
          COALESCE((permissions->>'blog_posts')::boolean, false) = true
          OR COALESCE((permissions->>'landing_payment_links')::boolean, false) = true
          OR COALESCE((permissions->>'help_content')::boolean, false) = true
          OR COALESCE((permissions->>'link2play')::boolean, false) = true
        )
    `);
  },

  async down() {
    // Keep cloned rows and grants.
  }
};
