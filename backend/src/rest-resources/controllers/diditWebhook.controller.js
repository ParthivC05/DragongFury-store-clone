'use strict';

const { handleDiditWebhook } = require('../../services/kyc/diditWebhook.service');
const { logger } = require('../../libs/logger');

async function diditWebhook(req, res) {
  try {
    const result = await handleDiditWebhook(req);
    return res.status(200).json({ received: true, ...result });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) logger.error('[didit webhook] error', { message: err.message });
    return res.status(status).json({ message: err.message || 'Webhook error' });
  }
}

module.exports = { diditWebhook };
