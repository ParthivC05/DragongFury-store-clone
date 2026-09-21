'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { normalizeStoreCode } = require('./constants');

const ALLOWED_CLIENTS = new Set(['web', 'admin', 'user']);
const ALLOWED_PERMISSIONS = new Set(['granted', 'denied', 'default', 'unsupported']);

function err(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function normalizeClient(client) {
  const key = String(client || 'user').trim().toLowerCase();
  return ALLOWED_CLIENTS.has(key) ? key : 'user';
}

function normalizePermission(permission) {
  const key = String(permission || 'default').trim().toLowerCase();
  return ALLOWED_PERMISSIONS.has(key) ? key : 'default';
}

function normalizeDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id || id.length < 8 || id.length > 64) return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return '';
  return id;
}

/** Number(null) is 0 — never treat that as a real users.user_id. */
function parseUserId(userId) {
  if (userId == null || userId === '') return null;
  const n = Number(userId);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

async function resolveLinkedUserId(userId) {
  const uid = parseUserId(userId);
  if (!uid) return null;
  const user = await db.User.findOne({
    where: { userId: uid },
    attributes: ['userId']
  });
  return user ? uid : null;
}

/**
 * Upsert a browser/device for PlayJuwa web push.
 * Guests (no userId) are allowed. Login attaches userId; logout should unlink, not delete.
 */
async function upsertPushDevice({
  userId = null,
  deviceId,
  token,
  permission,
  client = 'user',
  storeCode,
  userAgent
} = {}) {
  const store = normalizeStoreCode(storeCode);
  if (!store) throw err('storeCode is required.');
  const device = normalizeDeviceId(deviceId);
  const trimmedToken = typeof token === 'string' ? token.trim() : '';
  const permissionStatus = normalizePermission(permission);
  const clientKey = normalizeClient(client);
  const uid = await resolveLinkedUserId(userId);

  if (!device) throw err('deviceId is required.');

  let row = null;
  if (trimmedToken) {
    row = await db.UserDeviceToken.findOne({ where: { token: trimmedToken } });
  }
  if (!row) {
    row = await db.UserDeviceToken.findOne({
      where: { storeCode: store, deviceId: device }
    });
  }

  const patch = {
    deviceId: device,
    storeCode: store,
    client: clientKey,
    permissionStatus,
    userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
    lastSeenAt: new Date()
  };
  if (trimmedToken) patch.token = trimmedToken;
  if (permissionStatus !== 'granted' && !trimmedToken) {
    patch.token = null;
  }
  if (uid) patch.userId = uid;

  if (row) {
    await row.update(patch);
    return { registered: true, permissionStatus, linkedUser: Boolean(row.userId || uid) };
  }

  await db.UserDeviceToken.create({
    userId: uid || null,
    token: trimmedToken || null,
    ...patch
  });
  return { registered: true, permissionStatus, linkedUser: Boolean(uid) };
}

/** Keep the FCM token after logout so the browser still gets campaigns. */
async function unlinkPushDevice({ userId, deviceId, token } = {}) {
  if (!userId) throw err('Unauthorized', 401);
  const trimmedToken = typeof token === 'string' ? token.trim() : '';
  const device = normalizeDeviceId(deviceId);
  const where = { userId, client: { [Op.in]: ['user', 'web'] } };
  if (trimmedToken && device) {
    where[Op.or] = [{ token: trimmedToken }, { deviceId: device }];
  } else if (trimmedToken) {
    where.token = trimmedToken;
  } else if (device) {
    where.deviceId = device;
  } else {
    throw err('deviceId or token is required.');
  }

  await db.UserDeviceToken.update({ userId: null }, { where });
  return { unlinked: true };
}

/** Admin-panel FCM: still requires a logged-in admin user. */
async function registerDeviceToken(userId, token, client = 'web') {
  if (!userId) throw err('Unauthorized', 401);
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) throw err('Device token is required.');
  const clientKey = normalizeClient(client);

  const existing = await db.UserDeviceToken.findOne({ where: { token: trimmed } });
  if (existing) {
    await existing.update({
      userId,
      client: clientKey,
      permissionStatus: 'granted',
      lastSeenAt: new Date()
    });
  } else {
    await db.UserDeviceToken.create({
      userId,
      token: trimmed,
      client: clientKey,
      permissionStatus: 'granted',
      lastSeenAt: new Date()
    });
  }
  return { registered: true };
}

async function unregisterDeviceToken(userId, token) {
  if (!userId) throw err('Unauthorized', 401);
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) throw err('Device token is required.');
  await db.UserDeviceToken.destroy({ where: { userId, token: trimmed } });
  return { unregistered: true };
}

module.exports = {
  upsertPushDevice,
  unlinkPushDevice,
  registerDeviceToken,
  unregisterDeviceToken
};
