import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Formik } from 'formik';
import { DragonFuryAuthOverlay } from './DragonFuryAuthOverlay';
import { DragonFurySignupForm } from './DragonFurySignupForm';
import { DragonFurySSOButtons } from './DragonFurySSOButtons';
import { EmailVerificationModal } from './EmailVerificationModal';
import { SIGNUP_VALIDATION } from './constants/validation';
import './auth-dragonfury.css';
import './auth-df-modal.css';

const SIGNUP_FORM_INITIAL = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  referral: '',
  terms: false
};

export function DragonFurySignupPage({
  querySuffix,
  initialReferral = '',
  onSignupSubmit,
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
      <DragonFuryAuthOverlay title="Create Your Account" intro="Get started in just a few steps." mode="signup">
        <Formik
          initialValues={{ ...SIGNUP_FORM_INITIAL, referral: initialReferral }}
          validationSchema={SIGNUP_VALIDATION}
          onSubmit={onSignupSubmit}
        >
          {(formik) => (
            <DragonFurySignupForm
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
              loginLink={
                <Link to={`/login${querySuffix}`} className="pj-forgot-lnk">
                  Already have an account? Sign In
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
