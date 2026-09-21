'use strict';

const TABLE = 'vip_faq';
const CONSTRAINT_NAME = 'vip_faq_question_key';

/** Dedupe FAQ and add unique(question) so seed can use ON CONFLICT. Runs after create-vip-faq-table, before seed. */
module.exports = {
  async up(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

    // Remove duplicate FAQs, keep row with smallest id per question
    await q(`
      DELETE FROM ${TABLE} a
      USING ${TABLE} b
      WHERE a.question = b.question AND a.id > b.id
    `);

    // Add unique on question if not already present (for DBs created before create table had the constraint)
    await q(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON c.conrelid = t.oid
          WHERE c.conname = '${CONSTRAINT_NAME}' AND t.relname = '${TABLE}'
        ) THEN
          ALTER TABLE ${TABLE} ADD CONSTRAINT ${CONSTRAINT_NAME} UNIQUE (question);
        END IF;
      END $$
    `);
  },

  async down(queryInterface, Sequelize, opts = {}) {
    const transaction = opts.transaction;
    await queryInterface.sequelize.query(
      `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}`,
      { transaction }
    );
  }
};
