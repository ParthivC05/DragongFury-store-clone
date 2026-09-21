import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { AppLoader } from '../components/AppLoader';
import { usePageContentReady } from '../context/PageReadyContext';
import * as authApi from '../api/auth';
import {
  buildAuthPayloadWithGuestSpin,
  handleSignupBonusesAfterAuthSuccess
} from '../utils/guestSpinAuth';
import {
  clearGoogleAuthPending,
  getGoogleRedirectUri,
  readGoogleAuthPending
} from '../utils/googleAuth';
import { handleDeviceSignupBlockedError } from '../lib/auth/showDeviceBlockModal';

/**
 * Mobile Google SSO lands here after OAuth redirect.
 * Session is issued even if phone is unverified; purchase requires profile phone verify.
 */
export function GoogleAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUserAndToken } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState('Signing you in');
  const handledRef = useRef(false);
  usePageContentReady(true);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      clearGoogleAuthPending();
      toast.error('Google sign-in was cancelled.');
      navigate('/login', { replace: true });
      return;
    }

    if (!code) {
      clearGoogleAuthPending();
      toast.error('Google sign-in did not complete. Please try again.');
      navigate('/login', { replace: true });
      return;
    }

    const pending = readGoogleAuthPending();
    if (!pending || !state || pending.state !== state) {
      clearGoogleAuthPending();
      toast.error('Google sign-in session expired. Please try again.');
      navigate('/login', { replace: true });
      return;
    }

    const redirectUri = pending.redirectUri || getGoogleRedirectUri();
    const returnTo = pending.returnTo || '/';
    const authOptions = pending.authOptions || {};

    (async () => {
      try {
        setMessage('Signing you in');
        const data = await authApi.loginWithGoogleCode(
          code,
          redirectUri,
          buildAuthPayloadWithGuestSpin({
            ...authOptions,
            fingerprintRequestId: pending.fingerprintRequestId
          })
        );
        clearGoogleAuthPending();

        if (!data?.token || !data?.user) {
          throw new Error('Google sign-in did not return a session. Please try again.');
        }

        setUserAndToken(data.user, data.token);
        handleSignupBonusesAfterAuthSuccess(data, toast);
        navigate(returnTo, { replace: true });
      } catch (err) {
        clearGoogleAuthPending();
        if (handleDeviceSignupBlockedError(err)) {
          navigate('/login', { replace: true });
          return;
        }
        toast.error(err.message || 'Google sign-in failed.');
        navigate('/login', { replace: true });
      }
    })();
  }, [navigate, searchParams, setUserAndToken, toast]);

  return <AppLoader fullScreen message={message} />;
}
