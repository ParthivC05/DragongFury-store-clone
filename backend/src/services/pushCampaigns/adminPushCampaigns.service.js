'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { PUSH_CAMPAIGN_STORE_CODE, isPushCampaignStoreAllowed, normalizeStoreCode } = require('./constants');
const { loadEligibleDevices, runCampaignSend } = require('./sendPushCampaign.service');
const { canViewPlayerEmail, stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');

function err(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function assertPlayjuwaScope(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) throw err('Not allowed.', 403);
  if (req.role === ROLES.STORE_ADMIN) {
    if (!isPushCampaignStoreAllowed(req.storeCode)) {
      throw err('Push campaigns are only available for DragonFury.', 403);
    }
    return PUSH_CAMPAIGN_STORE_CODE;
  }
  if (req.role === ROLES.MASTER_ADMIN) {
    const requested = normalizeStoreCode(req.query?.storeCode || req.body?.storeCode || req.storeCode);
    if (requested && requested !== PUSH_CAMPAIGN_STORE_CODE) {
      throw err('Push campaigns are only available for DragonFury.', 403);
    }
    return PUSH_CAMPAIGN_STORE_CODE;
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
    title: j.title || '',
    body: j.body || '',
    imageUrl: j.imageUrl || '',
    iconUrl: j.iconUrl || '',
    actionUrl: j.actionUrl || '',
    testMode: j.testMode !== false,
    status: j.status || 'draft',
    lastSentAt: j.lastSentAt || null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt
  };
}

function parseCampaignBody(body = {}, { partial = false } = {}) {
  const patch = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw err('name is required.');
    patch.name = name;
  }
  if (!partial || body.title !== undefined) {
    patch.title = String(body.title || '').trim();
    if (!patch.title) throw err('Notification title is required.');
    if (patch.title.length > 128) throw err('Title must be 128 characters or less.');
  }
  if (!partial || body.body !== undefined) {
    patch.body = String(body.body || '').trim();
  }
  if (!partial || body.imageUrl !== undefined) {
    patch.imageUrl = body.imageUrl != null ? String(body.imageUrl).trim() || null : null;
  }
  if (!partial || body.iconUrl !== undefined) {
    patch.iconUrl = body.iconUrl != null ? String(body.iconUrl).trim() || null : null;
  }
  if (!partial || body.actionUrl !== undefined) {
    patch.actionUrl = body.actionUrl != null ? String(body.actionUrl).trim() || null : null;
  }
  if (!partial || body.testMode !== undefined) {
    patch.testMode = body.testMode !== false;
  }
  return patch;
}

async function permissionStats() {
  const rows = await db.UserDeviceToken.findAll({
    attributes: [
      'permissionStatus',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cnt']
    ],
    where: {
      storeCode: PUSH_CAMPAIGN_STORE_CODE,
      client: { [Op.in]: ['user', 'web'] }
    },
    group: ['permissionStatus'],
    raw: true
  });
  const counts = { granted: 0, denied: 0, default: 0, unsupported: 0 };
  rows.forEach((r) => {
    const key = r.permissionStatus;
    if (counts[key] != null) counts[key] = Number(r.cnt) || 0;
  });
  const withToken = await db.UserDeviceToken.count({
    where: {
      storeCode: PUSH_CAMPAIGN_STORE_CODE,
      client: { [Op.in]: ['user', 'web'] },
      permissionStatus: 'granted',
      token: { [Op.ne]: null }
    }
  });
  return { ...counts, reachable: withToken };
}

async function sendCountMap(campaignIds) {
  const map = {};
  if (!campaignIds.length) return map;
  const rows = await db.PushCampaignSend.findAll({
    attributes: [
      'campaignId',
      'status',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cnt'],
      [
        db.sequelize.fn(
          'SUM',
          db.sequelize.literal(`CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END`)
        ),
        'clicked'
      ]
    ],
    where: { campaignId: { [Op.in]: campaignIds } },
    group: ['campaignId', 'status'],
    raw: true
  });
  rows.forEach((r) => {
    if (!map[r.campaignId]) map[r.campaignId] = { queued: 0, sent: 0, failed: 0, no_token: 0, clicked: 0 };
    map[r.campaignId][r.status] = Number(r.cnt) || 0;
    map[r.campaignId].clicked += Number(r.clicked) || 0;
  });
  return map;
}

async function listCampaigns(req) {
  assertPlayjuwaScope(req);
  const rows = await db.PushCampaign.findAll({
    where: { storeCode: PUSH_CAMPAIGN_STORE_CODE },
    order: [['id', 'DESC']]
  });
  const sendCounts = await sendCountMap(rows.map((r) => r.id));
  const permissions = await permissionStats();
  return {
    campaigns: rows.map((r) => ({
      ...serializeCampaign(r),
      sendCounts: sendCounts[r.id] || { queued: 0, sent: 0, failed: 0, no_token: 0, clicked: 0 }
    })),
    permissions
  };
}

async function getCampaign(req, id) {
  assertPlayjuwaScope(req);
  const row = await db.PushCampaign.findOne({
    where: { id, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!row) throw err('Campaign not found.', 404);
  return serializeCampaign(row);
}

async function createCampaign(req, body) {
  assertPlayjuwaScope(req);
  const data = parseCampaignBody(body);
  const row = await db.PushCampaign.create({
    ...data,
    storeCode: PUSH_CAMPAIGN_STORE_CODE,
    createdByUserId: req.user?.userId || null,
    status: 'draft',
    testMode: data.testMode !== false
  });
  return serializeCampaign(row);
}

async function updateCampaign(req, id, body) {
  assertPlayjuwaScope(req);
  const row = await db.PushCampaign.findOne({
    where: { id, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!row) throw err('Campaign not found.', 404);
  const patch = parseCampaignBody({ ...serializeCampaign(row), ...body }, { partial: false });
  if (body.testMode !== undefined) patch.testMode = body.testMode !== false;
  await row.update(patch);
  await row.reload();
  return serializeCampaign(row);
}

async function listTestUsers(req, campaignId) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  const rows = await db.PushCampaignTestUser.findAll({
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
      return { id: r.id, userId: r.userId, user };
    })
  };
}

async function addTestUser(req, campaignId, body) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);

  let user = null;
  const userId = parseInt(body.userId, 10);
  const email = body.email != null ? String(body.email).trim().toLowerCase() : '';
  if (Number.isFinite(userId)) {
    user = await db.User.findOne({
      where: { userId, storeCode: PUSH_CAMPAIGN_STORE_CODE, deletedAt: null }
    });
  } else if (email) {
    user = await db.User.findOne({
      where: { email, storeCode: PUSH_CAMPAIGN_STORE_CODE, deletedAt: null }
    });
  }
  if (!user) throw err('DragonFury user not found.', 404);

  const [row] = await db.PushCampaignTestUser.findOrCreate({
    where: { campaignId, userId: user.userId },
    defaults: { campaignId, userId: user.userId }
  });
  return canViewPlayerEmail(req.role)
    ? { id: row.id, userId: user.userId, email: user.email }
    : { id: row.id, userId: user.userId };
}

async function removeTestUser(req, campaignId, testUserId) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  const n = await db.PushCampaignTestUser.destroy({
    where: { id: testUserId, campaignId }
  });
  if (!n) throw err('Test user not found.', 404);
  return { deleted: true };
}

async function listSends(req, campaignId, query = {}) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 25));
  const status = query.status ? String(query.status).trim() : '';
  const search = query.search ? String(query.search).trim() : '';
  const where = { campaignId };
  if (status === 'clicked') {
    where.clickedAt = { [Op.ne]: null };
  } else if (status) {
    where.status = status;
  }
  if (search) {
    const asId = parseInt(search, 10);
    where[Op.or] = [
      ...(Number.isFinite(asId) ? [{ userId: asId }] : []),
      { clickToken: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const { count, rows } = await db.PushCampaignSend.findAndCountAll({
    where,
    include: [
      {
        model: db.User,
        as: 'User',
        attributes: ['userId', 'email', 'username'],
        required: false
      }
    ],
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize
  });

  const sendCounts = (await sendCountMap([campaignId]))[campaignId] || {
    queued: 0,
    sent: 0,
    failed: 0,
    no_token: 0,
    clicked: 0
  };

  return {
    total: count,
    page,
    pageSize,
    sendCounts,
    sends: rows.map((r) => {
      const user = r.User
        ? stripPlayerEmailFields(
            { userId: r.User.userId, email: r.User.email, username: r.User.username },
            req.role
          )
        : null;
      return {
        id: r.id,
        userId: r.userId,
        deviceTokenId: r.deviceTokenId,
        status: r.status,
        error: r.error,
        sentAt: r.sentAt,
        clickedAt: r.clickedAt,
        user
      };
    })
  };
}

async function countEligible(req, campaignId) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  let userIds = null;
  if (campaign.testMode) {
    const testers = await db.PushCampaignTestUser.findAll({
      where: { campaignId },
      attributes: ['userId']
    });
    userIds = testers.map((t) => t.userId);
  }
  const devices = await loadEligibleDevices({ userIds });
  const permissions = await permissionStats();
  return { eligibleCount: devices.length, permissions };
}

function queueSend(campaignId, opts) {
  setImmediate(() => {
    runCampaignSend(campaignId, opts).catch(() => {});
  });
}

async function sendToTestUsers(req, campaignId) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  if (!campaign.title) throw err('Save a notification title first.');
  const testers = await db.PushCampaignTestUser.count({ where: { campaignId } });
  if (!testers) throw err('Add at least one test user first.');
  queueSend(campaign.id, { testUsersOnly: true });
  return { started: true, message: 'Sending to test users.' };
}

async function sendBroadcast(req, campaignId) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  if (!campaign.title) throw err('Save a notification title first.');
  if (campaign.testMode) {
    return sendToTestUsers(req, campaignId);
  }
  queueSend(campaign.id, { testUsersOnly: false });
  return { started: true, message: 'Sending to all browsers that allowed notifications.' };
}

async function sendTest(req, campaignId, body = {}) {
  assertPlayjuwaScope(req);
  const campaign = await db.PushCampaign.findOne({
    where: { id: campaignId, storeCode: PUSH_CAMPAIGN_STORE_CODE }
  });
  if (!campaign) throw err('Campaign not found.', 404);
  if (!campaign.title) throw err('Save a notification title first.');

  let user = null;
  const userId = parseInt(body.userId, 10);
  const email = body.email != null ? String(body.email).trim().toLowerCase() : '';
  if (Number.isFinite(userId)) {
    user = await db.User.findOne({
      where: { userId, storeCode: PUSH_CAMPAIGN_STORE_CODE, deletedAt: null }
    });
  } else if (email) {
    user = await db.User.findOne({
      where: { email, storeCode: PUSH_CAMPAIGN_STORE_CODE, deletedAt: null }
    });
  }
  if (!user) throw err('DragonFury user not found.', 404);

  const result = await runCampaignSend(campaign.id, { userIds: [user.userId] });
  return { started: false, result, userId: user.userId };
}

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  listTestUsers,
  addTestUser,
  removeTestUser,
  listSends,
  countEligible,
  sendToTestUsers,
  sendBroadcast,
  sendTest
};
