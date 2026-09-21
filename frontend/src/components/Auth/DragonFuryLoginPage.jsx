import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Formik } from 'formik';
import { AuthBackground } from './AuthBackground';
import { SiteLogo } from '../SiteLogo';
import { DragonFuryLoginForm } from './DragonFuryLoginForm';
import { DragonFurySSOButtons } from './DragonFurySSOButtons';
import { EmailVerificationModal } from './EmailVerificationModal';
import { LOGIN_VALIDATION } from './constants/validation';
import './auth-dragonfury.css';

const LOGIN_FORM_INITIAL = { email: '', password: '' };

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
    <div className="pj-auth-root">
      <AuthBackground />

      <div className="pj-auth-scroll">
        <div className="pj-page">
          <div className="pj-logo-area">
            <SiteLogo variant="auth" />

            <h1 className="pj-page-title">Welcome Back!</h1>
            <p className="pj-page-sub">🪙 Your coins are waiting — log in &amp; claim them</p>
          </div>

          <div className="pj-card">
            <div className="pj-corner tl" aria-hidden>
              ♠
            </div>
            <div className="pj-corner tr" aria-hidden>
              ♥
            </div>
            <div className="pj-corner bl" aria-hidden>
              ♦
            </div>
            <div className="pj-corner br" aria-hidden>
              ♣
            </div>
            <div className="pj-shine" aria-hidden />

            <DragonFurySSOButtons
              onGoogleSuccess={onGoogleSuccess}
              onFacebookSuccess={onFacebookSuccess}
              googleAuthOptions={googleAuthOptions}
              disabled={ssoLoading}
              googleLabel="Login with Google"
            />

            <div className="pj-divider">
              <div className="pj-d-line" />
              <span className="pj-d-txt">Or by email / phone</span>
              <div className="pj-d-line r" />
            </div>

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
                  forgotPasswordLink={
                    <Link to="/forgot-password" className="pj-forgot-lnk">
                      Forgot your password? Click here
                    </Link>
                  }
                  registerLink={
                    <Link to={`/register${querySuffix}`} className="pj-forgot-lnk" style={{ color: 'var(--pj-gold)' }}>
                      Sign Up Free
                    </Link>
                  }
                />
              )}
            </Formik>
          </div>

          <nav className="pj-b-links" aria-label="Legal links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/help">Support</Link>
          </nav>
        </div>
      </div>

      <EmailVerificationModal
        open={!!unverifiedEmail}
        email={unverifiedEmail}
        onClose={onCloseVerification}
        onResend={onResendVerification}
        resendLoading={resendLoading}
      />
    </div>
  );
}
