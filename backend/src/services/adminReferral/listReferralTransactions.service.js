'use strict';

const db = require('../../db/models');
const { QueryTypes } = require('sequelize');
const { ROLES } = require('../../constants/roles');
const { buildDateTimeRangeFilterParts } = require('../../utils/dateRangeFilters');
const { FRIEND_SIGNUP_TX_TYPE, REWARD_STATUS } = require('../affiliate/giveGetReferral.constants');
const { getEffectiveSettingsForStoreCode } = require('../affiliate/getAffiliateSettings.service');
const { explainMissingFriendSignupBonus } = require('../affiliate/grantReferralFriendSignupBonus.service');
const { canViewPlayerEmail } = require('../../utils/playerEmailVisibility');

/** Give/Get friend signup bonus went live around this date. */
const GIVE_GET_START = new Date('2026-07-17T00:00:00.000Z');

/**
 * Simple filters for store admins (plain language keys).
 */
const VALID_SIMPLE_FILTERS = new Set([
  'friend_waiting',
  'inviter_waiting',
  'both_received',
  'inviter_blocked',
  'classic_10pct'
]);

function buildScopeClauses(req, query, replacements, referrerAlias, friendAlias) {
  const clauses = [];
  if (req.role === ROLES.STORE_ADMIN) {
    clauses.push(
      `(${referrerAlias}.store_code = :scopedStoreCode OR ${friendAlias}.store_code = :scopedStoreCode)`
    );
    replacements.scopedStoreCode = req.storeCode || '';
  } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
    clauses.push(
      `(${referrerAlias}.distributor_code = :scopedDistributorCode OR ${friendAlias}.distributor_code = :scopedDistributorCode)`
    );
    replacements.scopedDistributorCode = req.distributorCode || '';
    const scDist = query.storeCode && String(query.storeCode).trim();
    if (scDist) {
      clauses.push(
        `(${referrerAlias}.store_code = :filterStoreCodeDist OR ${friendAlias}.store_code = :filterStoreCodeDist)`
      );
      replacements.filterStoreCodeDist = scDist;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    const sc = query.storeCode && String(query.storeCode).trim();
    const dc = query.distributorCode && String(query.distributorCode).trim();
    if (sc) {
      clauses.push(
        `(${referrerAlias}.store_code = :filterStoreCode OR ${friendAlias}.store_code = :filterStoreCode)`
      );
      replacements.filterStoreCode = sc;
    }
    if (dc) {
      clauses.push(
        `(${referrerAlias}.distributor_code = :filterDistributorCode OR ${friendAlias}.distributor_code = :filterDistributorCode)`
      );
      replacements.filterDistributorCode = dc;
    }
  }
  return clauses;
}

function buildSearchClauses(search, replacements, referrerAlias, friendAlias, role = null) {
  const q = (search || '').toString().trim();
  if (!q) return [];
  replacements.searchLike = `%${q.toLowerCase()}%`;
  const idNum = Number(q);
  const idClause = Number.isInteger(idNum) && idNum > 0
    ? ` OR ${referrerAlias}.user_id = :searchUserId OR ${friendAlias}.user_id = :searchUserId`
    : '';
  if (Number.isInteger(idNum) && idNum > 0) replacements.searchUserId = idNum;
  const emailClauses = canViewPlayerEmail(role)
    ? ` OR LOWER(COALESCE(${referrerAlias}.email, '')) LIKE :searchLike
      OR LOWER(COALESCE(${friendAlias}.email, '')) LIKE :searchLike`
    : '';
  return [
    `(
      LOWER(COALESCE(${referrerAlias}.username, '')) LIKE :searchLike
      OR LOWER(COALESCE(${friendAlias}.username, '')) LIKE :searchLike
      ${emailClauses}
      ${idClause}
    )`
  ];
}

function isClassicProgramRow(row) {
  const classicCount = Number(row.classic_reward_count) || 0;
  const hasFriendSignup = Number(row.friend_bonus_amount) > 0;
  const hasGiveGetReward = !!row.reward_status;
  if (classicCount > 0 && !hasFriendSignup) return true;
  if (hasFriendSignup || hasGiveGetReward) return false;
  const joined = row.friend_joined_at ? new Date(row.friend_joined_at) : null;
  if (joined && !Number.isNaN(joined.getTime()) && joined < GIVE_GET_START) return true;
  return false;
}

function friendBonusSummary(row, settingsByStore = null) {
  const amount = row.friend_bonus_amount != null ? Number(row.friend_bonus_amount) : null;
  if (amount != null && Number.isFinite(amount) && amount > 0) {
    return {
      key: 'received',
      label: 'Yes — got SC',
      detail: `Signup bonus: ${amount.toFixed(2)} SC`,
      amount,
      at: row.friend_bonus_at || null
    };
  }

  if (isClassicProgramRow(row)) {
    return {
      key: 'classic_no_signup',
      label: 'No signup SC',
      detail: 'Old 10% program: friend did not get signup SC (only inviter earns 10% of deposits)',
      amount: null,
      at: null
    };
  }

  const welcomeAmount = row.welcome_bonus_amount != null ? Number(row.welcome_bonus_amount) : null;
  if (welcomeAmount != null && Number.isFinite(welcomeAmount) && welcomeAmount > 0) {
    return {
      key: 'got_welcome_instead',
      label: 'Got welcome SC instead',
      detail: `Reason: received welcome signup bonus (${welcomeAmount.toFixed(2)} SC) instead of referral friend signup SC`,
      amount: welcomeAmount,
      at: row.welcome_bonus_at || null
    };
  }

  const storeCode = row.friend_store_code || row.referrer_store_code || '';
  const settings = storeCode
    ? settingsByStore?.get(String(storeCode).trim().toLowerCase())
    : null;

  const detail = explainMissingFriendSignupBonus({
    role: row.friend_role,
    isAdmin: row.friend_is_admin,
    storeCode: row.friend_store_code,
    referredBy: row.referrer_user_id,
    settings,
    createdAt: row.friend_joined_at
  });

  return {
    key: 'not_yet',
    label: 'Not yet',
    detail,
    amount: null,
    at: null
  };
}

function inviterBonusSummary(row) {
  const classicTotal = row.classic_reward_total != null ? Number(row.classic_reward_total) : 0;
  const classicCount = Number(row.classic_reward_count) || 0;

  if (isClassicProgramRow(row)) {
    if (classicCount > 0 && classicTotal > 0) {
      return {
        key: 'received',
        label: 'Yes — 10% of deposits',
        detail: `Old program: inviter got ${classicTotal.toFixed(2)} SC from ${classicCount} friend deposit(s) (10% each, up to 3)`,
        amount: classicTotal,
        at: row.classic_reward_last_at || null
      };
    }
    return {
      key: 'classic_waiting',
      label: 'Waiting on deposits',
      detail: 'Old 10% program: inviter earns 10% when friend completes deposits (up to 3 times)',
      amount: null,
      at: null
    };
  }

  const status = row.reward_status || null;
  const amount = row.reward_amount != null ? Number(row.reward_amount) : null;
  const amountText = amount != null && Number.isFinite(amount) ? `${amount.toFixed(2)} SC` : null;

  if (!status) {
    return {
      key: 'not_started',
      label: 'Not yet',
      detail: 'Friend still needs to deposit and play',
      amount: null,
      at: null
    };
  }
  if (status === REWARD_STATUS.PAID) {
    return {
      key: 'received',
      label: 'Yes — got SC',
      detail: amountText || 'SC added',
      amount,
      at: row.reward_credited_at || null
    };
  }
  if (status === REWARD_STATUS.AWAITING_PLAYTHROUGH) {
    return {
      key: 'waiting_play',
      label: 'Waiting',
      detail: 'Friend must play a game first',
      amount,
      at: null
    };
  }
  if (status === REWARD_STATUS.SCHEDULED) {
    return {
      key: 'waiting_payout',
      label: 'Waiting',
      detail: 'Bonus coming soon',
      amount,
      at: row.reward_payout_at || null
    };
  }
  if (status === REWARD_STATUS.CAPPED) {
    return {
      key: 'blocked',
      label: 'No — weekly limit',
      detail: 'Inviter hit the weekly SC limit',
      amount,
      at: null
    };
  }
  return {
    key: 'unknown',
    label: status,
    detail: null,
    amount,
    at: null
  };
}

function programSummary(row) {
  if (isClassicProgramRow(row)) {
    return {
      key: 'classic_10pct',
      label: 'Old 10% deposit',
      detail: 'Friend: no signup SC. Inviter: 10% of friend’s first 3 deposits.'
    };
  }
  return {
    key: 'give_get',
    label: 'Give / Get',
    detail: 'Friend gets signup SC. Inviter gets fixed SC after friend deposits & plays.'
  };
}

function serializePair(row, settingsByStore = null, role = null) {
  const friendBonus = friendBonusSummary(row, settingsByStore);
  const inviterBonus = inviterBonusSummary(row);
  const program = programSummary(row);

  return {
    id: `pair:${row.friend_user_id}`,
    createdAt: row.friend_joined_at,
    storeCode: row.referrer_store_code || row.friend_store_code || null,
    distributorCode: row.referrer_distributor_code || row.friend_distributor_code || null,
    program,
    whoInvited: {
      userId: Number(row.referrer_user_id),
      username: row.referrer_username || '',
      ...(canViewPlayerEmail(role) ? { email: row.referrer_email || '' } : {}),
      storeCode: row.referrer_store_code || null,
      distributorCode: row.referrer_distributor_code || null
    },
    friend: {
      userId: Number(row.friend_user_id),
      username: row.friend_username || '',
      ...(canViewPlayerEmail(role) ? { email: row.friend_email || '' } : {}),
      storeCode: row.friend_store_code || null,
      distributorCode: row.friend_distributor_code || null
    },
    friendBonus,
    inviterBonus,
    rewardStatus: row.reward_status || null,
    payoutAt: row.reward_payout_at || null,
    playthroughAt: row.reward_playthrough_at || null,
    classicRewardTotal: row.classic_reward_total != null ? Number(row.classic_reward_total) : 0,
    classicRewardCount: Number(row.classic_reward_count) || 0
  };
}

/**
 * One row per referral pair (friend invited by someone).
 */
async function listReferralTransactions(req, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  const simpleRaw = (query.simpleFilter || query.status || '').toString().trim().toLowerCase();
  const simpleFilter = simpleRaw && VALID_SIMPLE_FILTERS.has(simpleRaw) ? simpleRaw : null;

  const replacements = {
    friendSignupType: FRIEND_SIGNUP_TX_TYPE
  };

  const scope = buildScopeClauses(req, query, replacements, 'ru', 'fu');
  const search = buildSearchClauses(query.search, replacements, 'ru', 'fu', req.role);
  const dateParts = buildDateTimeRangeFilterParts(query, replacements, 'fu.created_at', 'joined');

  const where = [
    'fu.user_referred_by IS NOT NULL',
    ...scope,
    ...search,
    ...dateParts
  ];

  // Classic affiliate: % of friend deposits (not Give/Get fixed reward).
  const classicJoin = `
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(ut.amount), 0)::numeric AS classic_reward_total,
        COUNT(*)::int AS classic_reward_count,
        MAX(ut.created_at) AS classic_reward_last_at
      FROM user_transactions ut
      WHERE ut.user_id = ru.user_id
        AND ut.type = 'affiliate'
        AND (
          ut.metadata->>'referred_user_id' = fu.user_id::text
          OR (ut.metadata->>'referred_user_id')::int = fu.user_id
        )
        AND COALESCE(ut.metadata->>'program', '') <> 'give_get'
    ) ca ON TRUE
  `;

  if (simpleFilter === 'friend_waiting') {
    where.push('fs.id IS NULL');
  } else if (simpleFilter === 'inviter_waiting') {
    where.push(`(
      (rr.status IS NULL OR rr.status IN ('${REWARD_STATUS.AWAITING_PLAYTHROUGH}', '${REWARD_STATUS.SCHEDULED}'))
      AND COALESCE(ca.classic_reward_count, 0) = 0
    )`);
  } else if (simpleFilter === 'both_received') {
    where.push('fs.id IS NOT NULL');
    where.push(`rr.status = '${REWARD_STATUS.PAID}'`);
  } else if (simpleFilter === 'inviter_blocked') {
    where.push(`rr.status = '${REWARD_STATUS.CAPPED}'`);
  } else if (simpleFilter === 'classic_10pct') {
    where.push('fs.id IS NULL');
    where.push('rr.id IS NULL');
    where.push(`(
      COALESCE(ca.classic_reward_count, 0) > 0
      OR fu.created_at < TIMESTAMPTZ '2026-07-17 00:00:00+00'
    )`);
  }

  const baseFrom = `
    FROM users fu
    INNER JOIN users ru ON ru.user_id = fu.user_referred_by
    LEFT JOIN LATERAL (
      SELECT ut.id, ut.amount, ut.created_at
      FROM user_transactions ut
      WHERE ut.user_id = fu.user_id
        AND ut.type = :friendSignupType
      ORDER BY ut.created_at DESC
      LIMIT 1
    ) fs ON TRUE
    LEFT JOIN LATERAL (
      SELECT ut.id, ut.amount, ut.created_at
      FROM user_transactions ut
      WHERE ut.user_id = fu.user_id
        AND ut.type = 'welcome_signup'
      ORDER BY ut.created_at DESC
      LIMIT 1
    ) ws ON TRUE
    LEFT JOIN LATERAL (
      SELECT r.id, r.amount, r.status, r.payout_at, r.playthrough_at, r.credited_at, r.created_at
      FROM referral_deposit_rewards r
      WHERE r.referrer_user_id = ru.user_id
        AND r.referred_user_id = fu.user_id
      ORDER BY r.created_at DESC
      LIMIT 1
    ) rr ON TRUE
    ${classicJoin}
    WHERE ${where.join(' AND ')}
  `;

  const countRows = await db.sequelize.query(
    `SELECT COUNT(*)::int AS total ${baseFrom}`,
    { replacements, type: QueryTypes.SELECT }
  );
  const total = Number(countRows?.[0]?.total) || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  replacements.limit = limit;
  replacements.offset = offset;

  const rows = await db.sequelize.query(
    `
    SELECT
      fu.user_id AS friend_user_id,
      fu.username AS friend_username,
      fu.email AS friend_email,
      fu.store_code AS friend_store_code,
      fu.distributor_code AS friend_distributor_code,
      fu.role AS friend_role,
      fu.is_admin AS friend_is_admin,
      fu.created_at AS friend_joined_at,
      ru.user_id AS referrer_user_id,
      ru.username AS referrer_username,
      ru.email AS referrer_email,
      ru.store_code AS referrer_store_code,
      ru.distributor_code AS referrer_distributor_code,
      fs.amount AS friend_bonus_amount,
      fs.created_at AS friend_bonus_at,
      ws.amount AS welcome_bonus_amount,
      ws.created_at AS welcome_bonus_at,
      rr.amount AS reward_amount,
      rr.status AS reward_status,
      rr.payout_at AS reward_payout_at,
      rr.playthrough_at AS reward_playthrough_at,
      rr.credited_at AS reward_credited_at,
      ca.classic_reward_total,
      ca.classic_reward_count,
      ca.classic_reward_last_at
    ${baseFrom}
    ORDER BY fu.created_at DESC, fu.user_id DESC
    LIMIT :limit OFFSET :offset
    `,
    { replacements, type: QueryTypes.SELECT }
  );

  const settingsByStore = new Map();
  const storeCodesNeedingSettings = [
    ...new Set(
      (rows || [])
        .filter((r) => !(Number(r.friend_bonus_amount) > 0) && !isClassicProgramRow(r))
        .map((r) => (r.friend_store_code || r.referrer_store_code || '').toString().trim())
        .filter(Boolean)
    )
  ];
  await Promise.all(
    storeCodesNeedingSettings.map(async (code) => {
      try {
        const settings = await getEffectiveSettingsForStoreCode(code);
        settingsByStore.set(code.toLowerCase(), settings || null);
      } catch (_) {
        settingsByStore.set(code.toLowerCase(), null);
      }
    })
  );

  return {
    list: (rows || []).map((row) => serializePair(row, settingsByStore, req.role)),
    total,
    page,
    limit,
    totalPages
  };
}

module.exports = {
  listReferralTransactions
};
