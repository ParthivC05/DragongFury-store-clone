import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useGoogleIdentity } from '../../hooks/useGoogleIdentity';
import {
  armGoogleSignInWatchdog,
  startGoogleRedirectSignIn
} from '../../utils/googleAuth';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const FACEBOOK_APP_ID = import.meta.env.VITE_FACEBOOK_APP_ID || '';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function initFacebookSDK(appId) {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v18.0' });
      resolve();
      return;
    }
    window.fbAsyncInit = function () {
      window.FB.init({ appId, cookie: true, xfbml: false, version: 'v18.0' });
      resolve();
    };
    loadScript('https://connect.facebook.net/en_US/sdk.js').catch(reject);
  });
}

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden>
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export function DragonFurySSOButtons({
  onGoogleSuccess,
  onFacebookSuccess,
  disabled,
  googleLabel = 'Google',
  googleAuthOptions = {}
}) {
  const toast = useToast();
  const googleButtonRef = useRef(null);
  const containerRef = useRef(null);
  const lastWidthRef = useRef(0);
  const { ready: googleReady, useRedirect } = useGoogleIdentity(onGoogleSuccess);
  const [facebookReady, setFacebookReady] = useState(false);

  const hasGoogle = Boolean(GOOGLE_CLIENT_ID);
  const hasFacebook = Boolean(FACEBOOK_APP_ID);
  const ssoDisabled = disabled || !googleReady;

  const renderGoogleButton = useCallback(
    (width) => {
      const el = googleButtonRef.current;
      if (!el || !GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;
      const w = width ?? containerRef.current?.offsetWidth ?? el.offsetWidth ?? 320;
      const targetWidth = Math.max(280, w);
      if (lastWidthRef.current === targetWidth) return;
      lastWidthRef.current = targetWidth;
      try {
        el.innerHTML = '';
        window.google.accounts.id.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          width: targetWidth,
          text: 'signin_with',
          shape: 'rectangular'
        });
      } catch (e) {
        toast.error(e.message || 'Google button failed');
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!googleReady || useRedirect || !googleButtonRef.current || !containerRef.current) return;
    lastWidthRef.current = 0;
    renderGoogleButton();
  }, [googleReady, renderGoogleButton, useRedirect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !googleReady || useRedirect) return;
    const ro = new ResizeObserver(() => {
      if (googleButtonRef.current?.offsetParent) {
        const w = container.offsetWidth;
        if (w > 0) renderGoogleButton(w);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [googleReady, renderGoogleButton, useRedirect]);

  const handleGoogleRedirectClick = async () => {
    if (disabled) return;
    if (!googleReady) {
      toast.error('Google Sign-In is still loading. Please try again in a moment.');
      return;
    }
    try {
      await startGoogleRedirectSignIn(googleAuthOptions);
    } catch (err) {
      toast.error(err.message || 'Google sign-in failed to start.');
    }
  };

  const handleGoogleIframePointerDown = () => {
    if (ssoDisabled) return;
    armGoogleSignInWatchdog(() => {
      toast.error('Google sign-in timed out. Please try again or use email login.');
    });
  };

  useEffect(() => {
    if (!FACEBOOK_APP_ID) return;
    initFacebookSDK(FACEBOOK_APP_ID)
      .then(() => setFacebookReady(true))
      .catch(() => {});
  }, []);

  const handleFacebookClick = () => {
    if (!window.FB || !facebookReady || disabled) return;
    window.FB.login(
      (res) => {
        if (res.authResponse?.accessToken) {
          onFacebookSuccess?.(res.authResponse.accessToken);
        } else if (res.status === 'unknown') {
          toast.error('Facebook sign-in was cancelled.');
        } else {
          toast.error('Facebook sign-in failed. Please try again.');
        }
      },
      { scope: 'email,public_profile' }
    );
  };

  return (
    <div className={`pj-social-row${hasFacebook ? ' has-fb' : ''}`}>
      {hasGoogle ? (
        useRedirect ? (
          <button
            type="button"
            className={`pj-btn-social pj-btn-gg pj-sso-google-wrap${ssoDisabled ? ' pj-sso-google-wrap--busy' : ''}`}
            disabled={ssoDisabled}
            onClick={handleGoogleRedirectClick}
            aria-label={googleLabel}
          >
            <GoogleIcon />
            {googleLabel}
          </button>
        ) : (
          <div
            ref={containerRef}
            className={`pj-sso-google-wrap${ssoDisabled ? ' pj-sso-google-wrap--busy' : ''}`}
            role="group"
            aria-label={googleLabel}
            aria-busy={ssoDisabled || undefined}
          >
            <div className="pj-btn-social pj-btn-gg" aria-hidden>
              <GoogleIcon />
              {googleLabel}
            </div>
            <div
              className="pj-sso-google-overlay"
              style={{ touchAction: 'manipulation' }}
              ref={googleButtonRef}
              onPointerDown={handleGoogleIframePointerDown}
            />
          </div>
        )
      ) : (
        <button type="button" disabled className="pj-btn-social pj-btn-gg" title="Google Sign-In is not configured">
          <GoogleIcon />
          {googleLabel}
        </button>
      )}
      {hasFacebook && (
        <button
          type="button"
          onClick={handleFacebookClick}
          disabled={disabled || !facebookReady}
          className="pj-btn-social pj-btn-fb"
          aria-label="Sign in with Facebook"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden>
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Facebook
        </button>
      )}
    </div>
  );
}
