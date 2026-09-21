const jwt = require('jsonwebtoken');
const config = require('../../configs/app.config');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized', code: 'MISSING_TOKEN' });
  }
  const token = authHeader.slice(7);
  try {
    const secret = config.get('jwt.tokenSecret');
    if (!secret) {
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, secret);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role || 'user',
      distributorCode: decoded.distributorCode != null ? decoded.distributorCode : null,
      storeCode: decoded.storeCode != null ? decoded.storeCode : null
    };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized', code: 'INVALID_TOKEN' });
  }
}

async function authMiddlewareOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const secret = config.get('jwt.tokenSecret');
    if (!secret) return next();
    const decoded = jwt.verify(token, secret);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role || 'user',
      distributorCode: decoded.distributorCode != null ? decoded.distributorCode : null,
      storeCode: decoded.storeCode != null ? decoded.storeCode : null
    };
  } catch (_) { }
  next();
}

/**
 * Same as authMiddleware but allows token from body (e.g. body.token).
 * Use for register-game so custom UI can send { token, gameName } in body.
 */
function authMiddlewareWithBodyToken(req, res, next) {
  const fromHeader = req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const fromBody = req.body && (req.body.token || req.body.accessToken);
  const token = fromHeader || fromBody;
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized', code: 'MISSING_TOKEN' });
  }
  try {
    const secret = config.get('jwt.tokenSecret');
    if (!secret) {
      return res.status(500).json({ message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, secret);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role || 'user',
      distributorCode: decoded.distributorCode != null ? decoded.distributorCode : null,
      storeCode: decoded.storeCode != null ? decoded.storeCode : null
    };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized', code: 'INVALID_TOKEN' });
  }
}

module.exports = {
  authMiddleware,
  authMiddlewareOptional,
  authMiddlewareWithBodyToken
};
