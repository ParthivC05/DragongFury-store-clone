'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../db/models');
const { getFirebaseMessaging } = require('../../libs/firebaseAdmin');
const { createLogger } = require('../../libs/logger');
const { normalizeStoreCode } = require('./constants');

const log = createLogger('push-campaigns');
const BATCH_SIZE = 80;

function newClickToken() {
  return crypto.randomBytes(16).toString('hex');
}

function str(value) {
  return value == null ? '' : String(value);
}

function isLocalHostUrl(url) {
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(str(url));
}

function isPublicHttpsUrl(url) {
  return /^https:\/\//i.test(str(url)) && !isLocalHostUrl(url);
}

function pushPublicOrigin(storeCode) {
  const code = normalizeStoreCode(storeCode);
  const fromStoreEnv = code
    ? str(process.env[`${code.toUpperCase()}_FRONTEND_URL`]).split(',')[0].trim().replace(/\/+$/, '')
    : '';
  const user = str(process.env.USER_FRONTEND_URL).split(',')[0].trim().replace(/\/+$/, '');
  if (fromStoreEnv && !isLocalHostUrl(fromStoreEnv)) return fromStoreEnv;
  if (user && !isLocalHostUrl(user)) return user;
  return fromStoreEnv || user || '';
}

function frontendOrigin(storeCode) {
  return pushPublicOrigin(storeCode);
}

function absoluteAssetUrl(url, fallbackPath, storeCode) {
  const value = str(url).trim() || str(fallbackPath).trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  const origin = frontendOrigin(storeCode);
  const path = value.charAt(0) === '/' ? value : `/${value}`;
  return origin ? `${origin}${path}` : path;
}

function resolveActionUrl(actionUrl, storeCode) {
  const raw = str(actionUrl).trim() || '/';
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = frontendOrigin(storeCode);
  const path = raw.charAt(0) === '/' ? raw : `/${raw}`;
  return origin ? `${origin}${path}` : path;
}

function withClickQuery(url, clickToken, storeCode) {
  const raw = str(url).trim() || '/';
  const token = str(clickToken).trim();
  if (!token) return raw;
  try {
    const origin = frontendOrigin(storeCode);
    const u = origin ? new URL(raw, `${origin.replace(/\/+$/, '')}/`) : new URL(raw);
    u.searchParams.set('pj_click', token);
    return u.toString();
  } catch {
    const join = raw.includes('?') ? '&' : '?';
    return `${raw}${join}pj_click=${encodeURIComponent(token)}`;
  }
}

function extractClickToken(raw) {
  const value = str(raw).trim();
  if (!value) return '';
  if (/^[a-f0-9]{32}$/i.test(value)) return value.toLowerCase();
  const fromPair = /(?:pj_click|clickToken)=([a-f0-9]{32})/i.exec(value);
  if (fromPair) return fromPair[1].toLowerCase();
  try {
    const origin = frontendOrigin();
    const u = origin ? new URL(value, `${origin.replace(/\/+$/, '')}/`) : new URL(value);
    const q = u.searchParams.get('pj_click') || u.searchParams.get('clickToken') || '';
    if (!q || q === value) return '';
    if (/^[a-f0-9]{32}$/i.test(q)) return q.toLowerCase();
    return '';
  } catch {
    return '';
  }
}

function isInvalidTokenError(code = '') {
  return (
    code.includes('registration-token-not-registered') ||
    code.includes('invalid-registration-token') ||
    code.includes('invalid-argument')
  );
}

function buildMessage(campaign, device, clickToken) {
  const storeCode = campaign.storeCode;
  const title = campaign.title || 'Notification';
  const body = campaign.body || '';
  const imageUrl = absoluteAssetUrl(campaign.imageUrl, '', storeCode);
  const iconUrl = absoluteAssetUrl(campaign.iconUrl, '/favicon.ico', storeCode);
  const actionUrl = withClickQuery(resolveActionUrl(campaign.actionUrl, storeCode), clickToken, storeCode);
  const publicImage = isPublicHttpsUrl(imageUrl) ? imageUrl : '';
  const publicIcon = isPublicHttpsUrl(iconUrl) ? iconUrl : '';
  const publicAction = isPublicHttpsUrl(actionUrl) ? actionUrl : '';
  const data = {
    type: 'push_campaign',
    campaignId: str(campaign.id),
    clickToken,
    pj_click: clickToken,
    title,
    body,
    imageUrl: publicImage,
    iconUrl: publicIcon,
    actionUrl: publicAction || actionUrl,
    click_action: publicAction || actionUrl
  };

  const notification = { title, body };
  if (publicImage) notification.image = publicImage;

  const webNotification = {
    title,
    body,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200],
    tag: `push-campaign-${str(campaign.id)}`,
    renotify: true,
    data: {
      type: 'push_campaign',
      clickToken,
      pj_click: clickToken,
      actionUrl: data.actionUrl
    }
  };
  if (publicIcon) webNotification.icon = publicIcon;
  if (publicImage) webNotification.image = publicImage;

  const message = {
    token: device.token,
    notification,
    data,
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      notification: webNotification
    }
  };
  if (publicAction) {
    message.webpush.fcmOptions = { link: publicAction };
  }
  return message;
}

async function loadEligibleDevices({ userIds = null, storeCode } = {}) {
  const store = normalizeStoreCode(storeCode);
  const where = {
    permissionStatus: 'granted',
    client: { [Op.in]: ['user', 'web'] },
    token: { [Op.ne]: null }
  };
  if (store) where.storeCode = store;
  if (Array.isArray(userIds)) {
    if (!userIds.length) return [];
    where.userId = { [Op.in]: userIds };
  }
  return db.UserDeviceToken.findAll({
    where,
    attributes: ['id', 'token', 'userId', 'deviceId', 'client']
  });
}

async function sendToDevices(campaign, devices) {
  const messaging = getFirebaseMessaging();
  if (!messaging) {
    throw Object.assign(new Error('Firebase is not configured on the server.'), { statusCode: 503 });
  }

  let sent = 0;
  let failed = 0;
  let noToken = 0;
  const invalidIds = [];

  for (let i = 0; i < devices.length; i += BATCH_SIZE) {
    const chunk = devices.slice(i, i + BATCH_SIZE);
    const prepared = [];
    for (const device of chunk) {
      if (!device.token) {
        noToken += 1;
        await db.PushCampaignSend.create({
          campaignId: campaign.id,
          deviceTokenId: device.id,
          userId: device.userId || null,
          clickToken: newClickToken(),
          status: 'no_token'
        });
        continue;
      }
      const clickToken = newClickToken();
      const sendRow = await db.PushCampaignSend.create({
        campaignId: campaign.id,
        deviceTokenId: device.id,
        userId: device.userId || null,
        clickToken,
        status: 'queued'
      });
      prepared.push({ device, sendRow, message: buildMessage(campaign, device, clickToken) });
    }
    if (!prepared.length) continue;

    const response = await messaging.sendEach(prepared.map((p) => p.message));
    await Promise.all(
      response.responses.map(async (res, idx) => {
        const item = prepared[idx];
        if (res.success) {
          sent += 1;
          await item.sendRow.update({
            status: 'sent',
            successTokenCount: 1,
            sentAt: new Date()
          });
          return;
        }
        failed += 1;
        const code = res.error?.code || '';
        const errMessage = res.error?.message || 'unknown';
        await item.sendRow.update({
          status: 'failed',
          failureTokenCount: 1,
          error: `${code} ${errMessage}`.trim()
        });
        if (isInvalidTokenError(code)) invalidIds.push(item.device.id);
      })
    );
  }

  if (invalidIds.length) {
    await db.UserDeviceToken.update({ token: null }, { where: { id: { [Op.in]: invalidIds } } });
  }

  return { sent, failed, noToken, targeted: devices.length };
}

async function recordNoTokenForUsers(campaign, userIds) {
  let noToken = 0;
  for (const userId of userIds) {
    await db.PushCampaignSend.create({
      campaignId: campaign.id,
      deviceTokenId: null,
      userId,
      clickToken: newClickToken(),
      status: 'no_token',
      error: 'User has not allowed browser notifications on any device.'
    });
    noToken += 1;
  }
  return noToken;
}

async function runCampaignSend(campaignId, { testUsersOnly = false, userIds = null } = {}) {
  const campaign = await db.PushCampaign.findByPk(campaignId);
  if (!campaign) return;

  try {
    await campaign.update({ status: 'sending' });
    let devices;
    let extraNoToken = 0;
    if (Array.isArray(userIds) && userIds.length) {
      devices = await loadEligibleDevices({ userIds, storeCode: campaign.storeCode });
      const found = new Set(devices.map((d) => d.userId).filter(Boolean));
      const missing = userIds.filter((id) => !found.has(id));
      extraNoToken = await recordNoTokenForUsers(campaign, missing);
    } else if (testUsersOnly || campaign.testMode) {
      const testers = await db.PushCampaignTestUser.findAll({
        where: { campaignId: campaign.id },
        attributes: ['userId']
      });
      const ids = testers.map((t) => t.userId);
      devices = await loadEligibleDevices({ userIds: ids, storeCode: campaign.storeCode });
      const found = new Set(devices.map((d) => d.userId).filter(Boolean));
      extraNoToken = await recordNoTokenForUsers(
        campaign,
        ids.filter((id) => !found.has(id))
      );
    } else {
      devices = await loadEligibleDevices({ storeCode: campaign.storeCode });
    }

    const result = await sendToDevices(campaign, devices);
    result.noToken += extraNoToken;
    await campaign.update({
      status: 'sent',
      lastSentAt: new Date()
    });
    log.info('push campaign send complete', { campaignId, ...result });
    return result;
  } catch (err) {
    log.warn('push campaign send failed', { campaignId, error: err.message });
    await campaign.update({ status: 'failed' }).catch(() => {});
    throw err;
  }
}

async function recordClick(clickToken) {
  const token = extractClickToken(clickToken);
  if (!token) {
    const e = new Error('clickToken is required.');
    e.statusCode = 400;
    throw e;
  }
  const row = await db.PushCampaignSend.findOne({
    where: { clickToken: { [Op.iLike]: token } }
  });
  if (!row) {
    const e = new Error('Send not found.');
    e.statusCode = 404;
    throw e;
  }
  if (!row.clickedAt) {
    await row.update({ clickedAt: new Date() });
    log.info('push campaign click recorded', {
      campaignId: row.campaignId,
      sendId: row.id,
      userId: row.userId || null,
      deviceTokenId: row.deviceTokenId || null
    });
  }
  return { clicked: true, campaignId: row.campaignId };
}

module.exports = {
  loadEligibleDevices,
  runCampaignSend,
  recordClick,
  resolveActionUrl,
  extractClickToken
};
