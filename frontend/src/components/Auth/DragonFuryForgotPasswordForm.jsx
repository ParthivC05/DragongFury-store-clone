import { Link } from 'react-router-dom';
import { Field } from 'formik';
import { submitOrRevealErrors } from './submitOrRevealErrors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DragonFuryForgotPasswordForm({ formik, isSubmitting, shakeBtn, onEmptySubmit }) {
  const { values, errors, touched, handleChange, handleBlur } = formik;

  const emailVal = values.email ?? '';
  const emailLen = emailVal.length;
  const emailOk = EMAIL_RE.test(emailVal.trim());
  const emailErr = (touched.email && errors.email) || (emailLen > 4 && !emailOk);

  const onSubmit = (e) => {
    e.preventDefault();
    submitOrRevealErrors(formik, onEmptySubmit);
  };

  return (
    <form className="dragonfury-auth-form" onSubmit={onSubmit} noValidate>
      <div className="dragonfury-auth-field">
        <label htmlFor="df-forgot-email">Account Email</label>
        <Field
          id="df-forgot-email"
          name="email"
          type="email"
          inputMode="email"
          value={emailVal}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder=" "
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={emailErr ? 'true' : undefined}
          aria-describedby={touched.email && errors.email ? 'df-forgot-email-err' : undefined}
        />
        {touched.email && errors.email && (
          <p className="dragonfury-auth-field-err" id="df-forgot-email-err" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <button
        type="submit"
        className={`dragonfury-auth-submit${isSubmitting ? ' ld' : ''}${shakeBtn ? ' shk' : ''}`}
        disabled={isSubmitting}
      >
        <span>{isSubmitting ? 'Sending…' : 'Send Reset Link'}</span>
      </button>

      <div className="dragonfury-auth-footer">
        <Link to="/login">Back to Log In</Link>
      </div>
    </form>
  );
}
