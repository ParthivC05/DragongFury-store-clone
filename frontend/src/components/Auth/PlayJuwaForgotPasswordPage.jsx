import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Formik } from 'formik';
import { useToast } from '../../context/ToastContext';
import * as authApi from '../../api/auth';
import { usePageContentReady } from '../../context/PageReadyContext';
import { AuthBackground } from './AuthBackground';
import { SiteLogo } from '../SiteLogo';
import { DragonFuryForgotPasswordForm } from './DragonFuryForgotPasswordForm';
import { FORGOT_PASSWORD_VALIDATION } from './constants/validation';
import './auth-dragonfury.css';

const FORGOT_FORM_INITIAL = { email: '' };

export function DragonFuryForgotPasswordPage() {
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [shakeBtn, setShakeBtn] = useState(false);

  usePageContentReady(true);

  const triggerShake = () => {
    setShakeBtn(true);
    setTimeout(() => setShakeBtn(false), 450);
  };

  const handleSubmit = async (values, { setSubmitting }) => {
    const emailTrimmed = values.email?.trim();
    try {
      const res = await authApi.forgotPassword(emailTrimmed);
      setSentEmail(emailTrimmed);
      setSent(true);
      toast.success(res?.message || 'Password reset link has been sent to your email successfully.');
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pj-auth-root pj-auth-no-neon">
      <AuthBackground />

      <div className="pj-auth-scroll">
        <div className="pj-page">
          <div className="pj-logo-area">
            <SiteLogo variant="auth" />

            <h1 className="pj-page-title">{sent ? 'Check Your Email!' : 'Forgot Password?'}</h1>
            <p className="pj-page-sub">
              {sent
                ? '📬 We sent you a link to reset your password'
                : '🔑 Enter your email and we’ll send a reset link'}
            </p>
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

            <div className="pj-back-row">
              <Link to="/login" className="pj-back-lnk" aria-label="Back to login">
                ← Back to login
              </Link>
            </div>

            {sent ? (
              <div className="pj-forgot-success">
                <div className="pj-success-icon" aria-hidden>
                  ✅
                </div>
                <p className="pj-card-intro">
                  A password reset link has been sent to{' '}
                  <span className="pj-email-highlight">{sentEmail}</span>. Click the link in the email to set a new
                  password.
                </p>
                <p className="pj-info-note">
                  Didn’t receive the email? Check your spam folder or try again with the same email.
                </p>
                <Link to="/login" className="pj-btn-login pj-btn-login-link">
                  <span className="pj-btn-txt">🎮 BACK TO LOGIN</span>
                </Link>
              </div>
            ) : (
              <>
                <p className="pj-card-intro">
                  Enter the email address associated with your account and we’ll send you a link to reset your password.
                </p>
                <Formik
                  initialValues={FORGOT_FORM_INITIAL}
                  validationSchema={FORGOT_PASSWORD_VALIDATION}
                  onSubmit={handleSubmit}
                >
                  {(formik) => (
                    <DragonFuryForgotPasswordForm
                      formik={formik}
                      isSubmitting={formik.isSubmitting}
                      shakeBtn={shakeBtn}
                      onEmptySubmit={triggerShake}
                    />
                  )}
                </Formik>
              </>
            )}
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
