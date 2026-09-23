import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Formik, Field } from 'formik';
import { useToast } from '../../context/ToastContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import * as authApi from '../../api/auth';
import { DragonFuryAuthOverlay } from './DragonFuryAuthOverlay';
import { RESET_PASSWORD_VALIDATION } from './constants/validation';
import { submitOrRevealErrors } from './submitOrRevealErrors';
import './auth-dragonfury.css';
import './auth-df-modal.css';

const RESET_FORM_INITIAL = { newPassword: '', confirmPassword: '' };

function EyeIcon({ show }) {
  if (show) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ResetPasswordForm({ formik, isSubmitting, shakeBtn, onEmptySubmit }) {
  const { values, errors, touched, handleChange, handleBlur } = formik;
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    submitOrRevealErrors(formik, onEmptySubmit);
  };

  return (
    <form className="dragonfury-auth-form" onSubmit={onSubmit} noValidate>
      <div className="dragonfury-auth-field">
        <label htmlFor="df-reset-password">New Password</label>
        <div className="dragonfury-auth-field-control">
          <Field
            id="df-reset-password"
            name="newPassword"
            type={showPassword ? 'text' : 'password'}
            value={values.newPassword ?? ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder=" "
            autoComplete="new-password"
            aria-invalid={touched.newPassword && errors.newPassword ? 'true' : undefined}
            aria-describedby={
              touched.newPassword && errors.newPassword ? 'df-reset-password-err' : undefined
            }
          />
          <button
            type="button"
            className="dragonfury-auth-eye"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon show={showPassword} />
          </button>
        </div>
        {touched.newPassword && errors.newPassword && (
          <p className="dragonfury-auth-field-err" id="df-reset-password-err" role="alert">
            {errors.newPassword}
          </p>
        )}
      </div>

      <div className="dragonfury-auth-field">
        <label htmlFor="df-reset-confirm">Confirm Password</label>
        <div className="dragonfury-auth-field-control">
          <Field
            id="df-reset-confirm"
            name="confirmPassword"
            type={showConfirm ? 'text' : 'password'}
            value={values.confirmPassword ?? ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder=" "
            autoComplete="new-password"
            aria-invalid={touched.confirmPassword && errors.confirmPassword ? 'true' : undefined}
            aria-describedby={
              touched.confirmPassword && errors.confirmPassword ? 'df-reset-confirm-err' : undefined
            }
          />
          <button
            type="button"
            className="dragonfury-auth-eye"
            onClick={() => setShowConfirm((s) => !s)}
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
          >
            <EyeIcon show={showConfirm} />
          </button>
        </div>
        {touched.confirmPassword && errors.confirmPassword && (
          <p className="dragonfury-auth-field-err" id="df-reset-confirm-err" role="alert">
            {errors.confirmPassword}
          </p>
        )}
      </div>

      <button
        type="submit"
        className={`dragonfury-auth-submit${isSubmitting ? ' ld' : ''}${shakeBtn ? ' shk' : ''}`}
        disabled={isSubmitting}
      >
        <span>{isSubmitting ? 'Updating…' : 'Update Password'}</span>
      </button>
    </form>
  );
}

export function DragonFuryResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);
  const [shakeBtn, setShakeBtn] = useState(false);

  usePageContentReady(true);

  const triggerShake = () => {
    setShakeBtn(true);
    setTimeout(() => setShakeBtn(false), 450);
  };

  useEffect(() => {
    if (!token) {
      toast.error('Invalid reset link. Please request a new password reset link.');
    }
  }, [token, toast]);

  const title = success ? 'Password Updated' : 'New Password';
  const intro = success
    ? 'You can now sign in with your new password.'
    : 'Choose a new password.';

  return (
    <DragonFuryAuthOverlay title={title} intro={intro} mode="recovery">
      {success ? (
        <div className="dragonfury-auth-form">
          <p className="dragonfury-auth-status dragonfury-auth-status--success" role="status">
            Your password has been reset successfully.
          </p>
          <Link to="/login" className="dragonfury-auth-submit df-auth-submit-link">
            <span>Back to Log In</span>
          </Link>
        </div>
      ) : !token ? (
        <div className="dragonfury-auth-form">
          <p className="dragonfury-auth-status dragonfury-auth-status--error" role="alert">
            This reset link is invalid or expired. Request a new reset link.
          </p>
          <button
            type="button"
            className="dragonfury-auth-submit"
            onClick={() => navigate('/forgot-password', { replace: true })}
          >
            <span>Request New Link</span>
          </button>
          <div className="dragonfury-auth-footer">
            <Link to="/login">Back to Log In</Link>
          </div>
        </div>
      ) : (
        <Formik
          initialValues={RESET_FORM_INITIAL}
          validationSchema={RESET_PASSWORD_VALIDATION}
          onSubmit={async (values, { setSubmitting }) => {
            try {
              await authApi.resetPassword(token, values.newPassword);
              toast.success('Your password has been reset. You can now sign in.');
              setSuccess(true);
            } catch (err) {
              const msg =
                err.status >= 500 || err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE'
                  ? 'Something went wrong. Please try again later or request a new reset link.'
                  : err.message || 'Failed to reset password. Please request a new link.';
              toast.error(msg);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {(formik) => (
            <ResetPasswordForm
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
