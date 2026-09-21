'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../../configs/app.config');

const isProduction = config.get('env') === 'production';

/**
 * Rate limiter for auth endpoints (login, register, SSO).
 * Prevents brute force, token stuffing, and credential abuse.
 * Stricter in production.
 */
const authRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: isProduction ? 60 : 1000, // max requests per window per IP (at least 50+/min)
  message: { message: 'Too many sign-in attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { authRateLimiter };
