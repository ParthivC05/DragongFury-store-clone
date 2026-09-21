'use strict';

const { verifyCallbackHash } = require('../../services/onegamehub/callbacks/hash.helpers');
const { createLogger } = require('../../libs/logger');

const log = createLogger('onegamehubHash');

async function validateOneGameHubHash(req, res, next) {
  try {
    const result = await verifyCallbackHash(req.query || {});
    if (result.ok) return next();

    const error = result.error;
    log.warn('1GameHub HMAC rejected', { action: req.query?.action || null });
    return res.status(error.status || 401).json(error);
  } catch (err) {
    log.warn('1GameHub HMAC rejected', { action: req.query?.action || null, error: err.message });
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

module.exports = { validateOneGameHubHash };
