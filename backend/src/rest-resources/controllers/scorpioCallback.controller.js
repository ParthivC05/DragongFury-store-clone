'use strict';

const scorpio = require('../../services/scorpioplay');
const { createLogger } = require('../../libs/logger');

const log = createLogger('scorpioCallback');

/**
 * Scorpio Play seamless wallet.
 * Give this URL to Scorpio: POST {PUBLIC_BASE}/api/scorpio/callback
 * They POST command = balance | bet | win | cancel to the same endpoint.
 */
async function handle(req, res) {
  try {
    const payload = await scorpio.handleCallback(req);
    return res.status(200).json(payload);
  } catch (err) {
    log.error('Scorpio Play callback handler error', { message: err.message });
    return res.status(200).json({ statusCode: 'ERR_UNKNOWN' });
  }
}

module.exports = { handle };
