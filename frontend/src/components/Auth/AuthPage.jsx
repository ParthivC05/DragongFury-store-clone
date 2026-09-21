import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { STORE_CODE } from '../../config/site';
import { DragonFuryLoginPage } from './DragonFuryLoginPage';
import { DragonFurySignupPage } from './DragonFurySignupPage';
import { AppLoader } from '../AppLoader';
import * as authApi from '../../api/auth';
import { buildAuthPayloadWithGuestSpin, handleSignupBonusesAfterAuthSuccess } from '../../utils/guestSpinAuth';
import { composeE164 } from './phoneCountry';
import { handleDeviceSignupBlockedError } from '../../lib/auth/showDeviceBlockModal';

/** Normalize login field: email stays email; phone digits become E.164. */
function normalizeLoginIdentifier(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  if (s.includes('@')) return s.toLowerCase();
  return composeE164('US', s) || s;
}

export function AuthPage({ mode: initialMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const querySuffix = searchString ? `?${searchString}` : '';
  const { toast } = useToast();
  const refCode = searchParams.get('ref') || searchParams.get('affiliate') || '';
  const urlBonusCode = (searchParams.get('bonusCode') || searchParams.get('bc') || '').trim();
  const mode = initialMode === 'signup' ? 'signup' : 'login';
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const { login, register, setUserAndToken } = useAuth();

  usePageContentReady(true);

  const googleAuthOptions = buildAuthPayloadWithGuestSpin(
    urlBonusCode
      ? { bonusCode: urlBonusCode, returnTo: '/', ...(refCode ? { ref: refCode } : {}) }
      : { returnTo: '/', ...(refCode ? { ref: refCode } : {}) }
  );

  const handleGoogleSuccess = useCallback(
    async (idToken) => {
      if (ssoLoading) return;
      setSsoLoading(true);
      try {
        const data = await authApi.loginWithGoogle(
          idToken,
          buildAuthPayloadWithGuestSpin({
            ...(urlBonusCode ? { bonusCode: urlBonusCode } : {}),
            ...(refCode ? { ref: refCode } : {})
          })
        );
        if (!data?.token || !data?.user) {
          throw new Error('Google sign-in did not return a session. Please try again.');
        }
        setUserAndToken(data.user, data.token);
        handleSignupBonusesAfterAuthSuccess(data, toast);
        navigate('/', { replace: true });
      } catch (err) {
        if (handleDeviceSignupBlockedError(err)) return;
        toast.error(err.message || 'Google sign-in failed.');
      } finally {
        setSsoLoading(false);
      }
    },
    [navigate, setUserAndToken, ssoLoading, toast, urlBonusCode, refCode]
  );

  const handleFacebookSuccess = useCallback(
    async (accessToken) => {
      if (ssoLoading) return;
      setSsoLoading(true);
      try {
        const data = await authApi.loginWithFacebook(
          accessToken,
          buildAuthPayloadWithGuestSpin({
            ...(urlBonusCode ? { bonusCode: urlBonusCode } : {}),
            ...(refCode ? { ref: refCode } : {})
          })
        );
        if (!data?.token || !data?.user) {
          throw new Error('Facebook sign-in did not return a session. Please try again.');
        }
        setUserAndToken(data.user, data.token);
        handleSignupBonusesAfterAuthSuccess(data, toast);
        navigate('/', { replace: true });
      } catch (err) {
        if (handleDeviceSignupBlockedError(err)) return;
        toast.error(err.message || 'Facebook sign-in failed.');
      } finally {
        setSsoLoading(false);
      }
    },
    [navigate, setUserAndToken, ssoLoading, toast, urlBonusCode, refCode]
  );

  const handleLoginSubmit = async (values) => {
    setUnverifiedEmail(null);
    try {
      const identifier = normalizeLoginIdentifier(values.email);
      await login(identifier, values.password);
      navigate('/', { replace: true });
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      const isUnverified =
        err.body?.code === 'EMAIL_VERIFICATION_PENDING' ||
        msg.includes('not been verified') ||
        msg.includes('verification link') ||
        (msg.includes('verify') && msg.includes('email'));
      if (isUnverified && values.email?.trim()?.includes('@')) {
        setUnverifiedEmail(values.email.trim());
        return;
      }
      toast.error(err.message || 'Login failed. Please check your email/phone and password.');
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail || resendLoading) return;
    setResendLoading(true);
    try {
      await authApi.refreshEmailToken(unverifiedEmail);
      toast.success('Verification email sent. Check your inbox.');
      setUnverifiedEmail(null);
    } catch (err) {
      toast.error(err.message || 'Could not send verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  const closeVerificationModal = () => setUnverifiedEmail(null);

  const handleSignupSubmit = async (values) => {
    try {
      const referral = (refCode || '').trim();
      const res = await register(
        buildAuthPayloadWithGuestSpin({
          firstName: (values.firstName || '').trim(),
          lastName: (values.lastName || '').trim(),
          email: values.email.trim(),
          password: values.password,
          username: values.username?.trim() || undefined,
          code: STORE_CODE,
          ...(referral ? { ref: referral } : {}),
          ...(urlBonusCode ? { bonusCode: urlBonusCode } : {})
        })
      );
      handleSignupBonusesAfterAuthSuccess(res, toast);
      if (res && res.status === 'PENDING_VERIFICATION') {
        if (res.emailSent === false) {
          toast.error(
            "Signup completed. We're having trouble sending the verification email; please try again later from your profile."
          );
        }
        navigate(`/check-email?email=${encodeURIComponent(res.email || values.email)}`, { replace: true });
        return;
      }
      window.dispatchEvent(new CustomEvent('notifications:refresh'));
      navigate('/', { replace: true });
    } catch (err) {
      if (handleDeviceSignupBlockedError(err)) return;
      const msg =
        err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE' || err.status === 503
          ? "We're facing some issue. Please try again later."
          : err.message || 'Registration failed. Please try again.';
      toast.error(msg);
    }
  };

  if (mode === 'login') {
    return (
      <>
        {ssoLoading ? <AppLoader fullScreen message="Signing you in" /> : null}
        <DragonFuryLoginPage
          querySuffix={querySuffix}
          onLoginSubmit={handleLoginSubmit}
          onGoogleSuccess={handleGoogleSuccess}
          onFacebookSuccess={handleFacebookSuccess}
          googleAuthOptions={googleAuthOptions}
          ssoLoading={ssoLoading}
          unverifiedEmail={unverifiedEmail}
          onCloseVerification={closeVerificationModal}
          onResendVerification={handleResendVerification}
          resendLoading={resendLoading}
        />
      </>
    );
  }

  return (
    <>
      {ssoLoading ? <AppLoader fullScreen message="Signing you in" /> : null}
      <DragonFurySignupPage
        querySuffix={querySuffix}
        onSignupSubmit={handleSignupSubmit}
        onGoogleSuccess={handleGoogleSuccess}
        onFacebookSuccess={handleFacebookSuccess}
        googleAuthOptions={googleAuthOptions}
        ssoLoading={ssoLoading}
      />
    </>
  );
}
