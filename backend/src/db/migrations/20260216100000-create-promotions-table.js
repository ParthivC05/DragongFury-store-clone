'use strict';

const PROMOTIONS_TABLE = 'promotions';

module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    await q(`
      CREATE TABLE IF NOT EXISTS ${PROMOTIONS_TABLE} (
        id SERIAL PRIMARY KEY,
        title VARCHAR(256) NOT NULL,
        slug VARCHAR(128) NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        image VARCHAR(512),
        cta_text VARCHAR(64),
        cta_url VARCHAR(512),
        background_color VARCHAR(32),
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await q(`CREATE INDEX IF NOT EXISTS promotions_is_active_idx ON ${PROMOTIONS_TABLE}(is_active)`);
    await q(`CREATE INDEX IF NOT EXISTS promotions_display_order_idx ON ${PROMOTIONS_TABLE}(display_order)`);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.dropTable(PROMOTIONS_TABLE, { transaction });
  }
};
