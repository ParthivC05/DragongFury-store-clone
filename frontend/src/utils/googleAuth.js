import { isFingerprintEnabled, getFingerprintIdentification } from '../lib/fingerprint/client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const GOOGLE_REDIRECT_PATH = '/auth/google/callback';
export const GOOGLE_AUTH_STATE_KEY = 'googleAuthPending';
export const GOOGLE_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;
export const GOOGLE_SIGNIN_WATCHDOG_MS = 90 * 1000;

export function getGoogleRedirectUri() {
  return `${window.location.origin}${GOOGLE_REDIRECT_PATH}`;
}

/** In-app browsers (Instagram, Facebook, etc.) often break Google iframe sign-in. */
export function isInAppBrowser() {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|TikTok|Twitter|Line\/|Snapchat|LinkedInApp|WhatsApp/i.test(ua);
}

export function isMobileTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
  const narrowViewport = window.matchMedia?.('(max-width: 768px)')?.matches;
  return Boolean(
    coarsePointer ||
      narrowViewport ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
  );
}

/**
 * Prefer the same GSI button / ID-token flow on mobile as desktop (faster).
 * Redirect OAuth is kept for emergencies but not used by default — it adds a
 * full Google round-trip and requires extra Authorized redirect URIs.
 */
export function shouldUseGoogleRedirectSignIn() {
  return false;
}

function writeStorage(storage, payload) {
  try {
    storage.setItem(
      GOOGLE_AUTH_STATE_KEY,
      JSON.stringify({
        ...payload,
        savedAt: Date.now()
      })
    );
    return true;
  } catch (_) {
    return false;
  }
}

function readStorage(storage) {
  try {
    const raw = storage.getItem(GOOGLE_AUTH_STATE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.state || Date.now() - (data.savedAt || 0) > GOOGLE_CALLBACK_TIMEOUT_MS) {
      try {
        storage.removeItem(GOOGLE_AUTH_STATE_KEY);
      } catch (_) {
        /* ignore */
      }
      return null;
    }
    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Persist OAuth pending state.
 * localStorage is more reliable than sessionStorage alone on some mobile Safari /
 * in-app browser redirects back from accounts.google.com.
 */
export function saveGoogleAuthPending(payload) {
  const wroteLocal = typeof localStorage !== 'undefined' && writeStorage(localStorage, payload);
  const wroteSession = typeof sessionStorage !== 'undefined' && writeStorage(sessionStorage, payload);
  if (!wroteLocal && !wroteSession) {
    /* storage unavailable — callback will fail state check */
  }
}

export function readGoogleAuthPending() {
  const fromSession = typeof sessionStorage !== 'undefined' ? readStorage(sessionStorage) : null;
  if (fromSession) return fromSession;
  return typeof localStorage !== 'undefined' ? readStorage(localStorage) : null;
}

export function clearGoogleAuthPending() {
  try {
    sessionStorage.removeItem(GOOGLE_AUTH_STATE_KEY);
  } catch (_) {
    /* ignore */
  }
  try {
    localStorage.removeItem(GOOGLE_AUTH_STATE_KEY);
  } catch (_) {
    /* ignore */
  }
}

let signInWatchdogTimer = null;

export function clearGoogleSignInWatchdog() {
  if (signInWatchdogTimer) {
    clearTimeout(signInWatchdogTimer);
    signInWatchdogTimer = null;
  }
}

/** If GSI never calls back after the account picker, cancel and notify the user. */
export function armGoogleSignInWatchdog(onStale) {
  clearGoogleSignInWatchdog();
  signInWatchdogTimer = setTimeout(() => {
    signInWatchdogTimer = null;
    try {
      window.google?.accounts?.id?.cancel?.();
    } catch (_) {
      /* best-effort */
    }
    onStale?.();
  }, GOOGLE_SIGNIN_WATCHDOG_MS);
}

export function isGoogleOauth2Ready() {
  return Boolean(window.google?.accounts?.oauth2?.initCodeClient);
}

export async function startGoogleRedirectSignIn(authOptions = {}) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google Sign-In is not configured.');
  }
  if (!isGoogleOauth2Ready()) {
    throw new Error('Google Sign-In is still loading. Please try again in a moment.');
  }

  let fingerprintRequestId;
  if (isFingerprintEnabled()) {
    const fp = await getFingerprintIdentification();
    fingerprintRequestId = fp?.requestId;
  }

  const state =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const redirectUri = getGoogleRedirectUri();

  saveGoogleAuthPending({
    state,
    redirectUri,
    returnTo: authOptions.returnTo || '/',
    authOptions,
    fingerprintRequestId: fingerprintRequestId || undefined
  });

  const client = window.google.accounts.oauth2.initCodeClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'openid email profile',
    ux_mode: 'redirect',
    redirect_uri: redirectUri,
    state,
    prompt: 'select_account'
  });

  client.requestCode();
}
