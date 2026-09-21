'use strict';

/**
 * Previously inserted/updated every store's affiliate_settings with fixed Give/Get defaults
 * (friendSignupBonusSc/referrerRewardSc 15, min deposit 20, etc.) and set updatedBy: migration.
 *
 * That reset custom store admin amounts on deploy when the migration ran.
 * Amounts must only change via the Affiliate admin UI — not via npm run migrate.
 */
module.exports = {
  async up() {
    // No-op: do not force affiliate_settings values on migrate/deploy.
  },

  async down() {
    // No-op.
  }
};
