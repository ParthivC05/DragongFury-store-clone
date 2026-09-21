const db = require('../../db/models');
const { comparePassword, encryptPassword, validatePasswordStrength } = require('../../utils/common');

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || typeof currentPassword !== 'string') {
    const err = new Error('Current password is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!newPassword || typeof newPassword !== 'string') {
    const err = new Error('New password is required.');
    err.statusCode = 400;
    throw err;
  }
  const pwdCheck = validatePasswordStrength(newPassword);
  if (!pwdCheck.valid) {
    const err = new Error(pwdCheck.error);
    err.statusCode = 400;
    throw err;
  }
  const trimmedCurrent = String(currentPassword).trim();
  const trimmedNew = newPassword.trim();

  if (trimmedCurrent === trimmedNew) {
    const err = new Error('New password must be different from your current password.');
    err.statusCode = 400;
    throw err;
  }

  const user = await db.User.findByPk(userId, { attributes: ['userId', 'password'] });
  if (!user) {
    const err = new Error('Your session may have expired. Please sign in again.');
    err.statusCode = 404;
    throw err;
  }
  if (!user.password) {
    const err = new Error('Password change not available for this account.');
    err.statusCode = 400;
    throw err;
  }

  const match = await comparePassword(currentPassword, user.password);
  if (!match) {
    const err = new Error('Current password is incorrect.');
    err.statusCode = 400;
    throw err;
  }

  const hashed = encryptPassword(trimmedNew);
  await user.update({ password: hashed });
  return { message: 'Password updated successfully.' };
}

module.exports = { changePassword };
