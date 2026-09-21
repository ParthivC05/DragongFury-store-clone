import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from 'formik';
import { submitOrRevealErrors } from './submitOrRevealErrors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DragonFuryForgotPasswordForm({
  formik,
  isSubmitting,
  shakeBtn,
  onEmptySubmit
}) {
  const { values, errors, touched, handleChange, handleBlur } = formik;
  const [emailFocused, setEmailFocused] = useState(false);

  const emailVal = values.email ?? '';
  const emailLen = emailVal.length;
  const emailOk = EMAIL_RE.test(emailVal.trim());
  const emailShowIcon = emailLen > 4 && !errors.email;
  const emailErr = (touched.email && errors.email) || (emailLen > 4 && !emailOk);

  const onSubmit = (e) => {
    e.preventDefault();
    submitOrRevealErrors(formik, onEmptySubmit);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="pj-field">
        <label htmlFor="pj-forgot-email" className={`pj-f-label${emailFocused ? ' focused' : ''}`}>
          <span className="ico" aria-hidden>
            ✉️
          </span>
          Email Address
        </label>
        <div className="pj-inp-wrap">
          <Field
            id="pj-forgot-email"
            name="email"
            type="email"
            value={emailVal}
            onChange={handleChange}
            onBlur={(e) => {
              handleBlur(e);
              setEmailFocused(false);
            }}
            onFocus={() => setEmailFocused(true)}
            placeholder="Enter your email address"
            autoComplete="email"
            aria-invalid={emailErr ? 'true' : undefined}
            aria-describedby={touched.email && errors.email ? 'pj-forgot-email-err' : undefined}
            className={emailErr ? 'err' : emailOk && emailLen > 4 ? 'ok' : ''}
          />
          <div className="pj-inp-side">
            <span className={`pj-v-ico${emailShowIcon ? ' show' : ''}`} aria-hidden>
              {emailOk ? '✅' : emailLen > 4 ? '❌' : ''}
            </span>
          </div>
        </div>
        {touched.email && errors.email && (
          <p className="pj-field-err" id="pj-forgot-email-err" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <button
        type="submit"
        className={`pj-btn-login${isSubmitting ? ' ld' : ''}${shakeBtn ? ' shk' : ''}`}
        disabled={isSubmitting}
      >
        <span className="pj-btn-txt">📧 SEND RESET LINK</span>
        <span className="pj-spin" aria-hidden />
      </button>

      <div className="pj-c-foot">
        Remember your password?{' '}
        <Link to="/login" className="pj-forgot-lnk" style={{ color: 'var(--pj-gold)' }}>
          Log In
        </Link>
      </div>
    </form>
  );
}
