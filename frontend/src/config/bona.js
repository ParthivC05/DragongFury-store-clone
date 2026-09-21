'use strict';

/**
 * Soft client flag. Real availability comes from backend /api/bona/status + games fetch.
 * Always probe; hide Bona UI when status/games fail.
 */
export function getBonaConfig() {
  return { enabled: true };
}

export function isBonaClientEnabled() {
  return true;
}
