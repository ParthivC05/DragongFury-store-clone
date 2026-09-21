'use strict';

const crypto = require('crypto');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

const KEY = 'dashboard_promo_modals_settings';

const MODAL_TYPES = ['daily_bonus', 'spin_wheel', 'first_deposit', 'invite_friends', 'custom'];
const MAX_STEPS = 15;
const MIN_DELAY_SECONDS = 0;
const MAX_DELAY_SECONDS = 300;
const MAX_TITLE_LENGTH = 120;
const MAX_CTA_LABEL_LENGTH = 64;

const DEFAULT_STEPS = [
  { id: 'daily_bonus', type: 'daily_bonus', enabled: true, delaySeconds: 5 },
  { id: 'spin_wheel', type: 'spin_wheel', enabled: true, delaySeconds: 20 },
  { id: 'first_deposit', type: 'first_deposit', enabled: true, delaySeconds: 20 },
  { id: 'invite_friends', type: 'invite_friends', enabled: true, delaySeconds: 20 },
];

const DEFAULTS = {
  enabled: true,
  initialLoginDelaySeconds: 20,
  afterOnboardingDelaySeconds: 10,
  steps: DEFAULT_STEPS,
};

function normalizeDelaySeconds(raw, fallback = 0, label = 'Delay') {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    const err = new Error(`${label} must be a number of seconds.`);
    err.statusCode = 400;
    throw err;
  }
  if (n < MIN_DELAY_SECONDS || n > MAX_DELAY_SECONDS) {
    const err = new Error(
      `${label} must be between ${MIN_DELAY_SECONDS} and ${MAX_DELAY_SECONDS} seconds.`,
    );
    err.statusCode = 400;
    throw err;
  }
  return Math.round(n * 10) / 10;
}

function normalizeUrl(raw, label) {
  if (raw == null || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (s.startsWith('/')) return s.slice(0, 512);
  let u;
  try {
    u = new URL(s);
  } catch {
    const err = new Error(`${label} must be a valid URL or path (e.g. /deposit).`);
    err.statusCode = 400;
    throw err;
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    const err = new Error(`${label} must use http:// or https://, or start with /`);
    err.statusCode = 400;
    throw err;
  }
  return u.toString();
}

function normalizeImageUrl(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    const err = new Error('Custom modal image URL must be a valid URL (https://...).');
    err.statusCode = 400;
    throw err;
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    const err = new Error('Custom modal image URL must use http:// or https://');
    err.statusCode = 400;
    throw err;
  }
  return u.toString();
}

function normalizeStep(raw, index) {
  const type = String(raw?.type || '').trim().toLowerCase();
  if (!MODAL_TYPES.includes(type)) {
    const err = new Error(`Step ${index + 1}: invalid modal type "${raw?.type || ''}".`);
    err.statusCode = 400;
    throw err;
  }
  const id =
    raw?.id && String(raw.id).trim()
      ? String(raw.id).trim().slice(0, 64)
      : crypto.randomUUID();
  const enabled = raw?.enabled !== false;
  const delaySeconds = normalizeDelaySeconds(
    raw?.delaySeconds ?? raw?.delay_seconds,
    type === 'daily_bonus' ? 5 : 20,
    `Step ${index + 1} delay`,
  );

  const step = { id, type, enabled, delaySeconds };

  if (type === 'custom') {
    const title = typeof raw?.title === 'string' ? raw.title.trim().slice(0, MAX_TITLE_LENGTH) : '';
    const imageUrl = normalizeImageUrl(raw?.imageUrl ?? raw?.image_url);
    if (enabled && !imageUrl) {
      const err = new Error(`Step ${index + 1}: custom modal requires an image when enabled.`);
      err.statusCode = 400;
      throw err;
    }
    const ctaLabel =
      typeof raw?.ctaLabel === 'string' && raw.ctaLabel.trim()
        ? raw.ctaLabel.trim().slice(0, MAX_CTA_LABEL_LENGTH)
        : null;
    const ctaUrl = normalizeUrl(raw?.ctaUrl ?? raw?.cta_url, `Step ${index + 1} CTA URL`);
    step.title = title || 'Special offer';
    step.imageUrl = imageUrl;
    step.ctaLabel = ctaLabel;
    step.ctaUrl = ctaUrl;
  }

  return step;
}

function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return DEFAULT_STEPS.map((s) => ({ ...s }));
  if (steps.length > MAX_STEPS) {
    const err = new Error(`Maximum ${MAX_STEPS} modal steps allowed.`);
    err.statusCode = 400;
    throw err;
  }
  if (steps.length === 0) return [];
  return steps.map((step, index) => normalizeStep(step, index));
}

function normalizePayload(payload = {}) {
  return {
    enabled: payload.enabled !== false,
    initialLoginDelaySeconds: normalizeDelaySeconds(
      payload.initialLoginDelaySeconds ?? payload.initial_login_delay_seconds,
      DEFAULTS.initialLoginDelaySeconds,
      'Initial login delay',
    ),
    afterOnboardingDelaySeconds: normalizeDelaySeconds(
      payload.afterOnboardingDelaySeconds ?? payload.after_onboarding_delay_seconds,
      DEFAULTS.afterOnboardingDelaySeconds,
      'After onboarding delay',
    ),
    steps: normalizeSteps(payload.steps),
  };
}

function parseRow(row) {
  if (!row?.value) return null;
  try {
    return normalizePayload(JSON.parse(row.value));
  } catch (err) {
    if (err.statusCode) throw err;
    return null;
  }
}

async function readFromSetting(distributorCode, storeCode) {
  const row = await db.Setting.findOne({
    where: { key: KEY, distributorCode: distributorCode ?? null, storeCode: storeCode ?? null },
  });
  return parseRow(row);
}

async function getDashboardPromoModalsSettings(scope = null) {
  if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
    const storeSettings = await readFromSetting(scope.distributorCode, scope.storeCode);
    if (storeSettings) return { ...storeSettings };
    return { ...DEFAULTS, steps: DEFAULT_STEPS.map((s) => ({ ...s })) };
  }

  const globalSettings = await readFromSetting(null, null);
  if (globalSettings) return { ...globalSettings };
  return { ...DEFAULTS, steps: DEFAULT_STEPS.map((s) => ({ ...s })) };
}

async function updateDashboardPromoModalsSettings(payload, scope = null) {
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

async function deleteDashboardPromoModalsSettings(scope) {
  if (!scope || (scope.distributorCode == null && scope.storeCode == null)) {
    await db.Setting.destroy({ where: { key: KEY, distributorCode: null, storeCode: null } });
    return { ...DEFAULTS, steps: DEFAULT_STEPS.map((s) => ({ ...s })) };
  }
  await db.Setting.destroy({
    where: {
      key: KEY,
      distributorCode: scope.distributorCode ?? null,
      storeCode: scope.storeCode ?? null,
    },
  });
  return { ...DEFAULTS, steps: DEFAULT_STEPS.map((s) => ({ ...s })) };
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
  DEFAULT_STEPS,
  MODAL_TYPES,
  MAX_STEPS,
  MIN_DELAY_SECONDS,
  MAX_DELAY_SECONDS,
  getDashboardPromoModalsSettings,
  updateDashboardPromoModalsSettings,
  deleteDashboardPromoModalsSettings,
  resolveScopeFromStoreCode,
  resolveScopeFromStoreUserId,
  normalizePayload,
};
