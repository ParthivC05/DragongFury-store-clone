'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../../configs/app.config');

const isProduction = config.get('env') === 'production';

function keyByUserOrIp(req) {
  const userId = req.user?.userId;
  if (userId != null) return `user:${userId}`;
  return `ip:${req.ip}`;
}

/** Full PII CSV export — keep this tight in production. */
const contactListDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  validate: { keyGeneratorIpFallback: false },
  message: { message: 'Too many contact list downloads. Please try again later.' }
});

module.exports = {
  contactListDownloadLimiter
};
