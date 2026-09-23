import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Formik } from 'formik';
import { useToast } from '../../context/ToastContext';
import * as authApi from '../../api/auth';
import { usePageContentReady } from '../../context/PageReadyContext';
import { DragonFuryAuthOverlay } from './DragonFuryAuthOverlay';
import { DragonFuryForgotPasswordForm } from './DragonFuryForgotPasswordForm';
import { FORGOT_PASSWORD_VALIDATION } from './constants/validation';
import './auth-dragonfury.css';
import './auth-df-modal.css';

const FORGOT_FORM_INITIAL = { email: '' };

export function DragonFuryForgotPasswordPage() {
  const { toast } = useToast();
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [shakeBtn, setShakeBtn] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

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

  const handleResend = async () => {
    if (!sentEmail || resendLoading) return;
    setResendLoading(true);
    try {
      const res = await authApi.forgotPassword(sentEmail);
      toast.success(res?.message || 'Password reset link sent again. Check your inbox.');
    } catch (err) {
      toast.error(err.message || 'Could not resend reset email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <DragonFuryAuthOverlay
      title="Reset Password"
      intro={
        sent
          ? 'Check your inbox for the reset link.'
          : 'We will email you a reset link.'
      }
      mode="recovery"
    >
      {sent ? (
        <div className="dragonfury-auth-form">
          <p className="dragonfury-auth-status dragonfury-auth-status--success" role="status">
            A password reset link was sent to <strong>{sentEmail}</strong>. Check your inbox and spam
            folder.
          </p>
          <p className="dragonfury-auth-intro df-auth-resend-note">
            Didn&apos;t get it?{' '}
            <button
              type="button"
              className="df-verify-resend"
              disabled={resendLoading}
              onClick={handleResend}
            >
              {resendLoading ? 'sending…' : 'Resend'}
            </button>
          </p>
          <Link to="/login" className="dragonfury-auth-submit df-auth-submit-link">
            <span>Back to Log In</span>
          </Link>
        </div>
      ) : (
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
      )}
    </DragonFuryAuthOverlay>
  );
}
