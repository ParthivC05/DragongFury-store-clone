'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { createLogger } = require('../../libs/logger');
const { normalizeStoreCode } = require('../auth/storeBinding.helpers');

const log = createLogger('dashboardSlideshowSettings');

const KEY = 'dashboard_slideshow_settings';
const MAX_SLIDES = 12;
const MAX_ALT_LENGTH = 160;
const MAX_LINK_LENGTH = 2048;

const DEFAULTS = {
  slides: [],
  casinoSlides: []
};

function normalizeImageUrl(raw, fieldName = 'src') {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    const err = new Error(`${fieldName} must be a string URL.`);
    err.statusCode = 400;
    throw err;
  }
  const url = raw.trim();
  if (!url) return null;
  if (url.length > 2048) {
    const err = new Error(`${fieldName} is too long.`);
    err.statusCode = 400;
    throw err;
  }
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
    const err = new Error(`${fieldName} must be an http(s) URL or site path.`);
    err.statusCode = 400;
    throw err;
  }
  return url;
}

function normalizeAlt(raw) {
  if (raw == null) return '';
  const alt = String(raw).trim();
  if (alt.length > MAX_ALT_LENGTH) {
    const err = new Error(`alt must be at most ${MAX_ALT_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }
  return alt;
}

/** Optional site path (/deposit) or absolute http(s) URL. Empty means the slide is not clickable. */
function normalizeSlideLink(raw) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return '';
  if (typeof raw !== 'string') {
    const err = new Error('link must be a string URL or site path.');
    err.statusCode = 400;
    throw err;
  }
  let s = raw.trim();
  if (!s) return '';
  if (s.length > MAX_LINK_LENGTH) {
    const err = new Error(`link is too long (max ${MAX_LINK_LENGTH} characters).`);
    err.statusCode = 400;
    throw err;
  }
  if (/^https?:\/\//i.test(s)) {
    let url;
    try {
      url = new URL(s);
    } catch {
      const err = new Error('link must be a valid http(s) URL or site path like /deposit.');
      err.statusCode = 400;
      throw err;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      const err = new Error('link must use http:// or https://, or a site path like /deposit.');
      err.statusCode = 400;
      throw err;
    }
    if (!url.hostname) {
      const err = new Error('link must be a valid http(s) URL or site path like /deposit.');
      err.statusCode = 400;
      throw err;
    }
    return url.href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    const err = new Error('Use a site path like /deposit, or a full http(s) URL.');
    err.statusCode = 400;
    throw err;
  }
  if (!s.startsWith('/')) s = `/${s}`;
  if (!/^\/[a-zA-Z0-9/_\-.~%?=&#+]*$/.test(s)) {
    const err = new Error(
      'link may only use letters, numbers, /, _, -, ?, &, =, # (or a full http(s) URL).'
    );
    err.statusCode = 400;
    throw err;
  }
  return s;
}

function parseStoredSlideLink(raw) {
  try {
    return normalizeSlideLink(raw) || '';
  } catch {
    return '';
  }
}

function normalizeSlide(raw, index) {
  if (!raw || typeof raw !== 'object') {
    const err = new Error(`Slide ${index + 1} is invalid.`);
    err.statusCode = 400;
    throw err;
  }
  const src = normalizeImageUrl(raw.src ?? raw.imageUrl ?? raw.image_url, 'src');
  if (!src) {
    const err = new Error(`Slide ${index + 1}: desktop image (src) is required.`);
    err.statusCode = 400;
    throw err;
  }
  const mobileRaw = raw.mobileSrc ?? raw.mobile_src ?? raw.mobileImageUrl ?? raw.mobile_image_url;
  const mobileSrc = normalizeImageUrl(mobileRaw, 'mobileSrc');
  if (!mobileSrc) {
    const err = new Error(`Slide ${index + 1}: phone image (mobileSrc) is required.`);
    err.statusCode = 400;
    throw err;
  }
  const alt = normalizeAlt(raw.alt);
  const link = normalizeSlideLink(raw.link ?? raw.href ?? raw.url);
  const order =
    Number.isFinite(Number(raw.order)) && Number(raw.order) >= 0
      ? Math.floor(Number(raw.order))
      : index;
  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim().slice(0, 64)
      : `slide-${index + 1}`;

  return {
    id,
    src,
    mobileSrc,
    alt: alt || `Slide ${index + 1}`,
    link: link || '',
    order
  };
}

function normalizeSlides(rawSlides) {
  if (rawSlides === undefined) return undefined;
  if (rawSlides === null) return [];
  if (!Array.isArray(rawSlides)) {
    const err = new Error('slides must be an array.');
    err.statusCode = 400;
    throw err;
  }
  if (rawSlides.length > MAX_SLIDES) {
    const err = new Error(`You can add at most ${MAX_SLIDES} slides.`);
    err.statusCode = 400;
    throw err;
  }
  const slides = rawSlides.map((slide, index) => normalizeSlide(slide, index));
  slides.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return slides.map((slide, index) => ({ ...slide, order: index }));
}

function parseSlideList(rawSlides) {
  const slides = [];
  const list = Array.isArray(rawSlides) ? rawSlides : [];
  for (let i = 0; i < list.length && i < MAX_SLIDES; i += 1) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const src =
      typeof item.src === 'string' && item.src.trim()
        ? item.src.trim()
        : typeof item.imageUrl === 'string' && item.imageUrl.trim()
          ? item.imageUrl.trim()
          : null;
    if (!src) continue;
    const mobileSrc =
      typeof item.mobileSrc === 'string' && item.mobileSrc.trim()
        ? item.mobileSrc.trim()
        : typeof item.mobile_src === 'string' && item.mobile_src.trim()
          ? item.mobile_src.trim()
          : null;
    const alt =
      typeof item.alt === 'string' && item.alt.trim()
        ? item.alt.trim().slice(0, MAX_ALT_LENGTH)
        : `Slide ${slides.length + 1}`;
    const link = parseStoredSlideLink(item.link ?? item.href ?? item.url);
    slides.push({
      id:
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim().slice(0, 64)
          : `slide-${slides.length + 1}`,
      src,
      mobileSrc,
      alt,
      ...(link ? { link } : {}),
      order: slides.length
    });
  }
  return slides;
}

function parseSettingsValue(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      slides: parseSlideList(parsed.slides),
      casinoSlides: parseSlideList(parsed.casinoSlides ?? parsed.casino_slides),
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    };
  } catch (_) {
    return null;
  }
}

function effectiveFromParsed(parsed) {
  if (!parsed) {
    return {
      slides: [],
      casinoSlides: [],
      hasOverride: false,
      updatedBy: null,
      updatedAt: null
    };
  }
  return {
    slides: Array.isArray(parsed.slides) ? parsed.slides : [],
    casinoSlides: Array.isArray(parsed.casinoSlides) ? parsed.casinoSlides : [],
    hasOverride: true,
    updatedBy: parsed.updatedBy || null,
    updatedAt: parsed.updatedAt || null
  };
}

function toPublicSlides(slides) {
  return (Array.isArray(slides) ? slides : []).map((slide) => ({
    src: slide.src,
    ...(slide.mobileSrc ? { mobileSrc: slide.mobileSrc } : {}),
    alt: slide.alt || '',
    ...(slide.link ? { link: slide.link } : {})
  }));
}

function storeSettingsPayload(effective) {
  const slides = effective.slides || [];
  const casinoSlides = effective.casinoSlides || [];
  return {
    slides,
    casinoSlides,
    slideCount: slides.length,
    casinoSlideCount: casinoSlides.length,
    hasOverride: effective.hasOverride,
    updatedBy: effective.updatedBy,
    updatedAt: effective.updatedAt
  };
}

async function resolveStoreScope({ distributorCode, storeCode } = {}) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  const where = {
    role: ROLES.STORE_ADMIN,
    storeRoleId: null,
    storeCode: code
  };
  if (distributorCode != null && String(distributorCode).trim()) {
    where.distributorCode = String(distributorCode).trim();
  }
  const stores = await db.User.findAll({
    where,
    attributes: ['userId', 'distributorCode', 'storeCode', 'username', 'email', 'isActive'],
    raw: true,
    limit: 5
  });
  if (!stores.length) {
    const err = new Error('Store not found. Use a valid store code.');
    err.statusCode = 404;
    throw err;
  }
  if (stores.length > 1 && !(distributorCode != null && String(distributorCode).trim())) {
    const err = new Error('Multiple stores match this storeCode. Provide distributorCode as well.');
    err.statusCode = 400;
    throw err;
  }
  const store = stores[0];
  return {
    distributorCode: store.distributorCode ?? null,
    storeCode: store.storeCode,
    userId: store.userId,
    username: store.username,
    email: store.email,
    isActive: store.isActive !== false
  };
}

async function getSettingRow(distributorCode, storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) return null;

  if (distributorCode != null && String(distributorCode).trim()) {
    const exact = await db.Setting.findOne({
      where: {
        key: KEY,
        distributorCode: String(distributorCode).trim(),
        storeCode: code
      }
    });
    if (exact) return exact;
  }

  return db.Setting.findOne({
    where: { key: KEY, storeCode: code }
  });
}

async function getEffectiveSettings(distributorCode, storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    return { ...effectiveFromParsed(null), distributorCode: distributorCode ?? null, storeCode: null };
  }
  const row = await getSettingRow(distributorCode, storeCode);
  const parsed = parseSettingsValue(row?.value);
  return {
    ...effectiveFromParsed(parsed),
    distributorCode: row?.distributorCode ?? distributorCode ?? null,
    storeCode: code
  };
}

async function getEffectiveSettingsForStoreCode(storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    return { ...effectiveFromParsed(null), distributorCode: null, storeCode: null };
  }

  let distributorCode = null;
  try {
    const scope = await resolveStoreScope({ storeCode: code });
    distributorCode = scope.distributorCode;
  } catch (_) {
    // Store admin row may be missing; still try settings by store_code alone.
  }

  return getEffectiveSettings(distributorCode, code);
}

async function listAllStoreSettings() {
  const [stores, settingRows] = await Promise.all([
    db.User.findAll({
      where: {
        role: ROLES.STORE_ADMIN,
        storeRoleId: null,
        storeCode: { [Op.ne]: null }
      },
      attributes: ['userId', 'username', 'email', 'distributorCode', 'storeCode', 'isActive'],
      order: [
        ['distributorCode', 'ASC'],
        ['storeCode', 'ASC']
      ],
      raw: true
    }),
    db.Setting.findAll({
      where: {
        key: KEY,
        storeCode: { [Op.ne]: null }
      },
      attributes: ['distributorCode', 'storeCode', 'value'],
      raw: true
    })
  ]);

  const settingsMap = new Map();
  for (const row of settingRows || []) {
    const mapKey = `${row.distributorCode || ''}|${normalizeStoreCode(row.storeCode)}`;
    settingsMap.set(mapKey, parseSettingsValue(row.value));
  }

  const seen = new Set();
  const uniqueStores = [];
  for (const s of stores || []) {
    const code = normalizeStoreCode(s.storeCode);
    const mapKey = `${s.distributorCode || ''}|${code}`;
    if (!code || seen.has(mapKey)) continue;
    seen.add(mapKey);
    uniqueStores.push(s);
  }

  return {
    stores: uniqueStores.map((s) => {
      const code = normalizeStoreCode(s.storeCode);
      const mapKey = `${s.distributorCode || ''}|${code}`;
      const parsed = settingsMap.get(mapKey) || null;
      const effective = effectiveFromParsed(parsed);
      return {
        userId: s.userId,
        username: s.username,
        email: s.email,
        distributorCode: s.distributorCode,
        storeCode: s.storeCode,
        isActive: s.isActive !== false,
        ...storeSettingsPayload(effective)
      };
    })
  };
}

async function listOwnStoreSettings(scope) {
  if (!scope?.storeCode) {
    const err = new Error('Store scope is required.');
    err.statusCode = 400;
    throw err;
  }
  const store = await resolveStoreScope(scope);
  const effective = await getEffectiveSettings(store.distributorCode, store.storeCode);
  return {
    stores: [
      {
        userId: store.userId,
        username: store.username,
        email: store.email,
        distributorCode: store.distributorCode,
        storeCode: store.storeCode,
        isActive: store.isActive,
        ...storeSettingsPayload(effective)
      }
    ]
  };
}

/**
 * Public slideshow payload. `casinoSlides` is empty when the store has not set casino banners;
 * storefronts should fall back to `slides` in that case.
 */
async function getPublicSettingsForStoreCode(storeCode) {
  const effective = await getEffectiveSettingsForStoreCode(storeCode);
  return {
    slides: toPublicSlides(effective.slides),
    casinoSlides: toPublicSlides(effective.casinoSlides)
  };
}

function payloadHasSlides(payload = {}) {
  return payload.slides !== undefined;
}

function payloadHasCasinoSlides(payload = {}) {
  return payload.casinoSlides !== undefined || payload.casino_slides !== undefined;
}

async function upsertStoreSettings(scope, payload, { updatedBy } = {}) {
  const store = await resolveStoreScope(scope);
  const previous = await getEffectiveSettings(store.distributorCode, store.storeCode);

  if (!payloadHasSlides(payload) && !payloadHasCasinoSlides(payload)) {
    const err = new Error('slides or casinoSlides is required.');
    err.statusCode = 400;
    throw err;
  }

  const slides = payloadHasSlides(payload)
    ? normalizeSlides(payload.slides)
    : previous.slides || [];
  const casinoSlides = payloadHasCasinoSlides(payload)
    ? normalizeSlides(payload.casinoSlides ?? payload.casino_slides)
    : previous.casinoSlides || [];

  const updatedAt = new Date().toISOString();
  const valueObj = {
    slides,
    casinoSlides,
    updatedBy: updatedBy || null,
    updatedAt
  };

  const [row] = await db.Setting.findOrCreate({
    where: {
      key: KEY,
      distributorCode: store.distributorCode,
      storeCode: store.storeCode
    },
    defaults: {
      key: KEY,
      distributorCode: store.distributorCode,
      storeCode: store.storeCode,
      value: JSON.stringify(valueObj)
    }
  });
  await row.update({ value: JSON.stringify(valueObj) });

  log.info('Dashboard slideshow settings updated', {
    storeCode: store.storeCode,
    distributorCode: store.distributorCode,
    updatedBy: updatedBy || null,
    previousCount: previous.slides?.length || 0,
    nextCount: slides.length,
    previousCasinoCount: previous.casinoSlides?.length || 0,
    nextCasinoCount: casinoSlides.length
  });

  return {
    distributorCode: store.distributorCode,
    storeCode: store.storeCode,
    slides,
    casinoSlides,
    slideCount: slides.length,
    casinoSlideCount: casinoSlides.length,
    hasOverride: true,
    updatedBy: updatedBy || null,
    updatedAt
  };
}

module.exports = {
  KEY,
  DEFAULTS,
  MAX_SLIDES,
  normalizeSlides,
  getEffectiveSettings,
  getEffectiveSettingsForStoreCode,
  getPublicSettingsForStoreCode,
  listAllStoreSettings,
  listOwnStoreSettings,
  upsertStoreSettings,
  resolveStoreScope
};
