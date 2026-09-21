'use strict';

/**
 * Link2Play catalog (DragonFury landing page) — admin-managed games with
 * name, Popular/Live flags, platform links. Images are uploaded later via admin.
 */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS link2play_games (
        id SERIAL PRIMARY KEY,
        store_code VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        image_url VARCHAR(1024),
        is_popular BOOLEAN NOT NULL DEFAULT FALSE,
        is_live BOOLEAN NOT NULL DEFAULT TRUE,
        link_web VARCHAR(2048),
        link_android VARCHAR(2048),
        link_ios VARCHAR(2048),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT link2play_games_category_chk
          CHECK (is_popular = TRUE OR is_live = TRUE),
        CONSTRAINT link2play_games_one_link_chk
          CHECK (
            NULLIF(BTRIM(COALESCE(link_web, '')), '') IS NOT NULL
            OR NULLIF(BTRIM(COALESCE(link_android, '')), '') IS NOT NULL
            OR NULLIF(BTRIM(COALESCE(link_ios, '')), '') IS NOT NULL
          )
      )
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS link2play_games_store_active_id_idx
      ON link2play_games (store_code, is_active, id ASC)
    `);

    await q(`
      CREATE INDEX IF NOT EXISTS link2play_games_store_flags_idx
      ON link2play_games (store_code, is_popular, is_live)
    `);

    // Seed all previously hardcoded Link2Play games + links (no images — upload via admin).
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
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS link2play_games`, { transaction });
  }
};
