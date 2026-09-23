import { Link } from 'react-router-dom';
import { Field } from 'formik';
import { submitOrRevealErrors } from './submitOrRevealErrors';

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

export function DragonFurySignupForm({
  formik,
  showPassword,
  togglePassword,
  loginLink,
  ssoSlot,
  isSubmitting,
  shakeBtn,
  onEmptySubmit
}) {
  const { values, errors, touched, handleChange, handleBlur, setFieldValue } = formik;

  const onSubmit = (e) => {
    e.preventDefault();
    submitOrRevealErrors(formik, onEmptySubmit);
  };

  return (
    <form className="dragonfury-auth-form" onSubmit={onSubmit} noValidate>
      <label
        className={`dragonfury-auth-check${touched.terms && errors.terms ? ' dragonfury-auth-check--err' : ''}`}
        htmlFor="pj-terms"
      >
        <input
          id="pj-terms"
          name="terms"
          type="checkbox"
          checked={!!values.terms}
          onChange={(e) => setFieldValue('terms', e.target.checked)}
          onBlur={handleBlur}
          aria-invalid={touched.terms && errors.terms ? 'true' : undefined}
          aria-describedby={touched.terms && errors.terms ? 'pj-terms-err' : undefined}
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
        <p className="dragonfury-auth-consent-error" id="pj-terms-err" role="alert">
          {errors.terms}
        </p>
      )}

      <div className="dragonfury-auth-name-row">
        <div className="dragonfury-auth-field">
          <label htmlFor="pj-firstName">First Name</label>
          <Field
            id="pj-firstName"
            name="firstName"
            type="text"
            value={values.firstName ?? ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder=" "
            autoComplete="given-name"
            aria-invalid={touched.firstName && errors.firstName ? 'true' : undefined}
            aria-describedby={touched.firstName && errors.firstName ? 'pj-firstName-err' : undefined}
          />
          {touched.firstName && errors.firstName && (
            <p className="dragonfury-auth-field-err" id="pj-firstName-err" role="alert">
              {errors.firstName}
            </p>
          )}
        </div>
        <div className="dragonfury-auth-field">
          <label htmlFor="pj-lastName">Last Name</label>
          <Field
            id="pj-lastName"
            name="lastName"
            type="text"
            value={values.lastName ?? ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder=" "
            autoComplete="family-name"
            aria-invalid={touched.lastName && errors.lastName ? 'true' : undefined}
            aria-describedby={touched.lastName && errors.lastName ? 'pj-lastName-err' : undefined}
          />
          {touched.lastName && errors.lastName && (
            <p className="dragonfury-auth-field-err" id="pj-lastName-err" role="alert">
              {errors.lastName}
            </p>
          )}
        </div>
      </div>

      <div className="dragonfury-auth-field">
        <label htmlFor="pj-email">Email</label>
        <Field
          id="pj-email"
          name="email"
          type="email"
          value={values.email ?? ''}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder=" "
          autoComplete="email"
          aria-invalid={touched.email && errors.email ? 'true' : undefined}
          aria-describedby={touched.email && errors.email ? 'pj-email-err' : undefined}
        />
        {touched.email && errors.email && (
          <p className="dragonfury-auth-field-err" id="pj-email-err" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="dragonfury-auth-field">
        <label htmlFor="pj-signup-password">Password</label>
        <div className="dragonfury-auth-field-control">
          <Field
            id="pj-signup-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={values.password ?? ''}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder=" "
            autoComplete="new-password"
            aria-invalid={touched.password && errors.password ? 'true' : undefined}
            aria-describedby={touched.password && errors.password ? 'pj-signup-password-err' : undefined}
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
          <p className="dragonfury-auth-field-err" id="pj-signup-password-err" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      <div className="dragonfury-auth-field">
        <label htmlFor="pj-referral">Referral Code (Optional)</label>
        <Field
          id="pj-referral"
          name="referral"
          type="text"
          value={values.referral ?? ''}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder=" "
          autoComplete="off"
        />
      </div>

      {ssoSlot}

      <button
        type="submit"
        className={`dragonfury-auth-submit${isSubmitting ? ' ld' : ''}${shakeBtn ? ' shk' : ''}`}
        disabled={isSubmitting}
      >
        <span>{isSubmitting ? 'Creating…' : 'Sign Up'}</span>
      </button>

      <div className="dragonfury-auth-footer">
        {loginLink}
      </div>
    </form>
  );
}
