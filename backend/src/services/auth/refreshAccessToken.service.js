const db = require('../../db/models');
const { createAccessToken, verifyRefreshToken } = require('../../helpers/authentication.helpers');

function toSafeUser(user) {
  const safe = user.toJSON ? user.toJSON() : user;
  delete safe.password;
  delete safe.emailVerificationToken;
  delete safe.paymentApiPasswordEncrypted;
  return safe;
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken || typeof refreshToken !== 'string') {
    const err = new Error('Refresh token is required.');
    err.statusCode = 401;
    throw err;
  }

  const payload = verifyRefreshToken(refreshToken);
  const user = await db.User.findOne({ where: { userId: payload.userId, isActive: true } });
  if (!user) {
    const err = new Error('User not found or inactive.');
    err.statusCode = 401;
    throw err;
  }

  const token = createAccessToken(user);
  return { token, user: toSafeUser(user) };
}

module.exports = { refreshAccessToken };

