'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { EMAIL_CAMPAIGN_STORE_CODE, isEmailCampaignStoreAllowed, normalizeStoreCode } = require('./constants');
const { renderCampaignEmail, discountLabel } = require('./renderCampaignEmail.service');
const { getPlayjuwaMailConfig, sendPlayjuwaCampaignEmail } = require('./dragonfuryMail.service');
const { canViewPlayerEmail, stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');

function err(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function assertPlayjuwaScope(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) throw err('Not allowed.', 403);
  if (req.role === ROLES.STORE_ADMIN) {
    if (!isEmailCampaignStoreAllowed(req.storeCode)) {
      throw err('Email campaigns are only available for DragonFury.', 403);
    }
    return EMAIL_CAMPAIGN_STORE_CODE;
  }
  if (req.role === ROLES.MASTER_ADMIN) {
    const requested = normalizeStoreCode(req.query?.storeCode || req.body?.storeCode || req.storeCode);
    if (requested && requested !== EMAIL_CAMPAIGN_STORE_CODE) {
      throw err('Email campaigns are only available for DragonFury.', 403);
    }
    return EMAIL_CAMPAIGN_STORE_CODE;
  }
  throw err('Not allowed.', 403);
}

function serializeCampaign(row) {
  if (!row) return null;
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    storeCode: j.storeCode,
    name: j.name,
    triggerType: j.triggerType,
    triggerDays: j.triggerDays,
    isEnabled: j.isEnabled,
    testMode: j.testMode,
    subject: j.subject,
    preheader: j.preheader,
    blocks: Array.isArray(j.blocks) ? j.blocks : [],
    contentMode: 'global',
    bodyHtml: '',
    logoUrl: j.logoUrl || '',
    bannerUrl: j.bannerUrl || '',
    discountCode: j.discountCode,
    discountValueType: j.discountValueType,
    discountValue: j.discountValue != null ? Number(j.discountValue) : null,
    discountMinDeposit: j.discountMinDeposit != null ? Number(j.discountMinDeposit) : null,
    discountMaxBonusCap: j.discountMaxBonusCap != null ? Number(j.discountMaxBonusCap) : null,
    bonusCodeId: j.bonusCodeId,
    batchSize: j.batchSize,
    maxPerHour: j.maxPerHour,
    claimTokenTtlDays: j.claimTokenTtlDays,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt
  };
}

async function upsertLinkedBonusCode(campaign, transaction) {
  const code = String(campaign.discountCode || '').trim().toUpperCase();
  if (!code) return null;
  const valueType = String(campaign.discountValueType || 'fixed').toLowerCase();
  const value = Number(campaign.discountValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw err('Discount value must be a positive number.');
  }
  if (!['fixed', 'percent', 'percentage'].includes(valueType)) {
    throw err('discountValueType must be fixed or percentage.');
  }
  // bonus_codes_value_type_chk only allows 'fixed' | 'percentage'
  const normalizedType = valueType === 'percent' || valueType === 'percentage' ? 'percentage' : 'fixed';

  let bonus = null;
  if (campaign.bonusCodeId) {
    bonus = await db.BonusCode.findByPk(campaign.bonusCodeId, { transaction });
  }
  if (!bonus) {
    bonus = await db.BonusCode.findOne({
      where: { storeCode: EMAIL_CAMPAIGN_STORE_CODE, code },
      transaction
    });
  }

  const payload = {
    code,
    storeCode: EMAIL_CAMPAIGN_STORE_CODE,
    bonusType: 'deposit',
    claimScope: 'fixed_count',
    maxClaimsPerUser: 1,
    valueType: normalizedType,
    value,
    maxBonusCap: campaign.discountMaxBonusCap != null ? Number(campaign.discountMaxBonusCap) : null,
    minDeposit: campaign.discountMinDeposit != null ? Number(campaign.discountMinDeposit) : null,
    isActive: true
  };

  if (bonus) {
    await bonus.update(payload, { transaction });
    return bonus.id;
  }
  const created = await db.BonusCode.create(payload, { transaction });
  return created.id;
}

function parseCampaignBody(body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw err('name is required.');
  const triggerDays = Math.max(1, parseInt(body.triggerDays, 10) || 3);
  const discountCode = body.discountCode != null ? String(body.discountCode).trim().toUpperCase() : null;
  const discountValueType = body.discountValueType != null ? String(body.discountValueType).trim().toLowerCase() : null;
  const discountValue = body.discountValue != null && body.discountValue !== '' ? Number(body.discountValue) : null;
  const logoUrl = body.logoUrl != null ? String(body.logoUrl).trim() : '';
  const bannerUrl = body.bannerUrl != null ? String(body.bannerUrl).trim() : '';
  return {
    name,
    triggerType: 'no_deposit',
    triggerDays,
    isEnabled: body.isEnabled === true,
    testMode: body.testMode !== false,
    subject: String(body.subject || '').trim(),
    preheader: body.preheader != null ? String(body.preheader).trim() : null,
    blocks: [],
    contentMode: 'global',
    bodyHtml: null,
    logoUrl: logoUrl || null,
    bannerUrl: bannerUrl || null,
    discountCode: discountCode || null,
    discountValueType: discountValueType || null,
    discountValue: Number.isFinite(discountValue) ? discountValue : null,
    discountMinDeposit:
      body.discountMinDeposit != null && body.discountMinDeposit !== ''
        ? Number(body.discountMinDeposit)
        : null,
    discountMaxBonusCap:
      body.discountMaxBonusCap != null && body.discountMaxBonusCap !== ''
        ? Number(body.discountMaxBonusCap)
        : null,
    batchSize: body.batchSize != null && body.batchSize !== '' ? parseInt(body.batchSize, 10) : 10,
    maxPerHour: body.maxPerHour != null && body.maxPerHour !== '' ? parseInt(body.maxPerHour, 10) : 40,
    claimTokenTtlDays: Math.max(1, parseInt(body.claimTokenTtlDays, 10) || 7)
  };
}

async function listCampaigns(req) {
  assertPlayjuwaScope(req);
  const rows = await db.EmailCampaign.findAll({
    where: { storeCode: EMAIL_CAMPAIGN_STORE_CODE },
    order: [['id', 'DESC']]
  });
  const ids = rows.map((r) => r.id);
  const sendCounts = {};
  if (ids.length && db.EmailCampaignSend) {
    const counts = await db.EmailCampaignSend.findAll({
      attributes: [
        'campaignId',
        'status',
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cnt']
      ],
      where: { campaignId: { [Op.in]: ids } },
      group: ['campaignId', 'status'],
      raw: true
    });
    counts.forEach((c) => {
      if (!sendCounts[c.campaignId]) sendCounts[c.campaignId] = {};
      sendCounts[c.campaignId][c.status] = Number(c.cnt) || 0;
    });
  }
  return {
    campaigns: rows.map((r) => ({
      ...serializeCampaign(r),
      sendCounts: sendCounts[r.id] || {}
    }))
  };
}

async function getCampaign(req, id) {
  assertPlayjuwaScope(req);
  const row = await db.EmailCampaign.findOne({
    where: { id, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!row) throw err('Campaign not found.', 404);
  return serializeCampaign(row);
}

async function createCampaign(req, body) {
  assertPlayjuwaScope(req);
  const data = parseCampaignBody(body);
  const transaction = await db.sequelize.transaction();
  try {
    const row = await db.EmailCampaign.create(
      {
        ...data,
        storeCode: EMAIL_CAMPAIGN_STORE_CODE,
        createdByUserId: req.user?.userId || null
      },
      { transaction }
    );
    if (data.discountCode && data.discountValue != null) {
      const bonusCodeId = await upsertLinkedBonusCode(row, transaction);
      await row.update({ bonusCodeId }, { transaction });
    }
    await transaction.commit();
    await row.reload();
    return serializeCampaign(row);
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

async function updateCampaign(req, id, body) {
  assertPlayjuwaScope(req);
  const row = await db.EmailCampaign.findOne({
    where: { id, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!row) throw err('Campaign not found.', 404);

  const patch = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.triggerDays !== undefined) patch.triggerDays = Math.max(1, parseInt(body.triggerDays, 10) || 3);
  if (body.isEnabled !== undefined) patch.isEnabled = body.isEnabled === true;
  if (body.testMode !== undefined) patch.testMode = body.testMode === true;
  if (body.subject !== undefined) patch.subject = String(body.subject || '').trim();
  if (body.preheader !== undefined) patch.preheader = body.preheader != null ? String(body.preheader).trim() : null;
  if (body.logoUrl !== undefined) patch.logoUrl = body.logoUrl ? String(body.logoUrl).trim() : null;
  if (body.bannerUrl !== undefined) patch.bannerUrl = body.bannerUrl ? String(body.bannerUrl).trim() : null;
  // Always use global template going forward
  patch.contentMode = 'global';
  patch.bodyHtml = null;
  patch.blocks = [];
  if (body.discountCode !== undefined) {
    patch.discountCode = body.discountCode ? String(body.discountCode).trim().toUpperCase() : null;
  }
  if (body.discountValueType !== undefined) {
    patch.discountValueType = body.discountValueType ? String(body.discountValueType).trim().toLowerCase() : null;
  }
  if (body.discountValue !== undefined) {
    patch.discountValue =
      body.discountValue != null && body.discountValue !== '' ? Number(body.discountValue) : null;
  }
  if (body.discountMinDeposit !== undefined) {
    patch.discountMinDeposit =
      body.discountMinDeposit != null && body.discountMinDeposit !== ''
        ? Number(body.discountMinDeposit)
        : null;
  }
  if (body.discountMaxBonusCap !== undefined) {
    patch.discountMaxBonusCap =
      body.discountMaxBonusCap != null && body.discountMaxBonusCap !== ''
        ? Number(body.discountMaxBonusCap)
        : null;
  }
  if (body.batchSize !== undefined) {
    patch.batchSize = body.batchSize != null && body.batchSize !== '' ? parseInt(body.batchSize, 10) : null;
  }
  if (body.maxPerHour !== undefined) {
    patch.maxPerHour =
      body.maxPerHour != null && body.maxPerHour !== '' ? parseInt(body.maxPerHour, 10) : null;
  }
  if (body.claimTokenTtlDays !== undefined) {
    patch.claimTokenTtlDays = Math.max(1, parseInt(body.claimTokenTtlDays, 10) || 7);
  }

  const transaction = await db.sequelize.transaction();
  try {
    await row.update(patch, { transaction });
    const merged = { ...row.toJSON(), ...patch };
    if (merged.discountCode && merged.discountValue != null) {
      const bonusCodeId = await upsertLinkedBonusCode(merged, transaction);
      await row.update({ bonusCodeId }, { transaction });
    }
    await transaction.commit();
    await row.reload();
    return serializeCampaign(row);
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

async function listTestUsers(req, campaignId) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  const rows = await db.EmailCampaignTestUser.findAll({
    where: { campaignId },
    include: [
      {
        model: db.User,
        as: 'User',
        attributes: ['userId', 'email', 'username', 'firstName', 'lastName', 'createdAt', 'storeCode']
      }
    ],
    order: [['id', 'DESC']]
  });
  return {
    testUsers: rows.map((r) => {
      const user = r.User
        ? stripPlayerEmailFields({
            userId: r.User.userId,
            email: r.User.email,
            username: r.User.username,
            firstName: r.User.firstName,
            lastName: r.User.lastName,
            createdAt: r.User.createdAt
          }, req.role)
        : null;
      return {
        id: r.id,
        userId: r.userId,
        user
      };
    })
  };
}

async function addTestUser(req, campaignId, body) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);

  let user = null;
  const userId = parseInt(body.userId, 10);
  const email = body.email != null ? String(body.email).trim().toLowerCase() : '';
  if (Number.isFinite(userId)) {
    user = await db.User.findOne({
      where: { userId, storeCode: EMAIL_CAMPAIGN_STORE_CODE, deletedAt: null }
    });
  } else if (email) {
    user = await db.User.findOne({
      where: { email, storeCode: EMAIL_CAMPAIGN_STORE_CODE, deletedAt: null }
    });
  }
  if (!user) throw err('DragonFury user not found.', 404);

  const [row] = await db.EmailCampaignTestUser.findOrCreate({
    where: { campaignId, userId: user.userId },
    defaults: { campaignId, userId: user.userId }
  });
  return canViewPlayerEmail(req.role)
    ? { id: row.id, userId: user.userId, email: user.email }
    : { id: row.id, userId: user.userId };
}

async function removeTestUser(req, campaignId, testUserId) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  const n = await db.EmailCampaignTestUser.destroy({
    where: { id: testUserId, campaignId }
  });
  if (!n) throw err('Test user not found.', 404);
  return { deleted: true };
}

async function listSends(req, campaignId, query = {}) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const where = { campaignId };
  if (query.status) where.status = String(query.status);
  if (query.claimStatus) where.claimStatus = String(query.claimStatus);
  if (query.errorClass) where.errorClass = String(query.errorClass);
  const search = String(query.search || '').trim();

  let findWhere = where;
  if (search) {
    const q = `%${search}%`;
    findWhere = {
      campaignId,
      ...(query.status ? { status: String(query.status) } : {}),
      ...(query.claimStatus ? { claimStatus: String(query.claimStatus) } : {}),
      ...(query.errorClass ? { errorClass: String(query.errorClass) } : {}),
      [Op.or]: [
        { email: { [Op.iLike]: q } },
        { error: { [Op.iLike]: q } },
        { errorCode: { [Op.iLike]: q } },
        ...(/^\d+$/.test(search) ? [{ userId: parseInt(search, 10) }] : []),
        { '$User.username$': { [Op.iLike]: q } },
        { '$User.email$': { [Op.iLike]: q } }
      ]
    };
  }

  const includeUser = {
    model: db.User,
    as: 'User',
    attributes: ['userId', 'email', 'username', 'firstName', 'lastName', 'createdAt'],
    required: false
  };

  const { rows, count } = await db.EmailCampaignSend.findAndCountAll({
    where: findWhere,
    include: [includeUser],
    // Newest activity first (retries/updates rise to top), then id.
    order: [
      [db.sequelize.literal('COALESCE("EmailCampaignSend"."last_attempt_at", "EmailCampaignSend"."sent_at", "EmailCampaignSend"."updated_at", "EmailCampaignSend"."created_at")'), 'DESC'],
      ['id', 'DESC']
    ],
    limit,
    offset,
    distinct: true,
    subQuery: false
  });

  return {
    list: rows.map((r) => {
      const attempts = Array.isArray(r.attemptsLog) ? r.attemptsLog : [];
      const deliveryMessages = attempts
        .filter((a) => a && (a.source === 'delivery' || a.result === 'failed' || a.error))
        .map((a) => ({
          at: a.at,
          source: a.source,
          result: a.result,
          error: a.error || null,
          errorCode: a.errorCode || null,
          errorClass: a.errorClass || null
        }));
      const item = {
        id: r.id,
        userId: r.userId,
        status: r.status,
        claimStatus: r.claimStatus,
        discountCodeSnapshot: r.discountCodeSnapshot,
        mailgunId: r.mailgunId,
        error: r.error,
        errorClass: r.errorClass,
        errorCode: r.errorCode,
        attemptCount: r.attemptCount,
        maxAttempts: r.maxAttempts,
        lastAttemptAt: r.lastAttemptAt,
        deliveryStatus: r.deliveryStatus,
        attempts,
        deliveryMessages,
        sentAt: r.sentAt,
        claimedAt: r.claimedAt,
        codeAppliedAt: r.codeAppliedAt,
        createdAt: r.createdAt,
        user: r.User
          ? stripPlayerEmailFields({
              userId: r.User.userId,
              email: r.User.email,
              username: r.User.username,
              firstName: r.User.firstName,
              lastName: r.User.lastName,
              createdAt: r.User.createdAt
            }, req.role)
          : null
      };
      if (canViewPlayerEmail(req.role)) item.email = r.email;
      return item;
    }),
    total: count,
    page,
    limit
  };
}

async function getSendDetail(req, campaignId, sendId) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);

  const r = await db.EmailCampaignSend.findOne({
    where: { id: sendId, campaignId },
    include: [
      {
        model: db.User,
        as: 'User',
        attributes: ['userId', 'email', 'username', 'firstName', 'lastName']
      },
      db.EmailCampaignSendAttempt
        ? {
            model: db.EmailCampaignSendAttempt,
            as: 'Attempts',
            separate: true,
            order: [
              ['attemptNo', 'ASC'],
              ['id', 'ASC']
            ]
          }
        : null
    ].filter(Boolean)
  });
  if (!r) throw err('Send not found.', 404);

  const attempts =
    Array.isArray(r.Attempts) && r.Attempts.length
      ? r.Attempts.map((a) => ({
          id: a.id,
          attemptNo: a.attemptNo,
          source: a.source,
          result: a.result,
          error: a.error,
          errorCode: a.errorCode,
          errorClass: a.errorClass,
          mailgunId: a.mailgunId,
          raw: a.raw,
          at: a.createdAt
        }))
      : Array.isArray(r.attemptsLog)
        ? r.attemptsLog
        : [];

  const item = {
    id: r.id,
    userId: r.userId,
    status: r.status,
    claimStatus: r.claimStatus,
    discountCodeSnapshot: r.discountCodeSnapshot,
    mailgunId: r.mailgunId,
    error: r.error,
    errorClass: r.errorClass,
    errorCode: r.errorCode,
    attemptCount: r.attemptCount,
    maxAttempts: r.maxAttempts,
    lastAttemptAt: r.lastAttemptAt,
    deliveryStatus: r.deliveryStatus,
    attempts,
    deliveryMessages: attempts
      .filter((a) => a && a.error)
      .map((a) => ({
        at: a.at,
        source: a.source,
        result: a.result,
        error: a.error,
        errorCode: a.errorCode,
        errorClass: a.errorClass
      })),
    sentAt: r.sentAt,
    claimedAt: r.claimedAt,
    codeAppliedAt: r.codeAppliedAt,
    createdAt: r.createdAt,
    user: r.User
      ? stripPlayerEmailFields(
          {
            userId: r.User.userId,
            email: r.User.email,
            username: r.User.username,
            firstName: r.User.firstName,
            lastName: r.User.lastName
          },
          req.role
        )
      : null
  };
  if (canViewPlayerEmail(req.role)) item.email = r.email;
  return { send: item };
}

async function syncSendDelivery(req, campaignId, sendId) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  const send = await db.EmailCampaignSend.findOne({
    where: { id: sendId, campaignId },
    attributes: ['id']
  });
  if (!send) throw err('Send not found.', 404);

  const {
    syncMailgunDeliveryForSend
  } = require('./syncMailgunDeliveryEvents.service');
  const synced = await syncMailgunDeliveryForSend(sendId);
  const detail = await getSendDetail(req, campaignId, sendId);
  return { ...synced, send: detail.send };
}

async function syncCampaignDelivery(req, campaignId) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  const {
    syncMailgunDeliveryForCampaign
  } = require('./syncMailgunDeliveryEvents.service');
  return syncMailgunDeliveryForCampaign(campaignId, { limit: 50 });
}

async function previewCampaign(req, campaignId, body = {}) {
  assertPlayjuwaScope(req);
  let campaign;
  if (campaignId) {
    campaign = await db.EmailCampaign.findOne({
      where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
    });
    if (!campaign) throw err('Campaign not found.', 404);
  } else {
    campaign = parseCampaignBody(body);
  }
  const cfg = getPlayjuwaMailConfig();
  const siteUrl = (cfg.frontendUrl || '').replace(/\/$/, '');
  const vars = {
    firstName: body.firstName || 'Player',
    discountCode: body.discountCode || campaign.discountCode || 'SAMPLECODE',
    claimUrl: body.claimUrl || `${siteUrl}/claim-offer?token=preview-token`,
    siteUrl
  };
  const rendered = renderCampaignEmail(campaign, vars);
  return {
    ...rendered,
    discountLabel: discountLabel(campaign),
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    domain: cfg.domain
  };
}

async function sendTestEmail(req, campaignId, body = {}) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  if (!campaign.discountCode) throw err('Set a discount code before sending a test.', 400);

  const to = String(body.to || '').trim().toLowerCase();
  if (!to || !to.includes('@')) throw err('Valid to email is required.');

  const cfg = getPlayjuwaMailConfig();
  const siteUrl = (cfg.frontendUrl || '').replace(/\/$/, '');
  let claimToken = crypto.randomBytes(24).toString('hex');

  const user = await db.User.findOne({
    where: { email: to, storeCode: EMAIL_CAMPAIGN_STORE_CODE, deletedAt: null }
  });
  if (user) {
    const [row, created] = await db.EmailCampaignSend.findOrCreate({
      where: { campaignId: campaign.id, userId: user.userId },
      defaults: {
        campaignId: campaign.id,
        userId: user.userId,
        email: to,
        status: 'sent',
        claimToken,
        claimStatus: 'unclaimed',
        discountCodeSnapshot: campaign.discountCode,
        sentAt: new Date()
      }
    });
    if (created) {
      claimToken = row.claimToken;
    } else if (row.claimStatus === 'claimed') {
      // One-time claim already used — keep dead token; user applies code on Deposit.
      claimToken = row.claimToken;
      await row.update({
        status: 'sent',
        email: to,
        sentAt: new Date(),
        discountCodeSnapshot: campaign.discountCode,
        error: null
      });
    } else {
      // Fresh one-time link (invalidates any previous unclaimed email link).
      claimToken = crypto.randomBytes(24).toString('hex');
      await row.update({
        status: 'sent',
        email: to,
        sentAt: new Date(),
        discountCodeSnapshot: campaign.discountCode,
        claimToken,
        claimStatus: 'unclaimed',
        claimedAt: null,
        codeAppliedAt: null,
        error: null
      });
    }
  }

  const rendered = renderCampaignEmail(campaign, {
    firstName: body.firstName || user?.firstName || 'Player',
    discountCode: campaign.discountCode,
    claimUrl: `${siteUrl}/claim-offer?token=${claimToken}`,
    siteUrl
  });
  await sendPlayjuwaCampaignEmail({
    to,
    subject: `[TEST] ${rendered.subject}`,
    textPart: rendered.textPart,
    htmlPart: rendered.htmlPart
  });
  return {
    sent: true,
    to,
    claimLinkedToUser: Boolean(user),
    note: user
      ? 'Recipient is a DragonFury user — claim link will work after they log in.'
      : 'Recipient is not a DragonFury user — claim link is for preview only.'
  };
}

/**
 * Manually send the campaign email to all allowlisted test users (or one testUserId).
 */
async function sendToTestUsers(req, campaignId, body = {}) {
  assertPlayjuwaScope(req);
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  if (!campaign.discountCode) throw err('Set a discount code before sending.', 400);

  const where = { campaignId };
  const onlyId = parseInt(body.testUserId, 10);
  if (Number.isFinite(onlyId)) where.id = onlyId;

  const rows = await db.EmailCampaignTestUser.findAll({
    where,
    include: [
      {
        model: db.User,
        as: 'User',
        attributes: ['userId', 'email', 'firstName', 'lastName', 'username']
      }
    ],
    order: [['id', 'ASC']]
  });
  if (!rows.length) throw err('No test users to send to. Add users first.', 400);

  const cfg = getPlayjuwaMailConfig();
  const siteUrl = (cfg.frontendUrl || '').replace(/\/$/, '');
  const delayMs = Math.max(0, cfg.delayMs || 200);

  let sent = 0;
  let failed = 0;
  const results = [];

  for (const tu of rows) {
    const user = tu.User;
    const email = String(user?.email || '').trim().toLowerCase();
    if (!user || !email) {
      failed += 1;
      results.push({ testUserId: tu.id, ok: false, error: 'Missing user email' });
      continue;
    }

    try {
      let claimToken = crypto.randomBytes(24).toString('hex');
      const [sendRow, created] = await db.EmailCampaignSend.findOrCreate({
        where: { campaignId: campaign.id, userId: user.userId },
        defaults: {
          campaignId: campaign.id,
          userId: user.userId,
          email,
          status: 'sent',
          claimToken,
          claimStatus: 'unclaimed',
          discountCodeSnapshot: campaign.discountCode,
          sentAt: new Date()
        }
      });
      if (created) {
        claimToken = sendRow.claimToken;
      } else if (sendRow.claimStatus === 'claimed') {
        claimToken = sendRow.claimToken;
        await sendRow.update({
          status: 'sent',
          email,
          sentAt: new Date(),
          discountCodeSnapshot: campaign.discountCode,
          error: null
        });
      } else {
        claimToken = crypto.randomBytes(24).toString('hex');
        await sendRow.update({
          status: 'sent',
          email,
          sentAt: new Date(),
          discountCodeSnapshot: campaign.discountCode,
          claimToken,
          claimStatus: 'unclaimed',
          claimedAt: null,
          codeAppliedAt: null,
          error: null
        });
      }

      const rendered = renderCampaignEmail(campaign, {
        firstName: user.firstName || 'Player',
        discountCode: campaign.discountCode,
        claimUrl: `${siteUrl}/claim-offer?token=${claimToken}`,
        siteUrl
      });
      await sendPlayjuwaCampaignEmail({
        to: email,
        subject: rendered.subject,
        textPart: rendered.textPart,
        htmlPart: rendered.htmlPart
      });
      sent += 1;
      results.push({ testUserId: tu.id, userId: user.userId, email, ok: true });
    } catch (e) {
      failed += 1;
      results.push({
        testUserId: tu.id,
        userId: user.userId,
        email,
        ok: false,
        error: e.message || 'Send failed'
      });
    }

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return { sent, failed, total: rows.length, results };
}

async function countEligible(req, campaignId) {
  assertPlayjuwaScope(req);
  const { countEligibleUsers } = require('./runPlayjuwaNoDepositCampaign.service');
  const campaign = await db.EmailCampaign.findOne({
    where: { id: campaignId, storeCode: EMAIL_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  const count = await countEligibleUsers(campaign);
  return { eligibleCount: count };
}

module.exports = {
  assertPlayjuwaScope,
  serializeCampaign,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  listTestUsers,
  addTestUser,
  removeTestUser,
  listSends,
  getSendDetail,
  syncSendDelivery,
  syncCampaignDelivery,
  previewCampaign,
  sendTestEmail,
  sendToTestUsers,
  countEligible
};
