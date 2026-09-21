const { Op } = require('sequelize');
const db = require('../../db/models');

const KEY = 'spin_wheel_settings';

/** Fixed total for probability distribution (percent). All segment probabilities must sum to this. */
const PROBABILITY_TOTAL = 100;

/** Validation limits for store admin (and global). */
const MIN_SEGMENTS = 6;
const MAX_SEGMENTS = 12;
const FREE_SPIN_VALUE_MIN = 1;
const FREE_SPIN_VALUE_MAX = 10;
const SC_COINS_VALUE_MIN = 1;
const SC_COINS_VALUE_MAX = 100;
const COUPON_PERCENT_MIN = 1;
const COUPON_PERCENT_MAX = 90;
const WHEN_FREE_SPINS_AT_LEAST_MAX = 10;
const SEGMENT_TYPES = ['sc_coins', 'free_spin', 'no_win', 'coupon'];

/** Default segments (no id – stored and identified by array index). Probability 0–100 per segment.
 * Tuned so users mostly get No Win (~77%), small SC (1/2) occasionally, larger SC rarely,
 * and free-spin segments near zero to prevent chaining many spins in one day. */
const DEFAULT_SEGMENTS = [
  { type: 'sc_coins', value: 2, label: '2 SC', color: '#9b59b6', probability: 5 },
  { type: 'sc_coins', value: 3, label: '3 SC', color: '#3498db', probability: 1 },
  { type: 'free_spin', value: 1, label: '1 Free Spin', color: '#e91e63', probability: 1 },
  { type: 'sc_coins', value: 1, label: '1 SC', color: '#1a5276', probability: 15 },
  { type: 'no_win', value: 0, label: 'No Win', color: '#e74c3c', probability: 40 },
  { type: 'free_spin', value: 10, label: '10 Free Spins', color: '#f39c12', probability: 0 },
  { type: 'sc_coins', value: 10, label: '10 SC', color: '#27ae60', probability: 1 },
  { type: 'no_win', value: 0, label: 'No Win', color: '#8e44ad', probability: 37 }
];

const DEFAULTS = {
  segments: DEFAULT_SEGMENTS,
  probabilityOverrides: [
    { whenFreeSpinsAtLeast: 10, segmentProbabilities: { '0': 5, '1': 0, '2': 0, '3': 10, '4': 45, '5': 0, '6': 0, '7': 40 } }
  ]
};

function parsePercentFromLabel(label) {
  if (!label || typeof label !== 'string') return null;
  const m = label.trim().match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function formatCouponPercent(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;
  const rounded = Math.round(n * 10) / 10;
  return Math.min(COUPON_PERCENT_MAX, Math.max(COUPON_PERCENT_MIN, rounded));
}

function defaultLabelForType(type, value) {
  if (type === 'sc_coins') return `${value} SC`;
  if (type === 'free_spin') return `${value} Free Spin${value !== 1 ? 's' : ''}`;
  if (type === 'coupon') return `${value}% Off`;
  return 'No Win';
}

function normalizeSegment(seg) {
  const type = SEGMENT_TYPES.includes(seg?.type) ? seg.type : 'no_win';
  let value;
  if (type === 'no_win') {
    value = 0;
  } else if (type === 'free_spin') {
    value = Math.min(FREE_SPIN_VALUE_MAX, Math.max(FREE_SPIN_VALUE_MIN, parseInt(seg?.value, 10) || 1));
  } else if (type === 'coupon') {
    const fromLabel = parsePercentFromLabel(seg?.label);
    value = formatCouponPercent(fromLabel != null ? fromLabel : seg?.value);
  } else {
    value = Math.min(SC_COINS_VALUE_MAX, Math.max(SC_COINS_VALUE_MIN, parseInt(seg?.value, 10) || 1));
  }
  const label = typeof seg?.label === 'string' && seg.label.trim()
    ? seg.label.trim().slice(0, 64)
    : defaultLabelForType(type, value);
  const colorRaw = typeof seg?.color === 'string' ? seg.color.trim() : '';
  const color = /^#[0-9A-Fa-f]{6}$/.test(colorRaw) ? colorRaw : /^#[0-9A-Fa-f]{3}$/.test(colorRaw) ? colorRaw.replace(/^#(.)(.)(.)$/, (_, r, g, b) => '#' + r + r + g + g + b + b) : '#6c757d';
  // Probability 0–100. Legacy: if only weight is present, use it (clamped 0–100); selection normalizes by total.
  let probability = Math.max(0, Math.min(100, Number(seg?.probability) ?? NaN));
  if (Number.isNaN(probability)) {
    const w = Math.max(0, Number(seg?.weight) || 1);
    probability = Math.min(100, w);
  }
  if (Number.isNaN(probability) || probability < 0) probability = 0;
  return { type, value, label, color, probability };
}

/** Sum of segment probabilities (0–100 each). Must equal PROBABILITY_TOTAL for valid distribution. */
function sumSegmentProbabilities(segments) {
  if (!segments || segments.length === 0) return 0;
  return segments.reduce((sum, s) => sum + (Math.max(0, Math.min(100, Number(s.probability) || 0))), 0);
}

/** Sum of probabilities in an override's segmentProbabilities for given segment count. Missing indices count as 0. */
function sumOverrideProbabilities(segmentProbabilities, segmentCount) {
  if (!segmentProbabilities || typeof segmentProbabilities !== 'object') return 0;
  let sum = 0;
  for (let i = 0; i < segmentCount; i++) {
    const v = segmentProbabilities[String(i)];
    sum += Math.max(0, Math.min(100, Number(v) || 0));
  }
  return sum;
}

/** Validate that segment probabilities sum to PROBABILITY_TOTAL. Throws on failure. */
function validateSegmentProbabilitiesSum(segments) {
  const sum = sumSegmentProbabilities(segments);
  if (Math.abs(sum - PROBABILITY_TOTAL) > 0.01) {
    const err = new Error(
      `Segment probabilities must sum to ${PROBABILITY_TOTAL}. Current sum: ${sum.toFixed(2)}.`
    );
    err.statusCode = 400;
    throw err;
  }
}

/** Validate that an override's segmentProbabilities sum to PROBABILITY_TOTAL for the given segment count. */
function validateOverrideProbabilitiesSum(override, segmentCount) {
  const sum = sumOverrideProbabilities(override.segmentProbabilities, segmentCount);
  if (Math.abs(sum - PROBABILITY_TOTAL) > 0.01) {
    const err = new Error(
      `Probability override (whenFreeSpinsAtLeast=${override.whenFreeSpinsAtLeast}) must sum to ${PROBABILITY_TOTAL}. Current sum: ${sum.toFixed(2)}.`
    );
    err.statusCode = 400;
    throw err;
  }
}

/** Normalize probability override: segmentProbabilities by index "0", "1", "2", ... (0–100 each). */
function normalizeOverride(ov) {
  const raw = Math.max(0, parseInt(ov?.whenFreeSpinsAtLeast, 10) || 0);
  const whenFreeSpinsAtLeast = Math.min(WHEN_FREE_SPINS_AT_LEAST_MAX, raw);
  const segmentProbabilities = ov?.segmentProbabilities && typeof ov.segmentProbabilities === 'object' ? ov.segmentProbabilities : (ov?.segmentWeights && typeof ov.segmentWeights === 'object' ? ov.segmentWeights : {});
  const byIndex = {};
  Object.keys(segmentProbabilities).forEach((k) => {
    const idx = /^\d+$/.test(String(k)) ? String(k) : String(Math.max(0, parseInt(k, 10)));
    byIndex[idx] = Math.max(0, Math.min(100, parseInt(segmentProbabilities[k], 10) || 0));
  });
  return { whenFreeSpinsAtLeast, segmentProbabilities: byIndex };
}

/** Get settings for a scope. scope = null for global default; scope = { distributorCode, storeCode } for store. */
async function getSpinWheelSettings(scope = null) {
  const readForScope = async (sc) => {
    try {
      const where = { key: KEY, distributorCode: sc.distributorCode ?? null, storeCode: sc.storeCode ?? null };
      const row = await db.Setting.findOne({ where });
      if (!row || !row.value) return null;
      const parsed = JSON.parse(row.value);
      let segments = Array.isArray(parsed.segments)
        ? parsed.segments.map((s, i) => normalizeSegment(s))
        : DEFAULTS.segments;
      if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
        segments = segments.slice(0, MAX_SEGMENTS);
        while (segments.length < MIN_SEGMENTS) {
          segments.push(normalizeSegment({ ...DEFAULTS.segments[segments.length % DEFAULTS.segments.length] }));
        }
      }
      const probabilityOverrides = Array.isArray(parsed.probabilityOverrides)
        ? parsed.probabilityOverrides.map(normalizeOverride).filter((o) => o.whenFreeSpinsAtLeast >= 0)
        : Array.isArray(parsed.weightOverrides)
          ? parsed.weightOverrides.map(normalizeOverride).filter((o) => o.whenFreeSpinsAtLeast >= 0)
          : DEFAULTS.probabilityOverrides;
      return { segments, probabilityOverrides };
    } catch (err) {
      return null;
    }
  };

  if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
    const storeSettings = await readForScope(scope);
    if (storeSettings) return storeSettings;
  }
  const globalWhere = { key: KEY, distributorCode: null, storeCode: null };
  const globalRow = await db.Setting.findOne({ where: globalWhere });
  if (globalRow && globalRow.value) {
    const parsed = JSON.parse(globalRow.value);
    let segments = Array.isArray(parsed.segments) ? parsed.segments.map((s) => normalizeSegment(s)) : DEFAULTS.segments;
    if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
      segments = segments.slice(0, MAX_SEGMENTS);
      while (segments.length < MIN_SEGMENTS) {
        segments.push(normalizeSegment({ ...DEFAULTS.segments[segments.length % DEFAULTS.segments.length] }));
      }
    }
    const probabilityOverrides = Array.isArray(parsed.probabilityOverrides)
      ? parsed.probabilityOverrides.map(normalizeOverride).filter((o) => o.whenFreeSpinsAtLeast >= 0)
      : Array.isArray(parsed.weightOverrides)
        ? parsed.weightOverrides.map(normalizeOverride).filter((o) => o.whenFreeSpinsAtLeast >= 0)
        : DEFAULTS.probabilityOverrides;
    return { segments, probabilityOverrides };
  }
  return { segments: DEFAULTS.segments, probabilityOverrides: DEFAULTS.probabilityOverrides };
}

async function applySettingsToAllStoreOverrides(settings) {
  const rows = await db.Setting.findAll({
    where: {
      key: KEY,
      [Op.or]: [{ storeCode: { [Op.ne]: null } }, { distributorCode: { [Op.ne]: null } }]
    }
  });
  const value = JSON.stringify(settings);
  await Promise.all(rows.map((row) => row.update({ value })));
}

/** Update settings for a scope. scope = null for global; scope = { distributorCode, storeCode } for store.
 *  options.applyToAllStores: also write the same settings onto every store override. */
async function updateSpinWheelSettings(payload, scope = null, options = {}) {
  const existing = await getSpinWheelSettings(scope);
  let segments = Array.isArray(payload.segments)
    ? payload.segments.map((s) => normalizeSegment(s))
    : existing.segments;
  if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
    const err = new Error(`Segment count must be between ${MIN_SEGMENTS} and ${MAX_SEGMENTS}.`);
    err.statusCode = 400;
    throw err;
  }
  const probabilityOverrides = Array.isArray(payload.probabilityOverrides)
    ? payload.probabilityOverrides.map(normalizeOverride)
    : Array.isArray(payload.weightOverrides)
      ? payload.weightOverrides.map(normalizeOverride)
      : existing.probabilityOverrides;

  validateSegmentProbabilitiesSum(segments);
  probabilityOverrides.forEach((ov) => validateOverrideProbabilitiesSum(ov, segments.length));

  const settings = { segments, probabilityOverrides };
  const distributorCode = scope && scope.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope && scope.storeCode != null ? scope.storeCode : null;
  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value: JSON.stringify(settings) }
  });
  await row.update({ value: JSON.stringify(settings) });
  if (options.applyToAllStores) {
    await applySettingsToAllStoreOverrides(settings);
  }
  return settings;
}

/** Remove store override so store falls back to global default. */
async function resetSpinWheelSettingsToDefault(scope) {
  if (!scope || (scope.distributorCode == null && scope.storeCode == null)) return;
  await db.Setting.destroy({
    where: { key: KEY, distributorCode: scope.distributorCode ?? null, storeCode: scope.storeCode ?? null }
  });
}

/** Get settings for a user's store; falls back to global default. */
async function getSpinWheelSettingsForUser(userId) {
  const user = await db.User.findByPk(userId, { attributes: ['distributorCode', 'storeCode'], raw: true });
  const distributorCode = user?.distributorCode ?? null;
  const storeCode = user?.storeCode ?? null;
  return getSpinWheelSettings({ distributorCode, storeCode });
}

/** Public config for wheel display (includes probability 0–100 for slice size). */
async function getSpinWheelPublicConfig(scope = null) {
  const { segments } = await getSpinWheelSettings(scope);
  return {
    segments: segments.map(({ type, value, label, color, probability }) => ({
      type,
      value,
      label,
      color,
      probability: Math.max(0, Math.min(100, Number(probability) ?? 0))
    }))
  };
}

module.exports = {
  getSpinWheelSettings,
  updateSpinWheelSettings,
  resetSpinWheelSettingsToDefault,
  getSpinWheelSettingsForUser,
  getSpinWheelPublicConfig,
  KEY,
  DEFAULTS,
  PROBABILITY_TOTAL,
  MIN_SEGMENTS,
  MAX_SEGMENTS,
  FREE_SPIN_VALUE_MIN,
  FREE_SPIN_VALUE_MAX,
  COUPON_PERCENT_MIN,
  COUPON_PERCENT_MAX,
  WHEN_FREE_SPINS_AT_LEAST_MAX,
  sumSegmentProbabilities,
  validateSegmentProbabilitiesSum,
  validateOverrideProbabilitiesSum
};
