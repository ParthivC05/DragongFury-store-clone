const db = require('../../db/models');

const MAX_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

function trim(value) {
  if (value == null) return '';
  return String(value).trim();
}

function validateProfileImageUrl(value) {
  const v = trim(value);
  if (!v) {
    return { valid: false, error: 'Profile image URL is required.' };
  }
  if (v.length > MAX_URL_LENGTH) {
    return { valid: false, error: `Profile image URL must not exceed ${MAX_URL_LENGTH} characters.` };
  }
  try {
    const u = new URL(v);
    if (!ALLOWED_PROTOCOLS.includes(u.protocol)) {
      return { valid: false, error: 'Profile image URL must start with http:// or https://.' };
    }
  } catch (_) {
    return { valid: false, error: 'Profile image URL must be a valid URL.' };
  }
  return { valid: true, value: v };
}

async function updateProfilePhoto(userId, body) {
  if (!body || typeof body !== 'object') {
    const err = new Error('Invalid request.');
    err.statusCode = 400;
    throw err;
  }

  const user = await db.User.findByPk(userId, { attributes: ['userId'] });
  if (!user) {
    const err = new Error('Your session may have expired. Please sign in again.');
    err.statusCode = 404;
    throw err;
  }

  const result = validateProfileImageUrl(body.profileImageUrl);
  if (!result.valid) {
    const err = new Error(result.error);
    err.statusCode = 400;
    throw err;
  }

  await user.update({ profileImageUrl: result.value });
  const data = user.toJSON ? user.toJSON() : user;
  delete data.password;
  delete data.emailVerificationToken;
  delete data.passwordResetToken;
  delete data.passwordResetTokenExpiresAt;
  return data;
}

module.exports = { updateProfilePhoto };
