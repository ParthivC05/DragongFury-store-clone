'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { getPlayjuwaMailConfig } = require('./dragonfuryMail.service');
const { applyMailgunDeliveryEvent } = require('./handleMailgunCampaignWebhook.service');

const logger = createLogger('mailgun-campaign-events-sync');

function getMailgunClient() {
  const cfg = getPlayjuwaMailConfig();
  if (!cfg.apiKey || !cfg.domain) {
    const err = new Error('DragonFury Mailgun not configured');
    err.statusCode = 503;
    throw err;
  }
  const formData = require('form-data');
  const Mailgun = require('mailgun.js');
  const mailgun = new Mailgun(formData);
  const url = cfg.host.startsWith('http') ? cfg.host : `https://${cfg.host}`;
  const mg = mailgun.client({ username: 'api', key: cfg.apiKey, url });
  return { mg, domain: cfg.domain };
}

function normalizeMessageId(id) {
  return String(id || '')
    .trim()
    .replace(/^<|>$/g, '');
}

/**
 * Pull recent failed/delivered events from Mailgun for one send and store delivery messages.
 */
async function syncMailgunDeliveryForSend(sendId) {
  const send = await db.EmailCampaignSend.findByPk(sendId);
  if (!send) {
    const err = new Error('Send not found');
    err.statusCode = 404;
    throw err;
  }

  const { mg, domain } = getMailgunClient();
  const messageId = normalizeMessageId(send.mailgunId);
  const recipient = String(send.email || '').trim().toLowerCase();

  const queries = [];
  if (messageId) {
    queries.push({ 'message-id': messageId, limit: 25 });
  }
  if (recipient) {
    queries.push({ recipient, limit: 25, event: 'failed' });
    queries.push({ recipient, limit: 10, event: 'delivered' });
  }

  let imported = 0;
  const seen = new Set();

  for (const q of queries) {
    try {
      const res = await mg.events.get(domain, q);
      const items = res?.items || res?.body?.items || [];
      for (const item of items) {
        const key = `${item.id || item.timestamp || ''}:${item.event}:${item.recipient || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Only apply events for this recipient when matching by recipient query.
        if (recipient && item.recipient && String(item.recipient).toLowerCase() !== recipient) {
          continue;
        }

        // Prefer message-id match when we have one.
        const evMsgId = normalizeMessageId(
          item.message?.headers?.['message-id'] || item['message-id']
        );
        if (messageId && evMsgId && evMsgId !== messageId) continue;

        const already = await db.EmailCampaignSendAttempt.findOne({
          where: {
            sendId: send.id,
            source: 'delivery',
            error: item['delivery-status']?.message || item.reason || item.event || null
          },
          order: [['id', 'DESC']]
        });
        if (already && String(already.error || '') === String(item['delivery-status']?.message || item.reason || '')) {
          // still allow re-apply for status updates, but skip identical message noise
          const ageMs = Date.now() - new Date(already.createdAt).getTime();
          if (ageMs < 24 * 60 * 60 * 1000) continue;
        }

        await applyMailgunDeliveryEvent(item);
        imported += 1;
      }
    } catch (e) {
      logger.warn({ err: e.message, q }, 'Mailgun events fetch failed');
    }
  }

  await send.reload({
    include: db.EmailCampaignSendAttempt
      ? [{ model: db.EmailCampaignSendAttempt, as: 'Attempts' }]
      : []
  });

  return {
    sendId: send.id,
    imported,
    deliveryStatus: send.deliveryStatus,
    status: send.status,
    error: send.error,
    attempts: Array.isArray(send.attemptsLog) ? send.attemptsLog : []
  };
}

/**
 * Sync delivery events for recent sent rows of a campaign (admin / cron helper).
 */
async function syncMailgunDeliveryForCampaign(campaignId, { limit = 40 } = {}) {
  const sends = await db.EmailCampaignSend.findAll({
    where: {
      campaignId,
      status: { [Op.in]: ['sent', 'failed', 'failed_final', 'pending_retry'] },
      mailgunId: { [Op.ne]: null }
    },
    order: [['sentAt', 'DESC'], ['id', 'DESC']],
    limit: Math.max(1, Math.min(100, limit))
  });

  const results = [];
  for (const s of sends) {
    try {
      results.push(await syncMailgunDeliveryForSend(s.id));
    } catch (e) {
      results.push({ sendId: s.id, error: e.message });
    }
  }
  return { ok: true, checked: sends.length, results };
}

module.exports = {
  syncMailgunDeliveryForSend,
  syncMailgunDeliveryForCampaign
};
