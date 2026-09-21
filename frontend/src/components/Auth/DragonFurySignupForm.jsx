import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from 'formik';
import { submitOrRevealErrors } from './submitOrRevealErrors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function DragonFuryField({
  id,
  name,
  label,
  icon,
  type = 'text',
  placeholder,
  autoComplete,
  value,
  error,
  touched,
  focused,
  onFocus,
  onBlur,
  onChange,
  showValidationIcon,
  isValid,
  className = 'pj-field',
  children
}) {
  const hasError = touched && error;
  const showIcon = showValidationIcon && touched && !error && isValid;
  const errorId = `${id}-err`;

  return (
    <div className={className}>
      <label htmlFor={id} className={`pj-f-label${focused ? ' focused' : ''}`}>
        <span className="ico" aria-hidden>
          {icon}
        </span>
        {label}
      </label>
      <div className="pj-inp-wrap">
        <Field
          id={id}
          name={name}
          type={type}
          value={value ?? ''}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? errorId : undefined}
          className={hasError ? 'err' : showIcon ? 'ok' : ''}
        />
        {children || (
          <div className="pj-inp-side">
            <span className={`pj-v-ico${showIcon ? ' show' : ''}`} aria-hidden>
              {showIcon ? '✅' : ''}
            </span>
          </div>
        )}
      </div>
      {hasError && (
        <p className="pj-field-err" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function DragonFurySignupForm({
  formik,
  showPassword,
  togglePassword,
  loginLink,
  isSubmitting,
  shakeBtn,
  onEmptySubmit
}) {
  const { values, errors, touched, handleChange, handleBlur, setFieldValue } = formik;
  const [focused, setFocused] = useState({});

  const setFocus = (field, on) => {
    setFocused((f) => ({ ...f, [field]: on }));
  };

  const emailVal = values.email ?? '';
  const emailOk = EMAIL_RE.test(String(emailVal).trim());

  const onSubmit = (e) => {
    e.preventDefault();
    submitOrRevealErrors(formik, onEmptySubmit);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="pj-field-row">
        <DragonFuryField
          id="pj-firstName"
          name="firstName"
          label="First Name"
          icon="👤"
          placeholder="First name"
          autoComplete="given-name"
          value={values.firstName}
          error={errors.firstName}
          touched={touched.firstName}
          focused={focused.firstName}
          onFocus={() => setFocus('firstName', true)}
          onBlur={(e) => {
            handleBlur(e);
            setFocus('firstName', false);
          }}
          onChange={handleChange}
          showValidationIcon
          isValid={values.firstName && !errors.firstName}
          className="pj-field pj-field-half"
        />
        <DragonFuryField
          id="pj-lastName"
          name="lastName"
          label="Last Name"
          icon="👤"
          placeholder="Last name"
          autoComplete="family-name"
          value={values.lastName}
          error={errors.lastName}
          touched={touched.lastName}
          focused={focused.lastName}
          onFocus={() => setFocus('lastName', true)}
          onBlur={(e) => {
            handleBlur(e);
            setFocus('lastName', false);
          }}
          onChange={handleChange}
          showValidationIcon
          isValid={values.lastName && !errors.lastName}
          className="pj-field pj-field-half"
        />
      </div>

      <DragonFuryField
        id="pj-email"
        name="email"
        label="Email Address"
        icon="✉️"
        type="email"
        placeholder="Enter your email address"
        autoComplete="email"
        value={values.email}
        error={errors.email}
        touched={touched.email}
        focused={focused.email}
        onFocus={() => setFocus('email', true)}
        onBlur={(e) => {
          handleBlur(e);
          setFocus('email', false);
        }}
        onChange={handleChange}
        showValidationIcon
        isValid={emailOk && !errors.email}
      />

      <div className="pj-field">
        <label htmlFor="pj-signup-password" className={`pj-f-label${focused.password ? ' focused' : ''}`}>
          <span className="ico" aria-hidden>
            🔒
          </span>
          Password
        </label>
        <div className="pj-inp-wrap">
          <Field
            id="pj-signup-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={values.password ?? ''}
            onChange={handleChange}
            onBlur={(e) => {
              handleBlur(e);
              setFocus('password', false);
            }}
            onFocus={() => setFocus('password', true)}
            placeholder="Min 8 chars: upper, lower, number, special"
            autoComplete="new-password"
            aria-invalid={touched.password && errors.password ? 'true' : undefined}
            aria-describedby={touched.password && errors.password ? 'pj-signup-password-err' : undefined}
            className={touched.password && errors.password ? 'err' : values.password && !errors.password ? 'ok' : ''}
          />
          <div className="pj-inp-side">
            <span
              className={`pj-v-ico${values.password && touched.password && !errors.password ? ' show' : ''}`}
              aria-hidden
            >
              {values.password && touched.password && !errors.password ? '✅' : ''}
            </span>
            <button
              type="button"
              className="pj-eye-btn"
              onClick={togglePassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon show={showPassword} />
            </button>
          </div>
        </div>
        {touched.password && errors.password && (
          <p className="pj-field-err" id="pj-signup-password-err" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      <DragonFuryField
        id="pj-username"
        name="username"
        label="Username (optional)"
        icon="🎯"
        placeholder="Choose a username"
        autoComplete="username"
        value={values.username}
        error={errors.username}
        touched={touched.username}
        focused={focused.username}
        onFocus={() => setFocus('username', true)}
        onBlur={(e) => {
          handleBlur(e);
          setFocus('username', false);
        }}
        onChange={handleChange}
      />

      <div
        className={`pj-terms${values.terms ? ' pj-terms--checked' : ''}${touched.terms && errors.terms ? ' pj-terms--err' : ''}`}
      >
        <label className="pj-terms-box" htmlFor="pj-terms">
          <input
            id="pj-terms"
            name="terms"
            type="checkbox"
            className="pj-terms-input"
            checked={!!values.terms}
            onChange={(e) => setFieldValue('terms', e.target.checked)}
            onBlur={handleBlur}
            aria-invalid={touched.terms && errors.terms ? 'true' : undefined}
            aria-describedby={touched.terms && errors.terms ? 'pj-terms-err' : undefined}
          />
          <span className="pj-terms-check" aria-hidden="true">
            {values.terms && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2.5 7.2L5.8 10.5L11.5 3.5"
                  stroke="#1a1200"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span className="pj-terms-text">
            I agree to the{' '}
            <Link to="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              Terms &amp; Conditions
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              Privacy Policy
            </Link>
          </span>
        </label>
      </div>
      {touched.terms && errors.terms && (
        <p className="pj-field-err pj-field-err-terms" id="pj-terms-err" role="alert">
          {errors.terms}
        </p>
      )}

      <button
        type="submit"
        className={`pj-btn-login${isSubmitting ? ' ld' : ''}${shakeBtn ? ' shk' : ''}`}
        disabled={isSubmitting}
      >
        <span className="pj-btn-txt">🎮 SIGN UP &amp; PLAY</span>
        <span className="pj-spin" aria-hidden />
      </button>

      <div className="pj-c-foot">
        Already have an account? {loginLink}
      </div>
    </form>
  );
}
