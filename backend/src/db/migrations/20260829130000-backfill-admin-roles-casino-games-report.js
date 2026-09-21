'use strict';

/** Grant Casino games report to technical staff who already have Game Logs or Reports. Store roles stay off. */
module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      UPDATE admin_roles
      SET permissions = permissions || '{"casino_games_report": true}'::jsonb,
          updated_at = NOW()
      WHERE permissions IS NOT NULL
        AND NOT (permissions ? 'casino_games_report')
        AND (
          COALESCE((permissions->>'game_logs')::boolean, false) = true
          OR COALESCE((permissions->>'reports')::boolean, false) = true
        )
    `);
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await q(`
      UPDATE admin_roles
      SET permissions = permissions - 'casino_games_report',
          updated_at = NOW()
      WHERE permissions ? 'casino_games_report'
    `);
  }
};
