'use strict';

/** Off-shift login request statuses. */
const OFF_SHIFT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

/** Login blocked because staff is outside their allocated shift. */
const STAFF_OFF_SHIFT_CODE = 'STAFF_OFF_SHIFT';

/** Session blocked because the allocated shift has ended. */
const STAFF_SHIFT_ENDED_CODE = 'STAFF_SHIFT_ENDED';

/** Default how long an approved off-shift login stays valid. */
const DEFAULT_OFF_SHIFT_VALID_HOURS = 24;
const MIN_OFF_SHIFT_VALID_HOURS = 1;
const MAX_OFF_SHIFT_VALID_HOURS = 72;

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

module.exports = {
  OFF_SHIFT_STATUS,
  STAFF_OFF_SHIFT_CODE,
  STAFF_SHIFT_ENDED_CODE,
  DEFAULT_OFF_SHIFT_VALID_HOURS,
  MIN_OFF_SHIFT_VALID_HOURS,
  MAX_OFF_SHIFT_VALID_HOURS,
  HH_MM_PATTERN
};
