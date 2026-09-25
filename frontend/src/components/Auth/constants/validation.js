import * as Yup from 'yup';

const NAME_LETTERS_ONLY = /^[a-zA-Z]+$/;
const NAME_MESSAGE = 'Only letters (a–z, A–Z) are allowed.';

const emailRule = Yup.string()
  .trim()
  .required('Email is required.')
  .email('Please enter a valid email address (e.g. name@example.com).');

const PASSWORD_MIN = 8;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const PASSWORD_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.';

const passwordRule = Yup.string()
  .required('Password is required.')
  .min(PASSWORD_MIN, PASSWORD_MESSAGE)
  .matches(PASSWORD_PATTERN, PASSWORD_MESSAGE);

export const LOGIN_VALIDATION = Yup.object().shape({
  email: Yup.string()
    .trim()
    .required('Email or phone number is required.')
    .test('email-or-phone', 'Enter a valid email or 10-digit US phone number.', (value) => {
      const s = String(value || '').trim();
      if (!s) return false;
      if (s.includes('@')) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
      }
      const digits = s.replace(/\D/g, '');
      if (digits.length === 10) return true;
      if (digits.length === 11 && digits.startsWith('1')) return true;
      return /^\+1\d{10}$/.test(s.replace(/[^\d+]/g, ''));
    }),
  password: Yup.string().required('Password is required.')
});

export const FORGOT_PASSWORD_VALIDATION = Yup.object().shape({
  email: emailRule
});

export const RESET_PASSWORD_VALIDATION = Yup.object().shape({
  newPassword: passwordRule,
  confirmPassword: Yup.string()
    .required('Confirm new password is required.')
    .oneOf([Yup.ref('newPassword')], 'New password and confirm password do not match.')
});

export const SIGNUP_VALIDATION = Yup.object().shape({
  firstName: Yup.string()
    .trim()
    .required('First name is required.')
    .matches(NAME_LETTERS_ONLY, NAME_MESSAGE)
    .min(1, 'First name is required.')
    .max(100, 'First name must be at most 100 characters.'),
  lastName: Yup.string()
    .trim()
    .required('Last name is required.')
    .matches(NAME_LETTERS_ONLY, NAME_MESSAGE)
    .min(1, 'Last name is required.')
    .max(100, 'Last name must be at most 100 characters.'),
  email: emailRule,
  password: passwordRule,
  username: Yup.string().trim().max(255, 'Username must be at most 255 characters.'),
  referral: Yup.string().trim().max(64, 'Referral code must be at most 64 characters.'),
  terms: Yup.boolean()
    .oneOf([true], 'You must agree to the terms and conditions and privacy policy to sign up.')
});
