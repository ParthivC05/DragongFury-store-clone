import { useState } from 'react';
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
  isSubmitting,
  shakeBtn,
  onEmptySubmit
}) {
  const { values, errors, touched, handleChange, handleBlur } = formik;
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const emailVal = values.email ?? '';
  const passVal = values.password ?? '';
  const emailLen = emailVal.length;
  const emailOk = isValidLoginId(emailVal);
  const emailShowIcon = emailLen > 4 && !errors.email;
  const emailErr = (touched.email && errors.email) || (emailLen > 4 && !emailOk);
  const phoneMode = isLikelyPhone(emailVal);

  const passOk = passVal.length > 0 && !errors.password;
  const passShowIcon = passOk && touched.password;

  const onSubmit = (e) => {
    e.preventDefault();
    submitOrRevealErrors(formik, onEmptySubmit);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="pj-field">
        <label
          htmlFor="pj-email"
          className={`pj-f-label${emailFocused ? ' focused' : ''}`}
        >
          <span className="ico" aria-hidden>
            {phoneMode ? '📱' : '✉️'}
          </span>
          Email or phone
        </label>
        <div className="pj-inp-wrap">
          <Field
            id="pj-email"
            name="email"
            type="text"
            inputMode={phoneMode ? 'tel' : 'email'}
            value={emailVal}
            onChange={handleChange}
            onBlur={(e) => {
              handleBlur(e);
              setEmailFocused(false);
            }}
            onFocus={() => setEmailFocused(true)}
            placeholder="Email or 10-digit phone"
            autoComplete="username"
            aria-invalid={emailErr ? 'true' : undefined}
            aria-describedby={touched.email && errors.email ? 'pj-email-err' : undefined}
            className={emailErr ? 'err' : emailOk && emailLen > 4 ? 'ok' : ''}
          />
          <div className="pj-inp-side">
            <span className={`pj-v-ico${emailShowIcon ? ' show' : ''}`} aria-hidden>
              {emailOk ? '✅' : emailLen > 4 ? '❌' : ''}
            </span>
          </div>
        </div>
        {touched.email && errors.email && (
          <p className="pj-field-err" id="pj-email-err" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="pj-field">
        <label
          htmlFor="pj-password"
          className={`pj-f-label${passFocused ? ' focused' : ''}`}
        >
          <span className="ico" aria-hidden>
            🔒
          </span>
          Password
        </label>
        <div className="pj-inp-wrap">
          <Field
            id="pj-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={passVal}
            onChange={handleChange}
            onBlur={(e) => {
              handleBlur(e);
              setPassFocused(false);
            }}
            onFocus={() => setPassFocused(true)}
            placeholder="Enter your password"
            autoComplete="current-password"
            aria-invalid={touched.password && errors.password ? 'true' : undefined}
            aria-describedby={touched.password && errors.password ? 'pj-password-err' : undefined}
            className={touched.password && errors.password ? 'err' : passOk ? 'ok' : ''}
          />
          <div className="pj-inp-side">
            <span className={`pj-v-ico${passShowIcon ? ' show' : ''}`} aria-hidden>
              {passShowIcon ? '✅' : ''}
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
          <p className="pj-field-err" id="pj-password-err" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      <div className="pj-forgot-row">{forgotPasswordLink}</div>

      <button
        type="submit"
        className={`pj-btn-login${isSubmitting ? ' ld' : ''}${shakeBtn ? ' shk' : ''}`}
        disabled={isSubmitting}
      >
        <span className="pj-btn-txt">🎮 LOG IN &amp; PLAY</span>
        <span className="pj-spin" aria-hidden />
      </button>

      <div className="pj-c-foot">
        Don&apos;t have an account? {registerLink}
      </div>
    </form>
  );
}
