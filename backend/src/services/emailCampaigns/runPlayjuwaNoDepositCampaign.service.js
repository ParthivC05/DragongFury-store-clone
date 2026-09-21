'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { EMAIL_CAMPAIGN_STORE_CODE } = require('./constants');
const { renderCampaignEmail } = require('./renderCampaignEmail.service');
const {
  getPlayjuwaMailConfig,
  sendPlayjuwaCampaignEmail,
  sleep
} = require('./dragonfuryMail.service');
const { classifySendFailure } = require('./classifyCampaignSendError.service');
const { recordCampaignSendAttempt } = require('./recordCampaignSendAttempt.service');

const logger = createLogger('email-campaign-cron');

async function userHasCompletedDeposit(userId) {
  if (!db.DepositRequest) return false;
  const n = await db.DepositRequest.count({
    where: {
      userId,
      status: { [Op.iLike]: 'completed' }
    }
  });
  return n > 0;
}

async function getUnsubscribedEmails(storeCode) {
  if (!db.EmailUnsubscribe) return new Set();
  const rows = await db.EmailUnsubscribe.findAll({
    where: { storeCode },
    attributes: ['email'],
    raw: true
  });
  return new Set(rows.map((r) => String(r.email || '').toLowerCase()));
}

/**
 * Eligible: DragonFury, active, has email, signup older than triggerDays, no completed deposit,
 * not already in sends for this campaign, not unsubscribed; if test_mode → allowlist only.
 */
async function findEligibleUsers(campaign, { limit = 500 } = {}) {
  const days = Math.max(1, Number(campaign.triggerDays) || 3);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const unsubscribed = await getUnsubscribedEmails(EMAIL_CAMPAIGN_STORE_CODE);

  let allowlistIds = null;
  if (campaign.testMode) {
    const tus = await db.EmailCampaignTestUser.findAll({
      where: { campaignId: campaign.id },
      attributes: ['userId'],
      raw: true
    });
    allowlistIds = tus.map((t) => t.userId);
    if (!allowlistIds.length) return [];
  }

  const already = await db.EmailCampaignSend.findAll({
    where: { campaignId: campaign.id },
    attributes: ['userId'],
    raw: true
  });
  const alreadyIds = already.map((a) => a.userId);

  const where = {
    storeCode: EMAIL_CAMPAIGN_STORE_CODE,
    deletedAt: null,
    isActive: true,
    createdAt: { [Op.lte]: cutoff },
    email: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
  };
  if (allowlistIds) where.userId = { [Op.in]: allowlistIds };
  if (alreadyIds.length) {
    where.userId = where.userId
      ? { [Op.and]: [where.userId, { [Op.notIn]: alreadyIds }] }
      : { [Op.notIn]: alreadyIds };
  }

  const users = await db.User.findAll({
    where,
    attributes: ['userId', 'email', 'firstName', 'lastName', 'username', 'createdAt', 'isEmailVerified'],
    order: [['createdAt', 'ASC']],
    limit: Math.max(1, limit)
  });

  const eligible = [];
  for (const u of users) {
    const email = String(u.email || '').trim().toLowerCase();
    if (!email || unsubscribed.has(email)) continue;
    if (await userHasCompletedDeposit(u.userId)) continue;
    eligible.push(u);
  }
  return eligible;
}

async function countEligibleUsers(campaign) {
  const users = await findEligibleUsers(campaign, { limit: 10000 });
  return users.length;
}

async function enqueuePending(campaign, users) {
  const created = [];
  for (const u of users) {
    const email = String(u.email || '').trim().toLowerCase();
    const claimToken = crypto.randomBytes(24).toString('hex');
    try {
      const [row, wasCreated] = await db.EmailCampaignSend.findOrCreate({
        where: { campaignId: campaign.id, userId: u.userId },
        defaults: {
          campaignId: campaign.id,
          userId: u.userId,
          email,
          status: 'pending',
          claimToken,
          claimStatus: 'unclaimed',
          discountCodeSnapshot: campaign.discountCode || null,
          attemptCount: 0,
          maxAttempts: 2,
          attemptsLog: []
        }
      });
      if (wasCreated) created.push(row);
    } catch (e) {
      logger.warn({ err: e.message, userId: u.userId }, 'enqueue skip');
    }
  }
  return created;
}

async function countAttemptsLastHour(campaignId) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  try {
    const rows = await db.sequelize.query(
      `
      SELECT COUNT(*)::int AS cnt
      FROM email_campaign_send_attempts a
      INNER JOIN email_campaign_sends s ON s.id = a.send_id
      WHERE s.campaign_id = :campaignId
        AND a.source = 'api'
        AND a.created_at >= :since
      `,
      {
        replacements: { campaignId, since },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );
    return Number(rows?.[0]?.cnt) || 0;
  } catch {
    return db.EmailCampaignSend.count({
      where: {
        campaignId,
        lastAttemptAt: { [Op.gte]: since }
      }
    });
  }
}

/**
 * Drain pending + pending_retry within hourly cap.
 * Retryable API failures → pending_retry once; second failure → failed_final.
 */
async function drainPending(campaign) {
  const cfg = getPlayjuwaMailConfig();
  const batchSize = Math.max(1, Number(campaign.batchSize) || cfg.batchSize || 10);
  const maxPerHour = Math.max(1, Number(campaign.maxPerHour) || cfg.maxPerHour || 40);
  const delayMs = Math.max(0, cfg.delayMs || 1000);
  const siteUrl = (cfg.frontendUrl || '').replace(/\/$/, '');

  const attemptedLastHour = await countAttemptsLastHour(campaign.id);
  const remainingHour = Math.max(0, maxPerHour - attemptedLastHour);
  if (remainingHour <= 0) {
    return { sent: 0, failed: 0, skipped: 0, retried: 0, deferred: true, remainingHour: 0 };
  }

  const take = Math.min(batchSize, remainingHour);

  // Prefer pending_retry first, then fresh pending — use full take (no 30% retry cap).
  const retries = await db.EmailCampaignSend.findAll({
    where: {
      campaignId: campaign.id,
      status: 'pending_retry',
      [Op.and]: db.sequelize.literal('attempt_count < max_attempts')
    },
    order: [
      ['lastAttemptAt', 'ASC'],
      ['id', 'ASC']
    ],
    limit: take
  });

  const freshTake = Math.max(0, take - retries.length);
  const fresh = freshTake
    ? await db.EmailCampaignSend.findAll({
        where: { campaignId: campaign.id, status: 'pending' },
        order: [['id', 'ASC']],
        limit: freshTake
      })
    : [];

  const queue = [...retries, ...fresh];
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let retried = 0;

  for (const row of queue) {
    if (await userHasCompletedDeposit(row.userId)) {
      await row.update({
        status: 'skipped',
        error: 'User deposited before send',
        errorClass: 'permanent',
        lastAttemptAt: new Date()
      });
      skipped += 1;
      continue;
    }

    const user = await db.User.findByPk(row.userId, {
      attributes: ['userId', 'firstName', 'email']
    });
    const claimUrl = `${siteUrl}/claim-offer?token=${row.claimToken}`;
    const rendered = renderCampaignEmail(campaign, {
      firstName: user?.firstName || 'Player',
      discountCode: row.discountCodeSnapshot || campaign.discountCode || '',
      claimUrl,
      siteUrl
    });

    const nextAttempt = Math.max(1, Number(row.attemptCount) || 0) + 1;
    const maxAttempts = Math.max(1, Number(row.maxAttempts) || 2);
    const wasRetry = row.status === 'pending_retry';

    try {
      const result = await sendPlayjuwaCampaignEmail({
        to: row.email,
        subject: rendered.subject,
        textPart: rendered.textPart,
        htmlPart: rendered.htmlPart
      });
      const mailgunId = result?.id || null;
      await row.update({
        status: 'sent',
        sentAt: new Date(),
        mailgunId,
        error: null,
        errorClass: null,
        errorCode: null,
        attemptCount: nextAttempt,
        lastAttemptAt: new Date(),
        deliveryStatus: 'accepted'
      });
      await recordCampaignSendAttempt(db, row, {
        attemptNo: nextAttempt,
        source: 'api',
        result: 'sent',
        mailgunId
      });
      sent += 1;
      if (wasRetry) retried += 1;
    } catch (e) {
      const classified = classifySendFailure(e.message, e.statusCode);
      const canRetry =
        classified.errorClass === 'retryable' && nextAttempt < maxAttempts;
      const nextStatus = canRetry
        ? 'pending_retry'
        : nextAttempt >= maxAttempts
          ? 'failed_final'
          : 'failed';

      await row.update({
        status: nextStatus,
        error: e.message || 'send failed',
        errorClass: classified.errorClass,
        errorCode: classified.errorCode,
        attemptCount: nextAttempt,
        lastAttemptAt: new Date(),
        deliveryStatus: 'api_failed'
      });
      await recordCampaignSendAttempt(db, row, {
        attemptNo: nextAttempt,
        source: 'api',
        result: 'failed',
        error: e.message || 'send failed',
        errorCode: classified.errorCode,
        errorClass: classified.errorClass,
        raw: {
          statusCode: e.statusCode || null,
          reason: classified.reason
        }
      });
      failed += 1;
      if (wasRetry) retried += 1;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return {
    sent,
    failed,
    skipped,
    retried,
    deferred: false,
    remainingHour: remainingHour - queue.length
  };
}

/**
 * Cron entry: only DragonFury no-deposit campaigns.
 * Sends only when admin has is_enabled=true (and test_mode + allowlist when test mode is on).
 */
async function runPlayjuwaNoDepositCampaigns() {
  const campaigns = await db.EmailCampaign.findAll({
    where: {
      storeCode: EMAIL_CAMPAIGN_STORE_CODE,
      isEnabled: true,
      triggerType: 'no_deposit'
    }
  });

  if (!campaigns.length) {
    return { ok: true, campaigns: 0, results: [], reason: 'No admin-enabled DragonFury campaigns' };
  }

  const results = [];
  for (const campaign of campaigns) {
    if (!campaign.discountCode || !campaign.bonusCodeId) {
      results.push({
        campaignId: campaign.id,
        error: 'Campaign missing discount code / bonus link'
      });
      continue;
    }
    const eligible = await findEligibleUsers(campaign, { limit: 2000 });
    const enqueued = await enqueuePending(campaign, eligible);
    const drain = await drainPending(campaign);
    results.push({
      campaignId: campaign.id,
      testMode: campaign.testMode === true,
      maxPerHour: campaign.maxPerHour,
      eligible: eligible.length,
      enqueued: enqueued.length,
      ...drain
    });
  }

  return { ok: true, campaigns: campaigns.length, results };
}

module.exports = {
  userHasCompletedDeposit,
  findEligibleUsers,
  countEligibleUsers,
  runPlayjuwaNoDepositCampaigns
};
