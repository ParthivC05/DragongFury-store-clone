import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Formik } from 'formik';
import { AuthBackground } from './AuthBackground';
import { SiteLogo } from '../SiteLogo';
import { DragonFurySignupForm } from './DragonFurySignupForm';
import { DragonFurySSOButtons } from './DragonFurySSOButtons';
import { SIGNUP_VALIDATION } from './constants/validation';
import './auth-dragonfury.css';

const SIGNUP_FORM_INITIAL = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  password: '',
  terms: true
};

export function DragonFurySignupPage({
  querySuffix,
  onSignupSubmit,
  onGoogleSuccess,
  onFacebookSuccess,
  googleAuthOptions,
  ssoLoading = false
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

            <h1 className="pj-page-title">Join the Fun!</h1>
            <p className="pj-page-sub">Sign up today and start winning</p>
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
              googleLabel="Signup with Google"
            />

            <div className="pj-divider">
              <div className="pj-d-line" />
              <span className="pj-d-txt">Or by email</span>
              <div className="pj-d-line r" />
            </div>

            <Formik
              initialValues={SIGNUP_FORM_INITIAL}
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
                  loginLink={
                    <Link to={`/login${querySuffix}`} className="pj-forgot-lnk" style={{ color: 'var(--pj-gold)' }}>
                      Log In
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
    </div>
  );
}
