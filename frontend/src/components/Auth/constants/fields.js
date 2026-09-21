export const LOGIN_FIELDS = [
  {
    name: 'email',
    label: 'Email or phone',
    type: 'text',
    placeholder: 'Email or 10-digit phone',
    autoComplete: 'username'
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Enter your password',
    autoComplete: 'current-password'
  }
];

export const SIGNUP_FIELDS = [
  {
    name: 'firstName',
    label: 'First name',
    type: 'text',
    placeholder: 'First name',
    autoComplete: 'given-name',
    required: true
  },
  {
    name: 'lastName',
    label: 'Last name',
    type: 'text',
    placeholder: 'Last name',
    autoComplete: 'family-name',
    required: true
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'Enter your email address',
    autoComplete: 'email',
    required: true
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Min 8 chars: upper, lower, number, special',
    autoComplete: 'new-password',
    required: true
  },
  {
    name: 'username',
    label: 'Username',
    type: 'text',
    placeholder: 'Enter your username (optional)',
    autoComplete: 'username'
  },
  {
    name: 'terms',
    label: 'I agree to the terms and conditions and privacy policy.',
    type: 'checkbox'
  }
];
