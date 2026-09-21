const bcrypt = require('bcrypt');

const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_RULES = {
  minLength: MIN_PASSWORD_LENGTH,
  /** Must contain at least one uppercase, one lowercase, one digit, one special character */
  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/
};

function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required.' };
  }
  const trimmed = password.trim();
  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (!PASSWORD_RULES.pattern.test(trimmed)) {
    return {
      valid: false,
      error: 'Password must include uppercase, lowercase, a number, and a special character.'
    };
  }
  return { valid: true };
}

function encryptPassword(password) {
  if (!password) return null;
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(String(password), salt);
}

async function comparePassword(password, userPassword) {
  if (!password || !userPassword) return false;
  return bcrypt.compare(String(password), userPassword);
}

module.exports = {
  validatePasswordStrength,
  encryptPassword,
  comparePassword
};
