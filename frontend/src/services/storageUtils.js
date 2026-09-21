const TOKEN_KEY = 'token';

export function getAccessToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(value) {
  if (typeof window === 'undefined') return;
  if (value) {
    localStorage.setItem(TOKEN_KEY, value);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Clears the auth token (e.g. on logout or 401).
 * Does not redirect; caller or AuthContext handles UI state.
 */
export function removeLoginToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

/** Keys preserved on full clear so onboarding UX survives logout (per-user welcome is keyed by id). */
const ONBOARDING_WELCOME_SEEN_PREFIX = 'onboarding_welcome_seen_';

/**
 * Clears ALL localStorage data, except per-user onboarding welcome acknowledgement
 * (so "Welcome to the Platform!" is not shown again on every login).
 */
export function clearAllStorage() {
  if (typeof window === 'undefined') return;
  const preserved = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(ONBOARDING_WELCOME_SEEN_PREFIX)) {
      preserved[key] = localStorage.getItem(key);
    }
  }
  localStorage.clear();
  for (const [key, value] of Object.entries(preserved)) {
    if (value != null) localStorage.setItem(key, value);
  }
}
