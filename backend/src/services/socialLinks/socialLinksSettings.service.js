const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

const KEY = 'social_links';

const DEFAULTS = {
  facebook: '',
  telegram: '',
  messenger: '',
  whatsapp: '',
};

const PLATFORM_KEYS = ['facebook', 'telegram', 'messenger', 'whatsapp'];

const PLATFORM_LABELS = {
  facebook: 'Facebook',
  telegram: 'Facebook Group',
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
};

function validateSocialUrl(input, label) {
  if (input == null || (typeof input === 'string' && !String(input).trim())) {
    return { ok: true, value: '' };
  }
  const s = String(input).trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: `${label} must be a valid URL (https://...)` };
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    return { ok: false, error: `${label} must use http:// or https://` };
  }
  return { ok: true, value: u.toString() };
}

function parseRow(row) {
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    return {
      facebook: parsed.facebook != null ? String(parsed.facebook).trim() : '',
      telegram: parsed.telegram != null ? String(parsed.telegram).trim() : '',
      messenger: parsed.messenger != null ? String(parsed.messenger).trim() : '',
      whatsapp: parsed.whatsapp != null ? String(parsed.whatsapp).trim() : '',
    };
  } catch {
    return null;
  }
}

function normalizePayload(payload = {}) {
  const out = { ...DEFAULTS };
  for (const id of PLATFORM_KEYS) {
    const v = validateSocialUrl(payload[id], PLATFORM_LABELS[id] || id);
    if (!v.ok) {
      const err = new Error(v.error);
      err.statusCode = 400;
      throw err;
    }
    out[id] = v.value;
  }
  return out;
}

async function readFromSetting(distributorCode, storeCode) {
  const row = await db.Setting.findOne({
    where: { key: KEY, distributorCode: distributorCode ?? null, storeCode: storeCode ?? null },
  });
  return parseRow(row);
}

async function readFromStoreCode(storeCode) {
  const norm = storeCode && String(storeCode).trim();
  if (!norm) return null;

  const row = await db.Setting.findOne({
    where: { key: KEY, storeCode: { [Op.iLike]: norm } },
    order: [['updated_at', 'DESC']],
  });
  return parseRow(row);
}

/**
 * Get social links for a scope. Store scope falls back to empty defaults (not global).
 */
async function getSocialLinksSettings(scope = null) {
  if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
    const storeSettings = await readFromSetting(scope.distributorCode, scope.storeCode);
    if (storeSettings) return { ...storeSettings };

    if (scope.storeCode) {
      const byStoreCode = await readFromStoreCode(scope.storeCode);
      if (byStoreCode) return { ...byStoreCode };
    }

    return { ...DEFAULTS };
  }

  const globalSettings = await readFromSetting(null, null);
  if (globalSettings) return { ...globalSettings };
  return { ...DEFAULTS };
}

async function updateSocialLinksSettings(payload, scope = null) {
  const settings = normalizePayload(payload);
  const distributorCode = scope && scope.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope && scope.storeCode != null ? scope.storeCode : null;

  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value: JSON.stringify(settings) },
  });
  await row.update({ value: JSON.stringify(settings) });
  return { ...settings };
}

async function deleteSocialLinksSettings(scope) {
  if (!scope || (scope.distributorCode == null && scope.storeCode == null)) {
    await db.Setting.destroy({ where: { key: KEY, distributorCode: null, storeCode: null } });
    return { ...DEFAULTS };
  }
  await db.Setting.destroy({
    where: {
      key: KEY,
      distributorCode: scope.distributorCode ?? null,
      storeCode: scope.storeCode ?? null,
    },
  });
  return { ...DEFAULTS };
}

async function resolveScopeFromStoreCode(storeCode) {
  const norm = storeCode && String(storeCode).trim();
  if (!norm) return null;

  const storeAdmin = await db.User.findOne({
    where: {
      role: ROLES.STORE_ADMIN,
      storeCode: { [Op.iLike]: norm },
      storeRoleId: null,
    },
    attributes: ['distributorCode', 'storeCode'],
    raw: true,
  });
  if (storeAdmin) {
    return {
      distributorCode: storeAdmin.distributorCode ?? null,
      storeCode: storeAdmin.storeCode ?? norm,
    };
  }
  return { distributorCode: null, storeCode: norm };
}

async function resolveScopeFromStoreUserId(userId) {
  const store = await db.User.findOne({
    where: { userId, role: ROLES.STORE_ADMIN, storeRoleId: null },
    attributes: ['userId', 'distributorCode', 'storeCode'],
  });
  if (!store) {
    const err = new Error('Store not found.');
    err.statusCode = 404;
    throw err;
  }
  return {
    store,
    scope: {
      distributorCode: store.distributorCode ?? null,
      storeCode: store.storeCode ?? null,
    },
  };
}

module.exports = {
  KEY,
  DEFAULTS,
  PLATFORM_KEYS,
  getSocialLinksSettings,
  updateSocialLinksSettings,
  deleteSocialLinksSettings,
  resolveScopeFromStoreCode,
  resolveScopeFromStoreUserId,
  normalizePayload,
};
