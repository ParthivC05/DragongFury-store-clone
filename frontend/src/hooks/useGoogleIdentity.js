import { useEffect, useRef, useState } from 'react';
import {
  clearGoogleSignInWatchdog,
  isGoogleOauth2Ready,
  shouldUseGoogleRedirectSignIn
} from '../utils/googleAuth';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GSI_SCRIPT_ID = 'google-gsi-client';

/** GSI initialize must run once per page; callback is kept fresh via ref. */
let gsiInitialized = false;
let latestGoogleCallback = null;

function ensureGoogleIdentityScript() {
  if (typeof document === 'undefined') return;
  if (window.google?.accounts?.id || window.google?.accounts?.oauth2) return;
  if (document.getElementById(GSI_SCRIPT_ID)) return;
  const script = document.createElement('script');
  script.id = GSI_SCRIPT_ID;
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  document.body.appendChild(script);
}

/**
 * Load Google Identity Services once and expose readiness for renderButton / redirect.
 * @param {(idToken: string) => void} onSuccess
 */
export function useGoogleIdentity(onSuccess) {
  const callbackRef = useRef(onSuccess);
  const [ready, setReady] = useState(false);
  const useRedirect = shouldUseGoogleRedirectSignIn();

  callbackRef.current = onSuccess;
  latestGoogleCallback = (credential) => {
    clearGoogleSignInWatchdog();
    callbackRef.current?.(credential);
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;

    ensureGoogleIdentityScript();

    const tryInit = () => {
      // Mobile / in-app: redirect OAuth only needs oauth2 (not One Tap / id button).
      if (useRedirect) {
        if (!isGoogleOauth2Ready()) return false;
        setReady(true);
        return true;
      }

      if (!window.google?.accounts?.id) return false;
      try {
        if (!gsiInitialized) {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => {
              clearGoogleSignInWatchdog();
              if (response?.credential) latestGoogleCallback?.(response.credential);
            },
            auto_select: false,
            context: 'signin',
            // FedCM can show a blank screen after account pick on some Chrome/Android builds.
            use_fedcm_for_prompt: false,
            // Helps Safari / iOS recover when third-party cookies are restricted.
            itp_support: true,
            cancel_on_tap_outside: true
          });
          gsiInitialized = true;
        }
        setReady(true);
      } catch (_) {
        /* initialize failed — button stays disabled */
      }
      return true;
    };

    if (tryInit()) return undefined;

    const timer = setInterval(() => {
      if (tryInit()) clearInterval(timer);
    }, 100);

    return () => clearInterval(timer);
  }, [useRedirect]);

  return { ready, clientId: GOOGLE_CLIENT_ID, useRedirect };
}

export function resetGoogleIdentitySession() {
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
    window.google?.accounts?.id?.cancel?.();
  } catch (_) {
    /* Google Identity reset is best-effort on logout. */
  }
}
