import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Formik } from 'formik';
import { DragonFuryAuthOverlay } from './DragonFuryAuthOverlay';
import { DragonFuryLoginForm } from './DragonFuryLoginForm';
import { DragonFurySSOButtons } from './DragonFurySSOButtons';
import { EmailVerificationModal } from './EmailVerificationModal';
import { LOGIN_VALIDATION } from './constants/validation';
import './auth-dragonfury.css';
import './auth-df-modal.css';

const LOGIN_FORM_INITIAL = { email: '', password: '', terms: false };

export function DragonFuryLoginPage({
  querySuffix,
  onLoginSubmit,
  onGoogleSuccess,
  onFacebookSuccess,
  googleAuthOptions,
  ssoLoading = false,
  unverifiedEmail,
  onCloseVerification,
  onResendVerification,
  resendLoading
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [shakeBtn, setShakeBtn] = useState(false);

  const triggerShake = () => {
    setShakeBtn(true);
    setTimeout(() => setShakeBtn(false), 450);
  };

  return (
    <>
      <DragonFuryAuthOverlay title="Welcome Back" intro="Login to continue." mode="signin">
        <Formik
          initialValues={LOGIN_FORM_INITIAL}
          validationSchema={LOGIN_VALIDATION}
          onSubmit={onLoginSubmit}
        >
          {(formik) => (
            <DragonFuryLoginForm
              formik={formik}
              showPassword={showPassword}
              togglePassword={() => setShowPassword((s) => !s)}
              isSubmitting={formik.isSubmitting}
              shakeBtn={shakeBtn}
              onEmptySubmit={triggerShake}
              ssoSlot={
                <DragonFurySSOButtons
                  onGoogleSuccess={onGoogleSuccess}
                  onFacebookSuccess={onFacebookSuccess}
                  googleAuthOptions={googleAuthOptions}
                  disabled={ssoLoading}
                  googleLabel="Continue with Google"
                />
              }
              forgotPasswordLink={
                <Link to="/forgot-password" className="pj-forgot-lnk">
                  Forgot Password?
                </Link>
              }
              registerLink={
                <Link to={`/register${querySuffix}`} className="pj-forgot-lnk">
                  Create Account
                </Link>
              }
            />
          )}
        </Formik>
      </DragonFuryAuthOverlay>

      <EmailVerificationModal
        open={!!unverifiedEmail}
        email={unverifiedEmail}
        onClose={onCloseVerification}
        onResend={onResendVerification}
        resendLoading={resendLoading}
      />
    </>
  );
}
