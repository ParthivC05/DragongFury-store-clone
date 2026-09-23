import { Link } from 'react-router-dom';
import { Field } from 'formik';
import { submitOrRevealErrors } from './submitOrRevealErrors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isLikelyPhone(value) {
  const s = String(value || '').trim();
  if (!s || s.includes('@')) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10;
}

function isValidLoginId(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (s.includes('@')) return EMAIL_RE.test(s);
  const digits = s.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

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

export function DragonFuryLoginForm({
  formik,
  showPassword,
  togglePassword,
  forgotPasswordLink,
  registerLink,
  ssoSlot,
  isSubmitting,
  shakeBtn,
  onEmptySubmit
}) {
  const { values, errors, touched, handleChange, handleBlur, setFieldValue } = formik;

  const emailVal = values.email ?? '';
  const emailLen = emailVal.length;
  const emailOk = isValidLoginId(emailVal);
  const emailErr = (touched.email && errors.email) || (emailLen > 4 && !emailOk);
  const phoneMode = isLikelyPhone(emailVal);

  const onSubmit = (e) => {
    e.preventDefault();
    submitOrRevealErrors(formik, onEmptySubmit);
  };

  return (
    <form className="dragonfury-auth-form" onSubmit={onSubmit} noValidate>
      <label
        className={`dragonfury-auth-check${touched.terms && errors.terms ? ' dragonfury-auth-check--err' : ''}`}
        htmlFor="pj-login-terms"
      >
        <input
          id="pj-login-terms"
          name="terms"
          type="checkbox"
          checked={!!values.terms}
          onChange={(e) => setFieldValue('terms', e.target.checked)}
          onBlur={handleBlur}
          aria-invalid={touched.terms && errors.terms ? 'true' : undefined}
          aria-describedby={touched.terms && errors.terms ? 'pj-login-terms-err' : undefined}
        />
        <span>
          I agree to the{' '}
          <Link to="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link to="/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {touched.terms && errors.terms && (
        <p className="dragonfury-auth-consent-error" id="pj-login-terms-err" role="alert">
          {errors.terms}
        </p>
      )}

      <div className="dragonfury-auth-field">
        <label htmlFor="pj-email">Email</label>
        <Field
          id="pj-email"
          name="email"
          type="text"
          inputMode={phoneMode ? 'tel' : 'email'}
          value={emailVal}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder=" "
          autoComplete="username"
          aria-invalid={emailErr ? 'true' : undefined}
          aria-describedby={touched.email && errors.email ? 'pj-email-err' : undefined}
        />
        {touched.email && errors.email && (
          <p className="dragonfury-auth-field-err" id="pj-email-err" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="dragonfury-auth-field">
        <label htmlFor="pj-password">Password</label>
        <div className="dragonfury-auth-field-control">
          <Field
            id="pj-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={values.password ?? ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder=" "
            autoComplete="current-password"
            aria-invalid={touched.password && errors.password ? 'true' : undefined}
            aria-describedby={touched.password && errors.password ? 'pj-password-err' : undefined}
          />
          <button
            type="button"
            className="dragonfury-auth-eye"
            onClick={togglePassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon show={showPassword} />
          </button>
        </div>
        {touched.password && errors.password && (
          <p className="dragonfury-auth-field-err" id="pj-password-err" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      {ssoSlot}

      <button
        type="submit"
        className={`dragonfury-auth-submit${isSubmitting ? ' ld' : ''}${shakeBtn ? ' shk' : ''}`}
        disabled={isSubmitting}
      >
        <span>{isSubmitting ? 'Signing in…' : 'Login'}</span>
      </button>

      <div className="dragonfury-auth-footer">
        {forgotPasswordLink}
        {registerLink}
      </div>
    </form>
  );
}
