const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

const KEY = 'new_user_deposit_bonus_settings';

const DEFAULT_TIERS = [
  {
    depositNumber: 1,
    enabled: false,
    bonusType: 'percentage',
    bonusValue: 10,
    minTriggerAmount: 0,
    maxBonusCap: null,
    title: '1st Deposit Bonus'
  },
  {
    depositNumber: 2,
    enabled: false,
    bonusType: 'percentage',
    bonusValue: 30,
    minTriggerAmount: 0,
    maxBonusCap: null,
    title: '2nd Deposit Bonus'
  },
  {
    depositNumber: 3,
    enabled: false,
    bonusType: 'percentage',
    bonusValue: 70,
    minTriggerAmount: 0,
    maxBonusCap: null,
    title: '3rd Deposit Bonus'
  }
];

const DEFAULTS = {
  enabled: false,
  expiryHours: 24,
  applyToAllStores: true,
  storeCodes: [],
  tiers: DEFAULT_TIERS
};

function normalizeTier(raw, depositNumber) {
  const bonusType = String(raw?.bonusType || 'percentage').toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
  const bonusValue = Math.max(0, Number(raw?.bonusValue) || 0);
  const minTriggerAmount = Math.max(0, Number(raw?.minTriggerAmount) || 0);
  const maxBonusCapRaw = raw?.maxBonusCap;
  const maxBonusCap = maxBonusCapRaw != null && maxBonusCapRaw !== '' ? Math.max(0, Number(maxBonusCapRaw) || 0) : null;
  const title = typeof raw?.title === 'string' && raw.title.trim()
    ? raw.title.trim().slice(0, 128)
    : `${depositNumber}${depositNumber === 1 ? 'st' : depositNumber === 2 ? 'nd' : 'rd'} Deposit Bonus`;
  return {
    depositNumber,
    enabled: raw?.enabled === true,
    bonusType,
    bonusValue,
    minTriggerAmount,
    maxBonusCap,
    title
  };
}

function normalizeSettings(parsed) {
  const src = parsed && typeof parsed === 'object' ? parsed : {};
  const tiersByNumber = {};
  (Array.isArray(src.tiers) ? src.tiers : []).forEach((t) => {
    const n = parseInt(t?.depositNumber, 10);
    if (n >= 1 && n <= 3) tiersByNumber[n] = normalizeTier(t, n);
  });
  const tiers = [1, 2, 3].map((n) => tiersByNumber[n] || normalizeTier(DEFAULT_TIERS[n - 1], n));
  const storeCodes = Array.isArray(src.storeCodes)
    ? [...new Set(src.storeCodes.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean))]
    : [];
  const expiryHours = Math.max(1, Math.min(168, parseInt(src.expiryHours, 10) || DEFAULTS.expiryHours));
  return {
    enabled: src.enabled === true,
    expiryHours,
    applyToAllStores: src.applyToAllStores !== false,
    storeCodes,
    tiers
  };
}

async function readSettingsForScope(scope) {
  try {
    const distributorCode = scope?.distributorCode ?? null;
    const storeCode = scope?.storeCode ?? null;
    const row = await db.Setting.findOne({
      where: { key: KEY, distributorCode, storeCode }
    });
    if (!row?.value) return null;
    return normalizeSettings(JSON.parse(row.value));
  } catch (_) {
    return null;
  }
}

/** Get settings for a scope. scope = null for global; scope = { distributorCode, storeCode } for store. */
async function getNewUserDepositBonusSettings(scope = null) {
  if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
    const storeSettings = await readSettingsForScope(scope);
    if (storeSettings) return storeSettings;
  }
  const global = await readSettingsForScope({ distributorCode: null, storeCode: null });
  return global || normalizeSettings(DEFAULTS);
}

function isStoreEligible(settings, userStoreCode, isStoreScoped) {
  if (!settings?.enabled) return false;
  if (isStoreScoped) return true;
  if (settings.applyToAllStores) return true;
  const code = String(userStoreCode || '').trim().toLowerCase();
  if (!code) return false;
  return (settings.storeCodes || []).includes(code);
}

function getTierForDepositCount(settings, depositCount) {
  return (settings.tiers || []).find((t) => t.depositNumber === depositCount) || null;
}

function getExpiryAt(userCreatedAt, settings) {
  if (!userCreatedAt) return null;
  const hours = Math.max(1, Number(settings?.expiryHours) || DEFAULTS.expiryHours);
  return new Date(new Date(userCreatedAt).getTime() + hours * 60 * 60 * 1000);
}

function isWithinExpiryWindow(userCreatedAt, settings, now = new Date()) {
  const expiresAt = getExpiryAt(userCreatedAt, settings);
  if (!expiresAt) return false;
  return now.getTime() <= expiresAt.getTime();
}

/** Resolve effective settings + scope flag for a user. */
async function getNewUserDepositBonusSettingsForUser(userId) {
  const user = await db.User.findByPk(userId, {
    attributes: ['distributorCode', 'storeCode', 'createdAt'],
    raw: true
  });
  if (!user) return { user: null, settings: normalizeSettings(DEFAULTS), isStoreScoped: false };

  const storeScope = user.storeCode != null || user.distributorCode != null
    ? { distributorCode: user.distributorCode ?? null, storeCode: user.storeCode ?? null }
    : null;

  if (storeScope) {
    const storeRow = await readSettingsForScope(storeScope);
    if (storeRow) {
      return { user, settings: storeRow, isStoreScoped: true };
    }
  }

  const global = await getNewUserDepositBonusSettings(null);
  return { user, settings: global, isStoreScoped: false };
}

function evaluateProgramEligibility({ user, settings, isStoreScoped }, depositCount, now = new Date()) {
  if (!user || !settings?.enabled) {
    return { inProgram: false, expiresAt: null, reason: 'disabled' };
  }
  if (depositCount < 1 || depositCount > 3) {
    return { inProgram: false, expiresAt: getExpiryAt(user.createdAt, settings), reason: 'deposit_limit' };
  }
  if (!isStoreEligible(settings, user.storeCode, isStoreScoped)) {
    return { inProgram: false, expiresAt: getExpiryAt(user.createdAt, settings), reason: 'store' };
  }
  const expiresAt = getExpiryAt(user.createdAt, settings);
  if (!isWithinExpiryWindow(user.createdAt, settings, now)) {
    return { inProgram: false, expiresAt, reason: 'expired' };
  }
  return { inProgram: true, expiresAt, reason: null };
}

/** Public eligibility payload for partner app. */
async function getNewUserDepositBonusEligibility(userId) {
  const ctx = await getNewUserDepositBonusSettingsForUser(userId);
  const depositCount = await db.DepositRequest.count({
    where: { userId, status: 'completed' }
  });

  const program = evaluateProgramEligibility(ctx, depositCount + 1);
  const nextDepositNumber = depositCount + 1;
  const nextTier = program.inProgram ? getTierForDepositCount(ctx.settings, nextDepositNumber) : null;

  const tiers = (ctx.settings.tiers || []).map((tier) => ({
    deposit_number: tier.depositNumber,
    enabled: tier.enabled,
    bonus_type: tier.bonusType,
    bonus_value: tier.bonusValue,
    min_trigger_amount: tier.minTriggerAmount,
    max_bonus_cap: tier.maxBonusCap,
    title: tier.title,
    claimed: depositCount >= tier.depositNumber
  }));

  return {
    enabled: ctx.settings.enabled,
    in_program: program.inProgram && depositCount < 3,
    expires_at: program.expiresAt ? program.expiresAt.toISOString() : null,
    completed_deposits: depositCount,
    next_deposit_number: program.inProgram && depositCount < 3 ? nextDepositNumber : null,
    next_bonus_type: nextTier?.enabled ? nextTier.bonusType : null,
    next_bonus_value: nextTier?.enabled ? nextTier.bonusValue : null,
    next_title: nextTier?.enabled ? nextTier.title : null,
    tiers
  };
}

/** Update settings for a scope. */
async function updateNewUserDepositBonusSettings(payload, scope = null) {
  const existing = await getNewUserDepositBonusSettings(scope);
  const merged = normalizeSettings({
    ...existing,
    ...payload,
    tiers: Array.isArray(payload?.tiers) ? payload.tiers : existing.tiers
  });

  const distributorCode = scope && scope.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope && scope.storeCode != null ? scope.storeCode : null;
  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value: JSON.stringify(merged) }
  });
  await row.update({ value: JSON.stringify(merged) });
  return merged;
}

async function resetNewUserDepositBonusSettingsToDefault(scope) {
  if (!scope || (scope.distributorCode == null && scope.storeCode == null)) return;
  await db.Setting.destroy({
    where: {
      key: KEY,
      distributorCode: scope.distributorCode ?? null,
      storeCode: scope.storeCode ?? null
    }
  });
}

async function resolveScopeFromStoreCode(storeCode) {
  const norm = storeCode && String(storeCode).trim();
  if (!norm) return null;

  const storeAdmin = await db.User.findOne({
    where: { role: ROLES.STORE_ADMIN, storeCode: norm, storeRoleId: null },
    attributes: ['distributorCode', 'storeCode'],
    raw: true
  });
  if (storeAdmin) {
    return {
      distributorCode: storeAdmin.distributorCode ?? null,
      storeCode: storeAdmin.storeCode ?? norm
    };
  }
  return { distributorCode: null, storeCode: norm };
}

/** Public landing-page promo payload (enabled tiers only). */
async function getPublicDepositBonusPromo(scope = null) {
  const settings = await getNewUserDepositBonusSettings(scope);
  if (!settings.enabled) {
    return { enabled: false, expiry_hours: settings.expiryHours, tiers: [] };
  }
  const tiers = (settings.tiers || [])
    .filter((t) => t.enabled && t.bonusValue > 0)
    .map((t) => ({
      deposit_number: t.depositNumber,
      bonus_type: t.bonusType,
      bonus_value: t.bonusValue,
      min_trigger_amount: t.minTriggerAmount,
      max_bonus_cap: t.maxBonusCap,
      title: t.title
    }));
  return {
    enabled: tiers.length > 0,
    expiry_hours: settings.expiryHours,
    tiers
  };
}

function toPublicSettings(settings) {
  return {
    enabled: settings.enabled,
    expiry_hours: settings.expiryHours,
    apply_to_all_stores: settings.applyToAllStores,
    store_codes: settings.storeCodes,
    tiers: settings.tiers.map((t) => ({
      deposit_number: t.depositNumber,
      enabled: t.enabled,
      bonus_type: t.bonusType,
      bonus_value: t.bonusValue,
      min_trigger_amount: t.minTriggerAmount,
      max_bonus_cap: t.maxBonusCap,
      title: t.title
    }))
  };
}

module.exports = {
  KEY,
  DEFAULTS,
  getNewUserDepositBonusSettings,
  getNewUserDepositBonusSettingsForUser,
  getNewUserDepositBonusEligibility,
  updateNewUserDepositBonusSettings,
  resetNewUserDepositBonusSettingsToDefault,
  evaluateProgramEligibility,
  getTierForDepositCount,
  getExpiryAt,
  isStoreEligible,
  toPublicSettings,
  normalizeSettings,
  resolveScopeFromStoreCode,
  getPublicDepositBonusPromo
};
