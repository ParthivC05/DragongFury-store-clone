/** Must match frontend GUEST_LANDING_SPIN_WIN_SC. */
const GUEST_LANDING_SPIN_WIN_SC = 1;

/** Guest wins older than this cannot be claimed after signup. */
const GUEST_LANDING_SPIN_CLAIM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

module.exports = {
  GUEST_LANDING_SPIN_WIN_SC,
  GUEST_LANDING_SPIN_CLAIM_MAX_AGE_MS
};
