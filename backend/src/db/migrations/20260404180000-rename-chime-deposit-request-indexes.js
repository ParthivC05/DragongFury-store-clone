'use strict';

/**
 * Renames indexes created as idx_ccdr_* to idx_chime_deposit_requests_* when the table already existed before naming cleanup.
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect?.() || sequelize.options?.dialect;
    if (dialect !== 'postgres') return;

    const pairs = [
      ['idx_ccdr_status', 'idx_chime_deposit_requests_status'],
      ['idx_ccdr_store_code', 'idx_chime_deposit_requests_store_code'],
      ['idx_ccdr_distributor_code', 'idx_chime_deposit_requests_distributor_code'],
      ['idx_ccdr_user_id', 'idx_chime_deposit_requests_user_id']
    ];
    for (const [from, to] of pairs) {
      try {
        await sequelize.query(`ALTER INDEX "${from}" RENAME TO "${to}"`);
      } catch (_) {
        /* already renamed or fresh DB created with new names */
      }
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect?.() || sequelize.options?.dialect;
    if (dialect !== 'postgres') return;

    const pairs = [
      ['idx_chime_deposit_requests_status', 'idx_ccdr_status'],
      ['idx_chime_deposit_requests_store_code', 'idx_ccdr_store_code'],
      ['idx_chime_deposit_requests_distributor_code', 'idx_ccdr_distributor_code'],
      ['idx_chime_deposit_requests_user_id', 'idx_ccdr_user_id']
    ];
    for (const [from, to] of pairs) {
      try {
        await sequelize.query(`ALTER INDEX "${from}" RENAME TO "${to}"`);
      } catch (_) {}
    }
  }
};
