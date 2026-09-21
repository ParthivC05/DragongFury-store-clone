const db = require('../../db/models');
const { encryptPassword, validatePasswordStrength } = require('../../utils/common');

async function resetPassword(token, newPassword) {
  if (!token || typeof token !== 'string') {
    const err = new Error('Invalid reset link. Please request a new one.');
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
  const trimmed = newPassword.trim();

  const user = await db.User.findOne({
    where: { passwordResetToken: token }
  });
  if (!user) {
    const err = new Error('Invalid or expired reset link. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }
  const expiresAt = user.passwordResetTokenExpiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    await user.update({
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null
    });
    const err = new Error('This reset link has expired. Please request a new one.');
    err.statusCode = 400;
    throw err;
  }

  const hashed = encryptPassword(trimmed);
  await user.update({
    password: hashed,
    passwordResetToken: null,
    passwordResetTokenExpiresAt: null
  });
  return { message: 'Your password has been reset. You can now sign in with your new password.' };
}

module.exports = { resetPassword };
