'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../../configs/app.config');

const isProduction = config.get('env') === 'production';

/**
 * Soft cap on GET /wallet/balance. Socket push is primary; this stops
 * misbehaving clients / old builds from flooding the shared backend.
 */
const balanceRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 40 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.user?.userId;
    if (userId != null) return `balance:user:${userId}`;
    return `balance:ip:${req.ip}`;
  },
  validate: { keyGeneratorIpFallback: false },
  message: { message: 'Please wait a moment and try again.' }
});

module.exports = { balanceRateLimiter };
