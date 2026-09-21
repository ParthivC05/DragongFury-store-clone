'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { createLogger } = require('../../libs/logger');
const { normalizeStoreCode } = require('../auth/storeBinding.helpers');
const { CAMPAIGN_DAYS, REWARD_TYPES, roundMoney } = require('./dailyBonus.constants');

const log = createLogger('dailyBonusSettings');

const KEY = 'daily_bonus_settings';
const MAX_AMOUNT_SC = 10000;
const MAX_SPIN_COUNT = 20;
const MAX_PERCENT_OFF = 100;

const DEFAULT_SPIN_SEGMENTS = [
  { id: 'db1', type: 'sc_coins', value: 1, label: '1 SC', color: '#1a9b6c', probability: 30 },
  { id: 'db2', type: 'sc_coins', value: 2, label: '2 SC', color: '#0d7a52', probability: 25 },
  { id: 'db3', type: 'sc_coins', value: 5, label: '5 SC', color: '#f0b429', probability: 15 },
  { id: 'db4', type: 'no_win', value: 0, label: 'Try Again', color: '#64748b', probability: 30 }
];

function defaultDay(dayIndex) {
  return {
    dayIndex,
    rewardType: 'sc_coins',
    amountSc: 5,
    spinCount: 1,
    percentOff: 10,
    packageScope: 'all',
    packageIds: [],
    label: `Day ${dayIndex}`
  };
}

const DEFAULTS = {
  enabled: false,
  repeatAfterComplete: false,
  days: Array.from({ length: CAMPAIGN_DAYS }, (_, i) => defaultDay(i + 1)),
  spinSegments: DEFAULT_SPIN_SEGMENTS
};

function normalizeEnabled(raw) {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  const err = new Error('enabled must be a boolean.');
  err.statusCode = 400;
  throw err;
}

function normalizeRepeatAfterComplete(raw, fallback = false) {
  if (raw === undefined || raw === null || raw === '') return fallback === true;
  try {
    return normalizeEnabled(raw);
  } catch (_) {
    const err = new Error('repeatAfterComplete must be a boolean.');
    err.statusCode = 400;
    throw err;
  }
}

function normalizeAmountSc(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT_SC) {
    const err = new Error(`amountSc must be between 0 and ${MAX_AMOUNT_SC}.`);
    err.statusCode = 400;
    throw err;
  }
  return roundMoney(n);
}

function normalizeSpinCount(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SPIN_COUNT) {
    const err = new Error(`spinCount must be an integer between 1 and ${MAX_SPIN_COUNT}.`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function normalizePercentOff(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PERCENT_OFF) {
    const err = new Error(`percentOff must be greater than 0 and at most ${MAX_PERCENT_OFF}.`);
    err.statusCode = 400;
    throw err;
  }
  return roundMoney(n);
}

function normalizePackageIds(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    const err = new Error('packageIds must be an array of package ids.');
    err.statusCode = 400;
    throw err;
  }
  const ids = [];
  for (const item of raw) {
    const id = parseInt(item, 10);
    if (!Number.isInteger(id) || id < 1) {
      const err = new Error('Each packageId must be a positive integer.');
      err.statusCode = 400;
      throw err;
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function normalizeDay(raw, index) {
  const dayIndex = Number(raw?.dayIndex ?? raw?.day_index ?? index + 1);
  if (!Number.isInteger(dayIndex) || dayIndex < 1 || dayIndex > CAMPAIGN_DAYS) {
    const err = new Error(`dayIndex must be 1–${CAMPAIGN_DAYS}.`);
    err.statusCode = 400;
    throw err;
  }
  const rewardType = String(raw?.rewardType ?? raw?.reward_type ?? 'sc_coins').trim();
  if (!REWARD_TYPES.includes(rewardType)) {
    const err = new Error(`Invalid rewardType for day ${dayIndex}.`);
    err.statusCode = 400;
    throw err;
  }

  const label =
    typeof raw?.label === 'string' && raw.label.trim()
      ? raw.label.trim().slice(0, 64)
      : `Day ${dayIndex}`;

  const day = {
    dayIndex,
    rewardType,
    amountSc: 0,
    spinCount: 1,
    percentOff: 10,
    packageScope: 'all',
    packageIds: [],
    label
  };

  if (rewardType === 'sc_coins') {
    day.amountSc = normalizeAmountSc(raw?.amountSc ?? raw?.amount_sc ?? 0);
    if (!(day.amountSc > 0)) {
      const err = new Error(`Day ${dayIndex}: amountSc must be greater than 0.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (rewardType === 'bonus_spin') {
    day.spinCount = normalizeSpinCount(raw?.spinCount ?? raw?.spin_count ?? 1);
  } else if (rewardType === 'discount_voucher') {
    day.percentOff = normalizePercentOff(raw?.percentOff ?? raw?.percent_off);
    const scope = String(raw?.packageScope ?? raw?.package_scope ?? 'all').trim().toLowerCase();
    if (scope !== 'all' && scope !== 'selected') {
      const err = new Error(`Day ${dayIndex}: packageScope must be "all" or "selected".`);
      err.statusCode = 400;
      throw err;
    }
    day.packageScope = scope;
    day.packageIds = normalizePackageIds(raw?.packageIds ?? raw?.package_ids);
    if (scope === 'selected' && day.packageIds.length === 0) {
      const err = new Error(`Day ${dayIndex}: select at least one package, or use packageScope "all".`);
      err.statusCode = 400;
      throw err;
    }
  }

  return day;
}

function normalizeSpinSegment(raw, index) {
  const id = String(raw?.id ?? `seg${index + 1}`).trim().slice(0, 32) || `seg${index + 1}`;
  const type = String(raw?.type ?? 'sc_coins').trim();
  if (!['sc_coins', 'no_win'].includes(type)) {
    const err = new Error('Bonus spin segments may only be sc_coins or no_win.');
    err.statusCode = 400;
    throw err;
  }
  const value = type === 'no_win' ? 0 : normalizeAmountSc(raw?.value ?? 0);
  if (type === 'sc_coins' && !(value > 0)) {
    const err = new Error('Bonus spin SC segments need value > 0.');
    err.statusCode = 400;
    throw err;
  }
  const probability = Math.max(0, Math.min(100, Number(raw?.probability) || 0));
  const label =
    typeof raw?.label === 'string' && raw.label.trim()
      ? raw.label.trim().slice(0, 32)
      : type === 'no_win'
        ? 'Try Again'
        : `${value} SC`;
  const color =
    typeof raw?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.color.trim())
      ? raw.color.trim()
      : type === 'no_win'
        ? '#64748b'
        : '#1a9b6c';
  return { id, type, value, label, color, probability };
}

function normalizeSpinSegments(raw) {
  if (!Array.isArray(raw) || raw.length < 2) {
    const err = new Error('spinSegments must include at least 2 segments.');
    err.statusCode = 400;
    throw err;
  }
  if (raw.length > 12) {
    const err = new Error('spinSegments cannot exceed 12 segments.');
    err.statusCode = 400;
    throw err;
  }
  const segments = raw.map((s, i) => normalizeSpinSegment(s, i));
  const totalProb = segments.reduce((sum, s) => sum + s.probability, 0);
  if (!(totalProb > 0)) {
    const err = new Error('At least one spin segment needs probability > 0.');
    err.statusCode = 400;
    throw err;
  }
  return segments;
}

function normalizeDays(raw) {
  if (!Array.isArray(raw) || raw.length !== CAMPAIGN_DAYS) {
    const err = new Error(`days must be an array of exactly ${CAMPAIGN_DAYS} day configs.`);
    err.statusCode = 400;
    throw err;
  }
  const days = raw.map((d, i) => normalizeDay(d, i));
  const indexes = days.map((d) => d.dayIndex).sort((a, b) => a - b);
  for (let i = 0; i < CAMPAIGN_DAYS; i++) {
    if (indexes[i] !== i + 1) {
      const err = new Error('days must include dayIndex 1 through 7 exactly once.');
      err.statusCode = 400;
      throw err;
    }
  }
  return days.sort((a, b) => a.dayIndex - b.dayIndex);
}

function parseDay(raw, fallbackIndex) {
  try {
    return normalizeDay(raw || defaultDay(fallbackIndex), fallbackIndex - 1);
  } catch (_) {
    return defaultDay(fallbackIndex);
  }
}

function parseSpinSegments(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return DEFAULT_SPIN_SEGMENTS.map((s) => ({ ...s }));
  try {
    return normalizeSpinSegments(raw);
  } catch (_) {
    return DEFAULT_SPIN_SEGMENTS.map((s) => ({ ...s }));
  }
}

function parseSettingsValue(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return null;
    const daysIn = Array.isArray(parsed.days) ? parsed.days : [];
    const days = [];
    for (let i = 1; i <= CAMPAIGN_DAYS; i++) {
      const found = daysIn.find((d) => Number(d?.dayIndex ?? d?.day_index) === i);
      days.push(parseDay(found, i));
    }
    return {
      enabled: parsed.enabled === true,
      repeatAfterComplete:
        parsed.repeatAfterComplete === true || parsed.repeat_after_complete === true,
      days,
      spinSegments: parseSpinSegments(parsed.spinSegments ?? parsed.spin_segments),
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
      enabled: DEFAULTS.enabled,
      repeatAfterComplete: DEFAULTS.repeatAfterComplete,
      days: DEFAULTS.days.map((d) => ({ ...d, packageIds: [...(d.packageIds || [])] })),
      spinSegments: DEFAULTS.spinSegments.map((s) => ({ ...s })),
      hasOverride: false,
      updatedBy: null,
      updatedAt: null
    };
  }
  return {
    enabled: parsed.enabled === true,
    repeatAfterComplete: parsed.repeatAfterComplete === true,
    days: parsed.days,
    spinSegments: parsed.spinSegments,
    hasOverride: true,
    updatedBy: parsed.updatedBy || null,
    updatedAt: parsed.updatedAt || null
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
    // continue with store code only
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
      where: { key: KEY, storeCode: { [Op.ne]: null } },
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
        enabled: effective.enabled,
        repeatAfterComplete: effective.repeatAfterComplete === true,
        days: effective.days,
        spinSegments: effective.spinSegments,
        hasOverride: effective.hasOverride,
        updatedBy: effective.updatedBy,
        updatedAt: effective.updatedAt
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
        enabled: effective.enabled,
        repeatAfterComplete: effective.repeatAfterComplete === true,
        days: effective.days,
        spinSegments: effective.spinSegments,
        hasOverride: effective.hasOverride,
        updatedBy: effective.updatedBy,
        updatedAt: effective.updatedAt
      }
    ]
  };
}

async function listPackagesForStore(scope) {
  const store = await resolveStoreScope(scope);
  const packages = await db.DepositPackage.findAll({
    where: {
      distributorCode: store.distributorCode,
      storeCode: store.storeCode
    },
    include: [{ model: db.DepositPackageGroup, as: 'Group', required: false }],
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'ASC']
    ]
  });
  return {
    packages: (packages || []).map((pkg) => {
      const plain = pkg.get ? pkg.get({ plain: true }) : pkg;
      return {
        id: plain.id,
        title: plain.title || plain.Group?.title || `Package #${plain.id}`,
        finalPrice: Number(plain.finalPrice),
        finalSc: Number(plain.finalSc),
        isActive: plain.isActive !== false,
        groupKey: plain.Group?.groupKey || null,
        groupTitle: plain.Group?.title || null
      };
    })
  };
}

async function upsertStoreSettings(scope, payload, { updatedBy } = {}) {
  const store = await resolveStoreScope(scope);
  const previous = await getEffectiveSettings(store.distributorCode, store.storeCode);
  const enabled = normalizeEnabled(payload.enabled);
  const repeatAfterComplete = normalizeRepeatAfterComplete(
    payload.repeatAfterComplete ?? payload.repeat_after_complete,
    previous.repeatAfterComplete === true
  );
  const days = normalizeDays(payload.days);
  // Separate bonus-wheel segments are no longer used; keep optional for backward-compatible settings rows.
  let spinSegments = DEFAULT_SPIN_SEGMENTS.map((s) => ({ ...s }));
  const rawSegments = payload.spinSegments ?? payload.spin_segments;
  if (rawSegments !== undefined) {
    try {
      spinSegments = normalizeSpinSegments(rawSegments);
    } catch (_) {
      spinSegments = DEFAULT_SPIN_SEGMENTS.map((s) => ({ ...s }));
    }
  } else if (Array.isArray(previous.spinSegments) && previous.spinSegments.length >= 2) {
    spinSegments = previous.spinSegments;
  }

  // Validate selected package ids belong to this store
  for (const day of days) {
    if (day.rewardType !== 'discount_voucher' || day.packageScope !== 'selected') continue;
    const count = await db.DepositPackage.count({
      where: {
        id: { [Op.in]: day.packageIds },
        distributorCode: store.distributorCode,
        storeCode: store.storeCode
      }
    });
    if (count !== day.packageIds.length) {
      const err = new Error(`Day ${day.dayIndex}: one or more packageIds are invalid for this store.`);
      err.statusCode = 400;
      throw err;
    }
  }

  const updatedAt = new Date().toISOString();
  const valueObj = {
    enabled,
    repeatAfterComplete,
    days,
    spinSegments,
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

  log.info('Daily bonus settings updated', {
    storeCode: store.storeCode,
    distributorCode: store.distributorCode,
    updatedBy: updatedBy || null,
    enabled,
    repeatAfterComplete
  });

  return {
    distributorCode: store.distributorCode,
    storeCode: store.storeCode,
    enabled,
    repeatAfterComplete,
    days,
    spinSegments,
    hasOverride: true,
    updatedBy: updatedBy || null,
    updatedAt
  };
}

module.exports = {
  KEY,
  DEFAULTS,
  DEFAULT_SPIN_SEGMENTS,
  MAX_AMOUNT_SC,
  getEffectiveSettings,
  getEffectiveSettingsForStoreCode,
  listAllStoreSettings,
  listOwnStoreSettings,
  listPackagesForStore,
  upsertStoreSettings,
  resolveStoreScope,
  parseSettingsValue
};
