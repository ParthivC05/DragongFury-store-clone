'use strict';

/**
 * Previously seeded dragonfury/winners4 affiliate_settings with fixed Give/Get amounts (15/15)
 * and could overwrite existing rows (updatedBy: migration).
 *
 * Affiliate SC amounts are owned by store admins / technical staff in partner-platform-admin.
 * Migrations must not insert or overwrite those values. Give/Get program behavior lives in app code.
 */
module.exports = {
  async up() {
    // No-op: do not force affiliate_settings values on migrate/deploy.
  },

  async down() {
    // No-op.
  }
};
