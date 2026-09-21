'use strict';

const { createLogger } = require('../../libs/logger');
const { handleMailgunCampaignWebhook } = require('../../services/emailCampaigns/handleMailgunCampaignWebhook.service');

const logger = createLogger('mailgun-campaign-webhook-ctrl');

/**
 * POST /api/webhooks/mailgun/dragonfury-campaigns
 * Configure in Mailgun: failed, delivered, complained (and optionally rejected).
 */
async function dragonfuryCampaignMailgunWebhook(req, res) {
  try {
    const body = req.body || {};
    const result = await handleMailgunCampaignWebhook(body);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Mailgun campaign webhook failed');
    const status = err.statusCode || 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
}

module.exports = { dragonfuryCampaignMailgunWebhook };
