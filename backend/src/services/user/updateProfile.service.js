const db = require('../../db/models');

/** Whitelist: only these fields can be updated. Never accept email, username, password, profileImageUrl. */
const ALLOWED_KEYS = [
  'firstName',
  'lastName',
  'phone',
  'dateOfBirth',
  'streetAddress',
  'city',
  'state',
  'country',
  'zipCode'
];

/** Only phone is mandatory for profile updates (purchase gate). Other fields are optional. */
const REQUIRED_KEYS = ['phone'];

const MAX_LENGTHS = {
  firstName: 100,
  lastName: 100,
  phone: 30,
  streetAddress: 255,
  city: 100,
  state: 100,
  country: 100,
  zipCode: 20
};

const MIN_LENGTHS = {
  phone: 1
};

const FIELD_LABELS = {
  firstName: 'First name',
  lastName: 'Last name',
  phone: 'Phone number',
  dateOfBirth: 'Date of birth',
  streetAddress: 'Street address',
  city: 'City',
  state: 'State',
  country: 'Country',
  zipCode: 'Zip code'
};

/** Only letters a-z, A-Z allowed; no numbers, spaces, hyphens, underscores, or special characters. */
const NAME_LETTERS_ONLY = /^[a-zA-Z]+$/;

function trim(value) {
  if (value == null) return '';
  return String(value).trim();
}

function validateRequired(body) {
  const errors = [];
  for (const key of REQUIRED_KEYS) {
    const raw = body[key];
    const value = trim(raw);
    if (value === '') {
      errors.push(`${FIELD_LABELS[key]} is required.`);
    }
  }
  return errors;
}

function validateLengths(body) {
  const errors = [];
  for (const key of Object.keys(MAX_LENGTHS)) {
    const value = trim(body[key]);
    if (value && value.length > MAX_LENGTHS[key]) {
      errors.push(`${FIELD_LABELS[key]} must be at most ${MAX_LENGTHS[key]} characters.`);
    }
  }
  for (const key of Object.keys(MIN_LENGTHS)) {
    const value = trim(body[key]);
    if (value !== '' && value.length < MIN_LENGTHS[key]) {
      errors.push(`${FIELD_LABELS[key]} must be at least ${MIN_LENGTHS[key]} character(s).`);
    }
  }
  return errors;
}

function validateNameFormat(body) {
  const errors = [];
  const msg = 'Only letters (a-z, A-Z) are allowed; no numbers, spaces, hyphens, or special characters.';
  const first = trim(body.firstName);
  const last = trim(body.lastName);
  if (first && !NAME_LETTERS_ONLY.test(first)) {
    errors.push(`First name: ${msg}`);
  }
  if (last && !NAME_LETTERS_ONLY.test(last)) {
    errors.push(`Last name: ${msg}`);
  }
  return errors;
}

function validateDateOfBirth(value) {
  const v = trim(value);
  if (!v) return { valid: true, value: null };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { valid: false, error: 'Date of birth must be a valid date.' };
  const iso = d.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (iso > today) return { valid: false, error: 'Date of birth cannot be in the future.' };
  return { valid: true, value: iso };
}

async function updateProfile(userId, body) {
  if (!body || typeof body !== 'object') {
    const err = new Error('Invalid request.');
    err.statusCode = 400;
    throw err;
  }

  const user = await db.User.findByPk(userId, {
    attributes: ['userId', 'isEmailVerified', 'role', 'isAdmin']
  });
  if (!user) {
    const err = new Error('Your session may have expired. Please sign in again.');
    err.statusCode = 404;
    throw err;
  }

  const requiredErrors = validateRequired(body);
  if (requiredErrors.length > 0) {
    const err = new Error(requiredErrors[0]);
    err.statusCode = 400;
    throw err;
  }

  const lengthErrors = validateLengths(body);
  if (lengthErrors.length > 0) {
    const err = new Error(lengthErrors[0]);
    err.statusCode = 400;
    throw err;
  }

  const nameFormatErrors = validateNameFormat(body);
  if (nameFormatErrors.length > 0) {
    const err = new Error(nameFormatErrors[0]);
    err.statusCode = 400;
    throw err;
  }

  const dobResult = validateDateOfBirth(body.dateOfBirth);
  if (!dobResult.valid) {
    const err = new Error(dobResult.error);
    err.statusCode = 400;
    throw err;
  }

  const updates = {};
  for (const key of ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    if (key === 'dateOfBirth') {
      updates.dateOfBirth = dobResult.value;
      continue;
    }
    const trimmed = trim(body[key]);
    if (key === 'phone' && trimmed === '') {
      const err = new Error('Phone number is required.');
      err.statusCode = 400;
      throw err;
    }
    updates[key] =
      trimmed === ''
        ? null
        : trimmed.length > MAX_LENGTHS[key]
          ? trimmed.slice(0, MAX_LENGTHS[key])
          : trimmed;
  }

  const fullUser = await db.User.findByPk(userId);
  const wasProfileIncomplete = !trim(fullUser.firstName) || !trim(fullUser.lastName);

  const prevPhone = trim(fullUser.phone);
  const nextPhone = updates.phone != null ? trim(updates.phone) : prevPhone;
  const { isPhoneVerificationRequiredForStore, normalizePhoneE164 } = require('../phone/phoneOtp.service');

  if (fullUser.isPhoneVerified) {
    const normalizedPrev = normalizePhoneE164(prevPhone) || prevPhone;
    const normalizedNext = normalizePhoneE164(nextPhone) || nextPhone;
    if (normalizedNext && normalizedPrev && normalizedNext !== normalizedPrev) {
      const err = new Error('Verified phone number cannot be changed. Contact support if you need help.');
      err.statusCode = 400;
      err.code = 'PHONE_LOCKED';
      throw err;
    }
    // Keep verified phone as stored; never clear verification via profile update
    updates.phone = prevPhone || updates.phone;
  } else if (nextPhone && nextPhone !== prevPhone) {
    updates.phone = normalizePhoneE164(nextPhone) || nextPhone;
    if (await isPhoneVerificationRequiredForStore(fullUser.storeCode)) {
      updates.isPhoneVerified = false;
      updates.phoneVerifiedAt = null;
    }
  }

  await fullUser.update(updates);

  let firstTimeProfileComplete = false;
  if (wasProfileIncomplete && trim(fullUser.firstName) && trim(fullUser.lastName) && db.Notification) {
    await db.Notification.create({
      userId,
      type: 'profile_complete',
      title: 'Deposit',
      message: 'First step complete for depositing money. Complete all steps and you can deposit.',
      actionUrl: '/deposit'
    });
    firstTimeProfileComplete = true;
  }

  const data = fullUser.toJSON ? fullUser.toJSON() : fullUser;
  delete data.password;
  delete data.emailVerificationToken;
  delete data.passwordResetToken;
  delete data.passwordResetTokenExpiresAt;
  data.firstTimeProfileComplete = firstTimeProfileComplete;
  return data;
}

module.exports = { updateProfile };
