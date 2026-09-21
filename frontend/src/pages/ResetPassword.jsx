import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { useToast } from '../context/ToastContext';
import { usePageContentReady } from '../context/PageReadyContext';
import * as authApi from '../api/auth';

const cardClass = 'max-w-lg mx-auto p-8 bg-card border border-gray-700 rounded-xl';
const inputClass =
  'w-full py-2.5 px-4 text-base text-gray-100 bg-input border border-gray-600 rounded-lg placeholder:text-muted focus:outline-none focus:border-primary';
const inputClassError = inputClass + ' border-red-500';
const labelClass = 'block mb-1.5 text-sm font-medium text-gray-400';

const PASSWORD_MIN = 8;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const PASSWORD_STRENGTH_MSG =
  'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.';

const RESET_VALIDATION = Yup.object().shape({
  newPassword: Yup.string()
    .required('New password is required.')
    .min(PASSWORD_MIN, PASSWORD_STRENGTH_MSG)
    .matches(PASSWORD_PATTERN, PASSWORD_STRENGTH_MSG),
  confirmPassword: Yup.string()
    .required('Confirm new password is required.')
    .oneOf([Yup.ref('newPassword')], 'New password and confirm password do not match.')
});

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast } = useToast();
  const [success, setSuccess] = useState(false);

  usePageContentReady(true);

  useEffect(() => {
    if (!token) {
      toast.error('Invalid reset link. Please request a new password reset link.');
    }
  }, [token, toast]);

  if (success) {
    return (
      <div className={`${cardClass} mt-10`}>
        <h1 className="mb-2 text-xl font-bold text-green-500">Password reset</h1>
        <p className="text-gray-400 mb-6">You can now sign in with your new password.</p>
        <Link to="/login" className="btn-cta w-auto px-6 py-2.5 no-underline inline-block">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className={`${cardClass} mt-10`}>
      <h1 className="mb-2 text-xl font-bold text-gray-100">Reset password</h1>
      <p className="text-gray-400 mb-6">Enter your new password below. Use at least 8 characters with uppercase, lowercase, a number, and a special character.</p>
      {!token ? (
        <Link to="/forgot-password" className="text-primary hover:underline">Request a new reset link</Link>
      ) : (
        <Formik
          initialValues={{ newPassword: '', confirmPassword: '' }}
          validationSchema={RESET_VALIDATION}
          onSubmit={async (values) => {
            try {
              await authApi.resetPassword(token, values.newPassword);
              toast.success('Your password has been reset. You can now sign in.');
              setSuccess(true);
            } catch (err) {
              const msg =
                err.status >= 500 || err.body?.code === 'EMAIL_SERVICE_UNAVAILABLE'
                  ? 'Something went wrong. Please try again later or request a new reset link.'
                  : (err.message || 'Failed to reset password. Please request a new link.');
              toast.error(msg);
            }
          }}
        >
          {({ errors, touched, isSubmitting }) => (
            <Form>
              <div className="mb-4">
                <label htmlFor="new-password" className={labelClass}>
                  New password
                </label>
                <Field
                  id="new-password"
                  name="newPassword"
                  type="password"
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className={touched.newPassword && errors.newPassword ? inputClassError : inputClass}
                />
                {touched.newPassword && errors.newPassword && (
                  <p className="mt-1 text-xs text-red-500">{errors.newPassword}</p>
                )}
              </div>
              <div className="mb-6">
                <label htmlFor="confirm-password" className={labelClass}>
                  Confirm new password
                </label>
                <Field
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  className={touched.confirmPassword && errors.confirmPassword ? inputClassError : inputClass}
                />
                {touched.confirmPassword && errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>
                )}
              </div>
              <button type="submit" disabled={isSubmitting} className="btn-cta w-full">
                {isSubmitting ? 'Resetting…' : 'Reset password'}
              </button>
            </Form>
          )}
        </Formik>
      )}
    </div>
  );
}
