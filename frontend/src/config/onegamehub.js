'use strict';

/**
 * Soft client flag. Real availability comes from backend /api/onegamehub/status + games fetch.
 */
export function getOneGameHubConfig() {
  return { enabled: true };
}

export function isOneGameHubClientEnabled() {
  return true;
}
