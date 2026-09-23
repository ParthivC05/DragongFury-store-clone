import { useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik } from 'formik';
import * as Dialog from '../ui/Dialog';
import * as Tabs from '../ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { site, STORE_CODE } from '../../config/site';
import { AuthForm } from './AuthForm';
import { EmailVerificationModal } from './EmailVerificationModal';
import { SSOButtons } from './SSOButtons';
import { AppLoader } from '../AppLoader';
import { LOGIN_FIELDS, SIGNUP_FIELDS } from './constants/fields';
import { LOGIN_VALIDATION, SIGNUP_VALIDATION } from './constants/validation';
import * as authApi from '../../api/auth';
import { buildAuthPayloadWithGuestSpin, handleSignupBonusesAfterAuthSuccess } from '../../utils/guestSpinAuth';
import { composeE164 } from './phoneCountry';
import { handleDeviceSignupBlockedError } from '../../lib/auth/showDeviceBlockModal';

const LOGIN_INITIAL = { email: '', password: '', terms: true };
const SIGNUP_INITIAL = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  terms: true
};

function normalizeLoginIdentifier(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  if (s.includes('@')) return s.toLowerCase();
  return composeE164('US', s) || s;
}

export function AuthModal({ mode: initialMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchString = searchParams.toString();
  const querySuffix = searchString ? `?${searchString}` : '';
  const { toast } = useToast();
  const refCode = searchParams.get('ref') || searchParams.get('affiliate') || '';
  const urlBonusCode = (searchParams.get('bonusCode') || searchParams.get('bc') || '').trim();
  const mode = initialMode === 'signup' ? 'signup' : 'login';
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  const { login, register, setUserAndToken } = useAuth();

  const googleAuthOptions = buildAuthPayloadWithGuestSpin({
    returnTo: '/',
    ...(urlBonusCode ? { bonusCode: urlBonusCode } : {}),
    ...(refCode ? { ref: refCode } : {})
  });

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

  const handleOpenChange = (open) => {
    if (!open) navigate('/', { replace: true });
  };

  const handleLoginSubmit = async (values) => {
    setUnverifiedEmail(null);
    try {
      await login(normalizeLoginIdentifier(values.email), values.password);
      navigate('/', { replace: true });
    } catch (err) {
      const msgLower = (err.message || '').toLowerCase();
      const isUnverified =
        err.code === 'EMAIL_VERIFICATION_PENDING' ||
        err.body?.code === 'EMAIL_VERIFICATION_PENDING' ||
        msgLower.includes('not been verified') ||
        msgLower.includes('verification link') ||
        (msgLower.includes('verify') && msgLower.includes('email'));
      if (isUnverified) {
        const email =
          err.registeredEmail ||
          err.body?.registeredEmail ||
          err.body?.email ||
          values.email?.trim() ||
          '';
        if (email) {
          setUnverifiedEmail(email);
          if (err.body?.emailSent === false) {
            toast.error(
              'We could not send the verification email. Use Resend, or try again in a moment.'
            );
          }
          return;
        }
      }
      const msg = (err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE' || err.status === 503)
        ? "We're facing some issue. Please try again later."
        : (err.message || 'Login failed. Please check your email/phone and password.');
      toast.error(msg);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail || resendLoading) return;
    setResendLoading(true);
    try {
      await authApi.refreshEmailToken(unverifiedEmail);
      toast.success('Verification email sent. Check your inbox.');
    } catch (err) {
      const msg = (err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE' || err.status === 503)
        ? 'Please try again later.'
        : (err.message || 'Could not send verification email.');
      toast.error(msg);
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
        setUnverifiedEmail(res.email || values.email.trim());
        return;
      }
      window.dispatchEvent(new CustomEvent('notifications:refresh'));
      navigate('/', { replace: true });
    } catch (err) {
      if (handleDeviceSignupBlockedError(err)) return;
      const msg = (err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE' || err.status === 503)
        ? "We're facing some issue. Please try again later."
        : (err.message || 'Registration failed. Please try again.');
      toast.error(msg);
    }
  };

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      {ssoLoading ? <AppLoader fullScreen message="Signing you in" /> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 min-h-[100dvh] h-full w-full bg-app" />
        <div className="fixed inset-0 z-50 min-h-[100dvh] h-full w-full overflow-y-auto flex items-center justify-center p-4">
          <Dialog.Content
            className="relative w-full max-w-lg my-auto p-8 sm:p-10 bg-card border border-gray-700 rounded-xl shadow-2xl outline-none"
            onEscapeKeyDown={() => handleOpenChange(false)}
            onPointerDownOutside={() => handleOpenChange(false)}
          >
            <Dialog.Close
              className="absolute right-4 top-4 w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 outline-none text-2xl leading-none"
              aria-label="Close"
            >
              &#215;
            </Dialog.Close>
            <Tabs.Root
              value={mode}
              onValueChange={(v) => {
                const nextMode = v === 'signup' ? 'signup' : 'login';
                navigate((nextMode === 'signup' ? '/register' : '/login') + querySuffix, { replace: true });
              }}
            >
              <Tabs.List className="flex gap-6 mb-7 pb-6 border-b border-gray-700" aria-label="Auth tabs">
                <Tabs.Trigger
                  value="login"
                  className="pb-3 -mb-px text-base font-medium border-b-2 border-transparent text-gray-400 data-[state=active]:text-gray-100 data-[state=active]:border-primary outline-none"
                >
                  Login
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="signup"
                  className="pb-3 -mb-px text-base font-medium border-b-2 border-transparent text-gray-400 data-[state=active]:text-gray-100 data-[state=active]:border-primary outline-none"
                >
                  Sign Up
                </Tabs.Trigger>
              </Tabs.List>
              <Dialog.Title className="sr-only">Welcome to {site.platformName}</Dialog.Title>
              <p className="text-2xl font-bold text-gray-100 mb-7">Welcome to {site.platformName}</p>
              <Tabs.Content value="login" className="outline-none">
                <Formik
                  initialValues={LOGIN_INITIAL}
                  validationSchema={LOGIN_VALIDATION}
                  onSubmit={handleLoginSubmit}
                >
                  {(formik) => (
                    <AuthForm
                      formik={{
                        ...formik,
                        status: formik.status
                      }}
                      fields={LOGIN_FIELDS}
                      showPassword={showPassword}
                      togglePassword={() => setShowPassword((s) => !s)}
                      submitLabel="Login"
                      forgotPasswordLink={
                        <Link to="/forgot-password" className="text-primary hover:underline">
                          Forgot Password?
                        </Link>
                      }
                      footerLink={
                        <Link to={`/register${querySuffix}`} className="text-primary hover:underline">
                          Don&apos;t have an account? Sign Up
                        </Link>
                      }
                      afterSubmit={
                        <SSOButtons
                          onGoogleSuccess={handleGoogleSuccess}
                          onFacebookSuccess={handleFacebookSuccess}
                          disabled={ssoLoading}
                          googleAuthOptions={googleAuthOptions}
                        />
                      }
                    />
                  )}
                </Formik>
              </Tabs.Content>
              <Tabs.Content value="signup" className="outline-none">
                <Formik
                  initialValues={SIGNUP_INITIAL}
                  validationSchema={SIGNUP_VALIDATION}
                  onSubmit={handleSignupSubmit}
                >
                  {(formik) => (
                    <AuthForm
                      formik={{
                        ...formik,
                        status: formik.status
                      }}
                      fields={SIGNUP_FIELDS}
                      showPassword={showPassword}
                      togglePassword={() => setShowPassword((s) => !s)}
                      submitLabel="Signup"
                      footerLink={
                        <Link to={`/login${querySuffix}`} className="text-primary hover:underline">
                          Already have an account? Login
                        </Link>
                      }
                      afterSubmit={
                        <SSOButtons
                          onGoogleSuccess={handleGoogleSuccess}
                          onFacebookSuccess={handleFacebookSuccess}
                          disabled={ssoLoading}
                          googleAuthOptions={googleAuthOptions}
                        />
                      }
                    />
                  )}
                </Formik>
              </Tabs.Content>
            </Tabs.Root>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
      <EmailVerificationModal
        open={!!unverifiedEmail}
        email={unverifiedEmail}
        onClose={closeVerificationModal}
        onResend={handleResendVerification}
        resendLoading={resendLoading}
      />
    </Dialog.Root>
  );
}
