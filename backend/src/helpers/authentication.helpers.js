const jwt = require('jsonwebtoken');
const config = require('../configs/app.config');

function createAccessToken(user) {
  const payload = {
    userId: user.userId,
    username: user.username,
    email: user.email,
    role: user.role || 'user',
    distributorCode: user.distributorCode != null ? user.distributorCode : null,
    storeCode: user.storeCode != null ? user.storeCode : null
  };
  const secret = config.get('jwt.tokenSecret');
  const expiresIn = config.get('jwt.tokenExpiry');
  if (!secret) {
    throw new Error('JWT_LOGIN_SECRET is required');
  }
  return jwt.sign(payload, secret, { expiresIn });
}

function createRefreshToken(user) {
  const payload = { userId: user.userId, type: 'refresh' };
  const secret = config.get('jwt.refreshTokenSecret') || config.get('jwt.tokenSecret');
  const expiresIn = config.get('jwt.refreshTokenExpiry') || '30d';
  if (!secret) {
    throw new Error('JWT_REFRESH_TOKEN_SECRET (or JWT_LOGIN_SECRET fallback) is required');
  }
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyRefreshToken(token) {
  const secret = config.get('jwt.refreshTokenSecret') || config.get('jwt.tokenSecret');
  if (!secret) {
    throw new Error('JWT_REFRESH_TOKEN_SECRET (or JWT_LOGIN_SECRET fallback) is required');
  }
  const payload = jwt.verify(token, secret);
  if (!payload || payload.type !== 'refresh' || !payload.userId) {
    const err = new Error('Invalid refresh token');
    err.statusCode = 401;
    throw err;
  }
  return payload;
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken
};
