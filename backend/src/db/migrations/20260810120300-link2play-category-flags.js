'use strict';

/**
 * Upgrade link2play_games from early drafts (category / required image_url)
 * to is_popular + is_live checkboxes and nullable image_url.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    // Add new category flags if missing
    await q(`
      ALTER TABLE link2play_games
        ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await q(`
      ALTER TABLE link2play_games
        ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT TRUE
    `);

    // Migrate from legacy single category column when present
    await q(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'link2play_games' AND column_name = 'category'
        ) THEN
          UPDATE link2play_games
          SET
            is_popular = (LOWER(TRIM(category)) = 'popular'),
            is_live = TRUE
          WHERE category IS NOT NULL;

          ALTER TABLE link2play_games DROP COLUMN category;
        END IF;
      END $$;
    `);

    // Drop old category check if it still exists
    await q(`
      ALTER TABLE link2play_games
        DROP CONSTRAINT IF EXISTS link2play_games_category_chk
    `);

    // Ensure at least one category flag is true
    await q(`
      ALTER TABLE link2play_games
        ADD CONSTRAINT link2play_games_category_chk
        CHECK (is_popular = TRUE OR is_live = TRUE)
    `);

    // Allow uploading images later via admin
    await q(`
      ALTER TABLE link2play_games
        ALTER COLUMN image_url DROP NOT NULL
    `);

    // Drop legacy sort column if an early draft had it
    await q(`
      ALTER TABLE link2play_games
        DROP COLUMN IF EXISTS sort_order
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS link2play_games_store_flags_idx
      ON link2play_games (store_code, is_popular, is_live)
    `);

    // Seed missing hardcoded games (no images)
    await q(`
      INSERT INTO link2play_games
        (store_code, name, image_url, is_popular, is_live, link_web, link_android, link_ios, is_active)
      SELECT v.store_code, v.name, NULL, v.is_popular, v.is_live, v.link_web, v.link_android, v.link_ios, TRUE
      FROM (VALUES
        ('dragonfury', 'Golden Dragon', TRUE, TRUE,
          'https://www.playgd.mobi/SSLobby/m4488.0/web-mobile/index.html',
          'https://www.playgd.mobi/SSLobby/m4488.0/web-mobile/index.html',
          'https://www.playgd.mobi/SSLobby/m4488.0/web-mobile/index.html'),
        ('dragonfury', 'Firekirin', TRUE, TRUE,
          'https://start.firekirin.xyz:8580/index.html',
          'https://start.firekirin.xyz:8580/index.html',
          'https://start.firekirin.xyz:8580/index.html'),
        ('dragonfury', 'Juwa', TRUE, TRUE,
          'https://dl.juwa777.com/',
          'https://dl.juwa777.com/',
          'https://dl.juwa777.com/'),
        ('dragonfury', 'VegasX', FALSE, TRUE,
          'https://vegas-x.org/',
          'https://vegas-x.org/',
          'https://vegas-x.org/'),
        ('dragonfury', 'Riversweeps', FALSE, TRUE,
          'https://river777.net/', NULL, NULL),
        ('dragonfury', 'Vblink / Vpower', FALSE, TRUE,
          'https://www.vblink777.club/',
          'https://www.vblink777.club/',
          'https://www.vblink777.club/'),
        ('dragonfury', 'Ultra Panda', FALSE, TRUE,
          'https://www.ultrapanda.mobi/',
          'https://www.ultrapanda.mobi/', NULL),
        ('dragonfury', 'Orionstar', FALSE, TRUE,
          'http://start.orionstars.vip:8580/index.html',
          'http://start.orionstars.vip:8580/index.html',
          'http://start.orionstars.vip:8580/index.html'),
        ('dragonfury', 'Game Vault', FALSE, TRUE,
          'https://download.gamevault999.com/',
          'https://download.gamevault999.com/', NULL),
        ('dragonfury', 'Milkyway', FALSE, TRUE,
          'https://milkywayapp.xyz/',
          'https://milkywayapp.xyz/',
          'https://milkywayapp.xyz/'),
        ('dragonfury', 'Egame', FALSE, TRUE,
          'https://www.egame99.club/',
          'https://www.egame99.club/',
          'https://www.egame99.club/'),
        ('dragonfury', 'Grand Sweeps', FALSE, TRUE,
          'http://grandsweeps.xyz:8580/index.html',
          'http://grandsweeps.xyz:8580/index.html', NULL),
        ('dragonfury', 'Panda Master', FALSE, TRUE,
          'https://pandamaster.vip:8888/index.html',
          'https://pandamaster.vip:8888/index.html',
          'https://pandamaster.vip:8888/index.html'),
        ('dragonfury', 'Vegas Sweeps', FALSE, TRUE,
          'https://m.lasvegassweeps.com/', NULL, NULL),
        ('dragonfury', 'Cash Machine', FALSE, TRUE,
          'https://www.cashmachine777.com/',
          'https://www.cashmachine777.com/',
          'https://www.cashmachine777.com/'),
        ('dragonfury', 'River Monster', FALSE, TRUE,
          'https://www.rm777.net/',
          'https://www.rm777.net/', NULL)
      ) AS v(store_code, name, is_popular, is_live, link_web, link_android, link_ios)
      WHERE NOT EXISTS (
        SELECT 1 FROM link2play_games g
        WHERE g.store_code = 'dragonfury' AND g.name = v.name
      )
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      ALTER TABLE link2play_games
        ADD COLUMN IF NOT EXISTS category VARCHAR(32) NOT NULL DEFAULT 'live'
    `);
    await q(`
      UPDATE link2play_games
      SET category = CASE WHEN is_popular THEN 'popular' ELSE 'live' END
    `);
    await q(`ALTER TABLE link2play_games DROP CONSTRAINT IF EXISTS link2play_games_category_chk`);
    await q(`ALTER TABLE link2play_games DROP COLUMN IF EXISTS is_popular`);
    await q(`ALTER TABLE link2play_games DROP COLUMN IF EXISTS is_live`);
  }
};
