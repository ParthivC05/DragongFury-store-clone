'use strict';

const onegamehubService = require('../../services/onegamehub');
const { createLogger } = require('../../libs/logger');

const log = createLogger('onegamehubCallback');

async function callback(req, res) {
  try {
    const result = await onegamehubService.handleCallback(req);
    const status = result?.status || 200;
    return res.status(status).json(result);
  } catch (err) {
    log.error('1GameHub callback failed', { message: err.message });
    return res.status(500).json({
      status: 500,
      error: {
        code: 'ERR001',
        message: 'Unknown error occurred.',
        display: false,
        action: 'restart'
      }
    });
  }
}

module.exports = { callback };
