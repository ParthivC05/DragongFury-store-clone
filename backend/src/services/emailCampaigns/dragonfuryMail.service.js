'use strict';

const config = require('../../configs/app.config');
const { createLogger } = require('../../libs/logger');

const logger = createLogger('dragonfury-mail');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPlayjuwaMailConfig() {
  const apiKey =
    (config.get('email.dragonfury.mailgunApiKey') || '').trim() ||
    (config.get('email.mailgunApiKey') || '').trim();
  const domain = (config.get('email.dragonfury.mailgunDomain') || 'dragonfury.com').trim();
  const host =
    (config.get('email.dragonfury.mailgunHost') || '').trim() ||
    (config.get('email.mailgunHost') || 'api.mailgun.net').trim();
  const fromEmail = (config.get('email.dragonfury.mailFrom') || 'no-reply@dragonfury.com').trim();
  const fromName = (config.get('email.dragonfury.mailFromName') || 'DragonFury').trim();
  const batchSize = Number(config.get('email.dragonfury.batchSize')) || 10;
  const maxPerHour = Number(config.get('email.dragonfury.maxPerHour')) || 40;
  const delayMs = Number(config.get('email.dragonfury.delayMs')) || 1000;
  const frontendUrl =
    (config.get('email.dragonfury.frontendUrl') || '').trim() ||
    (config.get('email.frontendUrl') || '').trim();
  const webhookSigningKey =
    (config.get('email.dragonfury.mailgunWebhookSigningKey') || '').trim() ||
    (process.env.MAILGUN_WEBHOOK_SIGNING_KEY || '').trim();

  return {
    apiKey,
    domain,
    host,
    fromEmail,
    fromName,
    batchSize,
    maxPerHour,
    delayMs,
    frontendUrl,
    webhookSigningKey
  };
}

/**
 * Send one marketing email via DragonFury Mailgun settings.
 * Does NOT use transactional EMAIL_SENDER_* / MAILGUN_DOMAIN defaults unless API key is shared.
 */
async function sendPlayjuwaCampaignEmail({ to, subject, textPart, htmlPart }) {
  const cfg = getPlayjuwaMailConfig();
  if (!cfg.apiKey || !cfg.domain || !cfg.fromEmail) {
    const err = new Error(
      'DragonFury campaign email not configured. Set DRAGONFURY_MAILGUN_API_KEY (or MAILGUN_API_KEY), DRAGONFURY_MAILGUN_DOMAIN, DRAGONFURY_MAIL_FROM.'
    );
    err.statusCode = 503;
    throw err;
  }

  const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail;
  const url = cfg.host.startsWith('http') ? cfg.host : `https://${cfg.host}`;

  logger.info({ to, from: cfg.fromEmail, domain: cfg.domain }, 'Sending DragonFury campaign email');

  try {
    const formData = require('form-data');
    const Mailgun = require('mailgun.js');
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({ username: 'api', key: cfg.apiKey, url });
    const result = await mg.messages.create(cfg.domain, {
      from,
      to: [to],
      subject,
      text: textPart,
      html: htmlPart
    });
    logger.info({ to }, 'DragonFury campaign email sent');
    return { id: result && (result.id || result.message) ? String(result.id || result.message) : null };
  } catch (err) {
    const statusCode = err.statusCode || err.status || (err.response && err.response.status);
    logger.error('DragonFury Mailgun send failed', {
      statusCode: statusCode || 'none',
      message: err.message
    });
    const e = new Error(err.message || 'Failed to send campaign email.');
    e.statusCode = statusCode || 503;
    throw e;
  }
}

module.exports = {
  sleep,
  getPlayjuwaMailConfig,
  sendPlayjuwaCampaignEmail
};
