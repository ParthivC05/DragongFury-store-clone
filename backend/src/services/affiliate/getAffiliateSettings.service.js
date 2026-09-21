'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { createLogger } = require('../../libs/logger');
const { getCurrencySetting } = require('../wallet/getCurrencySetting.service');
const { normalizeStoreCode } = require('../auth/storeBinding.helpers');
const {
  FRIEND_SIGNUP_BONUS_SC,
  REFERRER_REWARD_SC,
  MIN_QUALIFYING_DEPOSIT_USD,
  PAYOUT_DELAY_HOURS,
  WEEKLY_CAP_SC
} = require('./giveGetReferral.constants');

const log = createLogger('affiliateSettings');

const KEY = 'affiliate_settings';
const PROGRAM_GIVE_GET = 'give_get';
const PROGRAM_CLASSIC = 'classic';

const MAX_AMOUNT_SC = 10000;
const MAX_DEPOSIT_USD = 100000;
const MAX_DELAY_HOURS = 24 * 30;
const MAX_WEEKLY_CAP = 100000;
const MAX_PERCENTAGE = 100;
const MAX_REWARDS_PER_REFERRAL = 20;

/** Platform default when a store has no override: Give / Get. */
const GIVE_GET_DEFAULTS = {
  programMode: PROGRAM_GIVE_GET,
  rewardType: 'fixed',
  rewardPercentage: 0,
  rewardFixedSc: 0,
  rewardMaxSc: 0,
  maxRewardsPerReferral: 1,
  friendSignupBonusSc: FRIEND_SIGNUP_BONUS_SC,
  referrerRewardSc: REFERRER_REWARD_SC,
  minQualifyingDepositUsd: MIN_QUALIFYING_DEPOSIT_USD,
  payoutDelayHours: PAYOUT_DELAY_HOURS,
  weeklyCapSc: WEEKLY_CAP_SC
};

/** Commission: friend signup SC + % of the referred user’s first N deposits. */
const CLASSIC_DEFAULTS = {
  programMode: PROGRAM_CLASSIC,
  rewardType: 'percentage',
  rewardPercentage: 10,
  rewardFixedSc: 0,
  rewardMaxSc: 0,
  maxRewardsPerReferral: 3,
  friendSignupBonusSc: 5,
  referrerRewardSc: 0,
  minQualifyingDepositUsd: 0,
  payoutDelayHours: 0,
  weeklyCapSc: 0
};

const DEFAULTS = {
  ...GIVE_GET_DEFAULTS
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function clampNumber(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function baseDefaultsForStore(programMode = PROGRAM_GIVE_GET) {
  return programMode === PROGRAM_CLASSIC ? { ...CLASSIC_DEFAULTS } : { ...GIVE_GET_DEFAULTS };
}

function resolveProgramMode(parsed) {
  const raw = String(parsed.programMode || parsed.program_mode || '').toLowerCase();
  if (raw === PROGRAM_CLASSIC || raw === 'commission') return PROGRAM_CLASSIC;
  if (raw === PROGRAM_GIVE_GET) return PROGRAM_GIVE_GET;
  const pct = Number(parsed.rewardPercentage ?? parsed.reward_percentage);
  const maxN = Number(parsed.maxRewardsPerReferral ?? parsed.max_rewards_per_referral);
  if (Number.isFinite(pct) && pct > 0 && Number.isFinite(maxN) && maxN > 1) {
    return PROGRAM_CLASSIC;
  }
  return PROGRAM_GIVE_GET;
}

function parseRow(row) {
  if (!row?.value) return null;
  try {
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    if (!parsed || typeof parsed !== 'object') return null;

    const programMode = resolveProgramMode(parsed);
    const defaults = baseDefaultsForStore(programMode);

    return {
      programMode,
      rewardType: programMode === PROGRAM_CLASSIC ? 'percentage' : 'fixed',
      rewardPercentage: round2(
        clampNumber(
          parsed.rewardPercentage ?? parsed.reward_percentage,
          0,
          MAX_PERCENTAGE,
          defaults.rewardPercentage
        )
      ),
      rewardFixedSc: round2(
        clampNumber(
          parsed.rewardFixedSc ?? parsed.reward_fixed_sc,
          0,
          MAX_AMOUNT_SC,
          defaults.rewardFixedSc
        )
      ),
      rewardMaxSc: round2(
        clampNumber(
          parsed.rewardMaxSc ?? parsed.reward_max_sc,
          0,
          MAX_AMOUNT_SC,
          defaults.rewardMaxSc
        )
      ),
      maxRewardsPerReferral: Math.round(
        clampNumber(
          parsed.maxRewardsPerReferral ?? parsed.max_rewards_per_referral,
          1,
          MAX_REWARDS_PER_REFERRAL,
          defaults.maxRewardsPerReferral
        )
      ),
      friendSignupBonusSc: round2(
        clampNumber(
          parsed.friendSignupBonusSc ?? parsed.friend_signup_bonus_sc,
          0,
          MAX_AMOUNT_SC,
          defaults.friendSignupBonusSc
        )
      ),
      referrerRewardSc: round2(
        clampNumber(
          parsed.referrerRewardSc ?? parsed.referrer_reward_sc,
          0,
          MAX_AMOUNT_SC,
          defaults.referrerRewardSc
        )
      ),
      minQualifyingDepositUsd: round2(
        clampNumber(
          parsed.minQualifyingDepositUsd ?? parsed.min_qualifying_deposit_usd,
          0,
          MAX_DEPOSIT_USD,
          defaults.minQualifyingDepositUsd
        )
      ),
      payoutDelayHours: clampNumber(
        parsed.payoutDelayHours ?? parsed.payout_delay_hours,
        0,
        MAX_DELAY_HOURS,
        defaults.payoutDelayHours
      ),
      weeklyCapSc: round2(
        clampNumber(
          parsed.weeklyCapSc ?? parsed.weekly_cap_sc,
          0,
          MAX_WEEKLY_CAP,
          defaults.weeklyCapSc
        )
      ),
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
    };
  } catch (_) {
    return null;
  }
}

function withMeta(settings, { hasOverride = false, distributorCode = null, storeCode = null } = {}) {
  const payoutDelayHours = Number(settings.payoutDelayHours) || 0;
  const programMode = settings.programMode === PROGRAM_CLASSIC ? PROGRAM_CLASSIC : PROGRAM_GIVE_GET;
  return {
    ...settings,
    programMode,
    payoutDelayMinutes: Math.round(payoutDelayHours * 60),
    isGiveGet: programMode === PROGRAM_GIVE_GET,
    isClassic: programMode === PROGRAM_CLASSIC,
    hasOverride,
    distributorCode,
    storeCode: storeCode ? normalizeStoreCode(storeCode) || storeCode : null
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

/**
 * Effective affiliate settings for a distributor+store.
 * Missing row → Give/Get platform defaults (15/15, $20, 24h, 100 SC/week).
 */
async function getEffectiveSettings(distributorCode, storeCode) {
  const code = normalizeStoreCode(storeCode);
  const currency = await getCurrencySetting().catch(() => 'SC');
  if (!code) {
    return withMeta(
      { ...GIVE_GET_DEFAULTS, currency, updatedBy: null, updatedAt: null },
      { hasOverride: false, distributorCode: distributorCode ?? null, storeCode: null }
    );
  }

  const row = await getSettingRow(distributorCode, code);
  const parsed = parseRow(row);
  if (parsed) {
    return withMeta(
      { ...parsed, currency },
      {
        hasOverride: true,
        distributorCode: row?.distributorCode ?? distributorCode ?? null,
        storeCode: code
      }
    );
  }

  return withMeta(
    { ...GIVE_GET_DEFAULTS, currency, updatedBy: null, updatedAt: null },
    { hasOverride: false, distributorCode: distributorCode ?? null, storeCode: code }
  );
}

async function getEffectiveSettingsForStoreCode(storeCode) {
  const code = normalizeStoreCode(storeCode);
  if (!code) {
    return getEffectiveSettings(null, null);
  }
  let distributorCode = null;
  try {
    const scope = await resolveStoreScope({ storeCode: code });
    distributorCode = scope.distributorCode;
  } catch (_) {
    // Still resolve by store_code alone.
  }
  return getEffectiveSettings(distributorCode, code);
}

async function getAffiliateSettings(scope = null) {
  try {
    if (scope && (scope.distributorCode != null || scope.storeCode != null)) {
      return getEffectiveSettings(scope.distributorCode, scope.storeCode);
    }

    const currency = await getCurrencySetting().catch(() => 'SC');
    const globalRow = await db.Setting.findOne({
      where: { key: KEY, distributorCode: null, storeCode: null }
    });
    const parsed = parseRow(globalRow);
    if (parsed) {
      return withMeta(
        { ...parsed, currency },
        { hasOverride: true, distributorCode: null, storeCode: null }
      );
    }
    return withMeta(
      { ...GIVE_GET_DEFAULTS, currency, updatedBy: null, updatedAt: null },
      { hasOverride: false, distributorCode: null, storeCode: null }
    );
  } catch (err) {
    const currency = await getCurrencySetting().catch(() => 'SC');
    return withMeta(
      { ...GIVE_GET_DEFAULTS, currency, updatedBy: null, updatedAt: null },
      { hasOverride: false }
    );
  }
}

function normalizePayload(payload = {}) {
  const programMode = resolveProgramMode(payload);
  const defaults = baseDefaultsForStore(programMode);

  const friendSignupBonusSc = round2(
    clampNumber(
      payload.friendSignupBonusSc ?? payload.friend_signup_bonus_sc,
      0,
      MAX_AMOUNT_SC,
      defaults.friendSignupBonusSc
    )
  );
  const referrerRewardSc = round2(
    clampNumber(
      payload.referrerRewardSc ?? payload.referrer_reward_sc,
      0,
      MAX_AMOUNT_SC,
      defaults.referrerRewardSc
    )
  );
  const minQualifyingDepositUsd = round2(
    clampNumber(
      payload.minQualifyingDepositUsd ?? payload.min_qualifying_deposit_usd,
      0,
      MAX_DEPOSIT_USD,
      defaults.minQualifyingDepositUsd
    )
  );
  const payoutDelayHours = clampNumber(
    payload.payoutDelayHours ?? payload.payout_delay_hours,
    0,
    MAX_DELAY_HOURS,
    defaults.payoutDelayHours
  );
  const weeklyCapSc = round2(
    clampNumber(
      payload.weeklyCapSc ?? payload.weekly_cap_sc,
      0,
      MAX_WEEKLY_CAP,
      defaults.weeklyCapSc
    )
  );
  const rewardPercentage = round2(
    clampNumber(
      payload.rewardPercentage ?? payload.reward_percentage,
      0,
      MAX_PERCENTAGE,
      defaults.rewardPercentage
    )
  );
  const rewardMaxSc = round2(
    clampNumber(
      payload.rewardMaxSc ?? payload.reward_max_sc,
      0,
      MAX_AMOUNT_SC,
      defaults.rewardMaxSc
    )
  );
  const maxRewardsPerReferral = Math.round(
    clampNumber(
      payload.maxRewardsPerReferral ?? payload.max_rewards_per_referral,
      1,
      MAX_REWARDS_PER_REFERRAL,
      defaults.maxRewardsPerReferral
    )
  );

  if (programMode === PROGRAM_CLASSIC) {
    if (!(rewardPercentage > 0)) {
      const err = new Error('Commission program requires rewardPercentage greater than 0.');
      err.statusCode = 400;
      throw err;
    }
  } else if (!(friendSignupBonusSc > 0) && !(referrerRewardSc > 0)) {
    const err = new Error(
      'Give/Get requires friendSignupBonusSc and/or referrerRewardSc greater than 0.'
    );
    err.statusCode = 400;
    throw err;
  }

  return {
    programMode,
    rewardType: programMode === PROGRAM_CLASSIC ? 'percentage' : 'fixed',
    rewardPercentage,
    rewardFixedSc: 0,
    rewardMaxSc,
    maxRewardsPerReferral,
    friendSignupBonusSc,
    referrerRewardSc,
    minQualifyingDepositUsd,
    payoutDelayHours,
    weeklyCapSc
  };
}

async function updateAffiliateSettings(payload, scope = null) {
  const distributorCode = scope && scope.distributorCode != null ? scope.distributorCode : null;
  const storeCode = scope && scope.storeCode != null ? scope.storeCode : null;
  const settings = normalizePayload(payload);
  const updatedAt = new Date().toISOString();
  const valueObj = {
    ...settings,
    updatedBy: payload.updatedBy || null,
    updatedAt
  };

  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value: JSON.stringify(valueObj) }
  });
  await row.update({ value: JSON.stringify(valueObj) });

  const currency = await getCurrencySetting().catch(() => 'SC');
  return withMeta(
    { ...settings, currency, updatedBy: valueObj.updatedBy, updatedAt },
    { hasOverride: true, distributorCode, storeCode }
  );
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
    settingsMap.set(mapKey, parseRow(row));
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

  const currency = await getCurrencySetting().catch(() => 'SC');

  return {
    currency,
    stores: uniqueStores.map((s) => {
      const code = normalizeStoreCode(s.storeCode);
      const mapKey = `${s.distributorCode || ''}|${code}`;
      const parsed = settingsMap.get(mapKey);
      const effective = parsed || baseDefaultsForStore();
      const payoutDelayHours = Number(effective.payoutDelayHours) || 0;
      return {
        userId: s.userId,
        username: s.username,
        email: s.email,
        distributorCode: s.distributorCode,
        storeCode: s.storeCode,
        isActive: s.isActive !== false,
        hasOverride: !!parsed,
        programMode: effective.programMode === PROGRAM_CLASSIC ? PROGRAM_CLASSIC : PROGRAM_GIVE_GET,
        isGiveGet: effective.programMode !== PROGRAM_CLASSIC,
        isClassic: effective.programMode === PROGRAM_CLASSIC,
        rewardPercentage: effective.rewardPercentage,
        rewardMaxSc: effective.rewardMaxSc,
        maxRewardsPerReferral: effective.maxRewardsPerReferral,
        friendSignupBonusSc: effective.friendSignupBonusSc,
        referrerRewardSc: effective.referrerRewardSc,
        minQualifyingDepositUsd: effective.minQualifyingDepositUsd,
        payoutDelayHours,
        payoutDelayMinutes: Math.round(payoutDelayHours * 60),
        weeklyCapSc: effective.weeklyCapSc,
        updatedBy: effective.updatedBy || null,
        updatedAt: effective.updatedAt || null
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
    currency: effective.currency,
    stores: [
      {
        userId: store.userId,
        username: store.username,
        email: store.email,
        distributorCode: store.distributorCode,
        storeCode: store.storeCode,
        isActive: store.isActive,
        hasOverride: effective.hasOverride,
        programMode: effective.programMode === PROGRAM_CLASSIC ? PROGRAM_CLASSIC : PROGRAM_GIVE_GET,
        isGiveGet: effective.programMode !== PROGRAM_CLASSIC,
        isClassic: effective.programMode === PROGRAM_CLASSIC,
        rewardPercentage: effective.rewardPercentage,
        rewardMaxSc: effective.rewardMaxSc,
        maxRewardsPerReferral: effective.maxRewardsPerReferral,
        friendSignupBonusSc: effective.friendSignupBonusSc,
        referrerRewardSc: effective.referrerRewardSc,
        minQualifyingDepositUsd: effective.minQualifyingDepositUsd,
        payoutDelayHours: effective.payoutDelayHours,
        payoutDelayMinutes: effective.payoutDelayMinutes,
        weeklyCapSc: effective.weeklyCapSc,
        updatedBy: effective.updatedBy,
        updatedAt: effective.updatedAt
      }
    ]
  };
}

async function upsertStoreSettings(scope, payload, { updatedBy } = {}) {
  const store = await resolveStoreScope(scope);
  const settings = normalizePayload(payload);
  const updatedAt = new Date().toISOString();
  const valueObj = {
    ...settings,
    updatedBy: updatedBy || null,
    updatedAt
  };

  const previous = await getEffectiveSettings(store.distributorCode, store.storeCode);

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

  log.info('Affiliate Give/Get settings updated', {
    storeCode: store.storeCode,
    distributorCode: store.distributorCode,
    updatedBy: updatedBy || null,
    previous: {
      friendSignupBonusSc: previous.friendSignupBonusSc,
      referrerRewardSc: previous.referrerRewardSc
    },
    next: {
      friendSignupBonusSc: settings.friendSignupBonusSc,
      referrerRewardSc: settings.referrerRewardSc
    }
  });

  const currency = await getCurrencySetting().catch(() => 'SC');
  return withMeta(
    { ...settings, currency, updatedBy: updatedBy || null, updatedAt },
    {
      hasOverride: true,
      distributorCode: store.distributorCode,
      storeCode: store.storeCode
    }
  );
}

module.exports = {
  KEY,
  DEFAULTS,
  CLASSIC_DEFAULTS,
  GIVE_GET_DEFAULTS,
  PROGRAM_CLASSIC,
  PROGRAM_GIVE_GET,
  MAX_AMOUNT_SC,
  getAffiliateSettings,
  updateAffiliateSettings,
  getEffectiveSettings,
  getEffectiveSettingsForStoreCode,
  listAllStoreSettings,
  listOwnStoreSettings,
  upsertStoreSettings,
  resolveStoreScope,
  normalizePayload
};
