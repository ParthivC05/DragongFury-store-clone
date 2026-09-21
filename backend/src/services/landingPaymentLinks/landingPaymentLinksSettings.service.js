const crypto = require('crypto');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

const KEY = 'landing_payment_links';
const MAX_LINKS_PER_TYPE = 20;
const MAX_URLS_PER_LINK = 20;
const MAX_LABEL_LENGTH = 100;
const MAX_REDIRECT_MODALS = 10;
const DEFAULT_REDIRECT_DELAY_SECONDS = 3.5;
const MIN_REDIRECT_DELAY_SECONDS = 1;
const MAX_REDIRECT_DELAY_SECONDS = 60;

const DEFAULTS = {
  deposit: [],
  withdrawal: [],
  redirectModals: [],
  modalImageUrl: null,
  redirectDelaySeconds: null,
};

function normalizeModalImageUrl(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    const err = new Error('Modal image URL must be a valid URL (https://...).');
    err.statusCode = 400;
    throw err;
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    const err = new Error('Modal image URL must use http:// or https://');
    err.statusCode = 400;
    throw err;
  }
  return u.toString();
}

function normalizeRedirectDelaySeconds(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    const err = new Error('Redirect delay must be a number of seconds.');
    err.statusCode = 400;
    throw err;
  }
  if (n < MIN_REDIRECT_DELAY_SECONDS || n > MAX_REDIRECT_DELAY_SECONDS) {
    const err = new Error(
      `Redirect delay must be between ${MIN_REDIRECT_DELAY_SECONDS} and ${MAX_REDIRECT_DELAY_SECONDS} seconds.`,
    );
    err.statusCode = 400;
    throw err;
  }
  // Keep one decimal place max (e.g. 3.5).
  return Math.round(n * 10) / 10;
}

function validateUrl(input, label) {
  if (input == null || !String(input).trim()) {
    const err = new Error(`${label} URL is required.`);
    err.statusCode = 400;
    throw err;
  }
  const s = String(input).trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    const err = new Error(`${label} must be a valid URL (https://...).`);
    err.statusCode = 400;
    throw err;
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    const err = new Error(`${label} must use http:// or https://`);
    err.statusCode = 400;
    throw err;
  }
  return u.toString();
}

function normalizeLinkItem(raw, index, typeLabel) {
  const label = raw?.label != null ? String(raw.label).trim() : '';
  if (!label) {
    const err = new Error(`${typeLabel} link ${index + 1}: label is required.`);
    err.statusCode = 400;
    throw err;
  }
  if (label.length > MAX_LABEL_LENGTH) {
    const err = new Error(`${typeLabel} link ${index + 1}: label must be ${MAX_LABEL_LENGTH} characters or less.`);
    err.statusCode = 400;
    throw err;
  }

  // Support both the new `urls` array and the legacy single `url` field.
  const rawUrls = Array.isArray(raw?.urls)
    ? raw.urls
    : (raw?.url != null ? [raw.url] : []);
  const candidates = rawUrls
    .map((u) => (u == null ? '' : String(u).trim()))
    .filter(Boolean);

  if (candidates.length === 0) {
    const err = new Error(`${typeLabel} link ${index + 1}: at least one URL is required.`);
    err.statusCode = 400;
    throw err;
  }
  if (candidates.length > MAX_URLS_PER_LINK) {
    const err = new Error(`${typeLabel} link ${index + 1}: maximum ${MAX_URLS_PER_LINK} URLs allowed.`);
    err.statusCode = 400;
    throw err;
  }

  const urls = candidates.map((u, i) =>
    validateUrl(u, `${typeLabel} link ${index + 1} URL ${i + 1}`),
  );
  const id = raw?.id && String(raw.id).trim()
    ? String(raw.id).trim()
    : crypto.randomUUID();
  return { id, label, urls };
}

function normalizeLinkList(items, typeKey) {
  if (!Array.isArray(items)) return [];
  if (items.length > MAX_LINKS_PER_TYPE) {
    const err = new Error(`Maximum ${MAX_LINKS_PER_TYPE} ${typeKey} links allowed.`);
    err.statusCode = 400;
    throw err;
  }
  const typeLabel = typeKey.charAt(0).toUpperCase() + typeKey.slice(1);
  return items.map((item, index) => normalizeLinkItem(item, index, typeLabel));
}

function normalizeRedirectModalItem(raw, index) {
  const imageUrl = normalizeModalImageUrl(
    raw?.imageUrl ?? raw?.image_url ?? raw?.modalImageUrl ?? raw?.modal_image_url,
  );
  const delayRaw = raw?.delaySeconds ?? raw?.delay_seconds ?? raw?.redirectDelaySeconds;
  if (!imageUrl && (delayRaw == null || delayRaw === '')) return null;
  if (!imageUrl) {
    const err = new Error(`Redirect modal ${index + 1}: image is required.`);
    err.statusCode = 400;
    throw err;
  }
  const delaySeconds = normalizeRedirectDelaySeconds(delayRaw);
  if (delaySeconds == null) {
    const err = new Error(
      `Redirect modal ${index + 1}: delay is required (${MIN_REDIRECT_DELAY_SECONDS}–${MAX_REDIRECT_DELAY_SECONDS} seconds).`,
    );
    err.statusCode = 400;
    throw err;
  }
  return { imageUrl, delaySeconds };
}

function normalizeRedirectModals(payload = {}) {
  const rawList = payload.redirectModals ?? payload.redirect_modals;
  if (Array.isArray(rawList)) {
    if (rawList.length > MAX_REDIRECT_MODALS) {
      const err = new Error(`Maximum ${MAX_REDIRECT_MODALS} redirect modals allowed.`);
      err.statusCode = 400;
      throw err;
    }
    return rawList
      .map((item, index) => normalizeRedirectModalItem(item, index))
      .filter(Boolean);
  }

  const imageUrl = normalizeModalImageUrl(payload.modalImageUrl ?? payload.modal_image_url);
  const delaySeconds = normalizeRedirectDelaySeconds(
    payload.redirectDelaySeconds ?? payload.redirect_delay_seconds,
  );
  if (imageUrl && delaySeconds != null) {
    return [{ imageUrl, delaySeconds }];
  }
  return [];
}

function withLegacyModalFields(settings) {
  const redirectModals = Array.isArray(settings.redirectModals) ? settings.redirectModals : [];
  const first = redirectModals[0] || null;
  return {
    ...settings,
    redirectModals,
    modalImageUrl: first?.imageUrl ?? null,
    redirectDelaySeconds: first?.delaySeconds ?? null,
  };
}

function parseRow(row) {
  if (!row?.value) return null;
  try {
    const parsed = JSON.parse(row.value);
    return normalizePayload(parsed);
  } catch (err) {
    if (err.statusCode) throw err;
    return null;
  }
}

function normalizePayload(payload = {}) {
  return withLegacyModalFields({
    deposit: normalizeLinkList(payload.deposit, 'deposit'),
    withdrawal: normalizeLinkList(payload.withdrawal, 'withdrawal'),
    redirectModals: normalizeRedirectModals(payload),
  });
}

async function readFromSetting(distributorCode, storeCode) {
  const row = await db.Setting.findOne({
    where: { key: KEY, distributorCode: distributorCode ?? null, storeCode: storeCode ?? null },
  });
  return parseRow(row);
}

/**
 * Get landing deposit/withdrawal links for a scope. Store scope falls back to empty defaults.
 */
async function getLandingPaymentLinksSettings(scope = null) {
  if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
    const storeSettings = await readFromSetting(scope.distributorCode, scope.storeCode);
    if (storeSettings) return { ...storeSettings };
    return { ...DEFAULTS };
  }

  const globalSettings = await readFromSetting(null, null);
  if (globalSettings) return { ...globalSettings };
  return { ...DEFAULTS };
}

async function updateLandingPaymentLinksSettings(payload, scope = null) {
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

async function deleteLandingPaymentLinksSettings(scope) {
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
    where: { role: ROLES.STORE_ADMIN, storeCode: norm, storeRoleId: null },
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
  DEFAULT_REDIRECT_DELAY_SECONDS,
  MIN_REDIRECT_DELAY_SECONDS,
  MAX_REDIRECT_DELAY_SECONDS,
  MAX_REDIRECT_MODALS,
  MAX_LINKS_PER_TYPE,
  MAX_URLS_PER_LINK,
  getLandingPaymentLinksSettings,
  updateLandingPaymentLinksSettings,
  deleteLandingPaymentLinksSettings,
  resolveScopeFromStoreCode,
  resolveScopeFromStoreUserId,
  normalizePayload,
};
