'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../../configs/app.config');

const isProduction = config.get('env') === 'production';

function keyByUserOrIp(req) {
  const userId = req.user?.userId;
  if (userId != null) return `user:${userId}`;
  return `ip:${req.ip}`;
}

/** Ticket create / reply — prevent spam. */
const supportTicketWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  validate: { keyGeneratorIpFallback: false },
  message: { message: 'Too many support ticket requests. Please try again later.' }
});

/** Image uploads — tighter than text writes. */
const supportTicketUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 40 : 400,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  validate: { keyGeneratorIpFallback: false },
  message: { message: 'Too many upload attempts. Please try again later.' }
});

module.exports = {
  supportTicketWriteLimiter,
  supportTicketUploadLimiter
};
