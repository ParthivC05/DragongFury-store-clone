'use strict';

const db = require('../../db/models');
const { QueryTypes } = require('sequelize');
const { ROLES } = require('../../constants/roles');

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function emptyBucket(extra = {}) {
  return {
    depositedSc: 0,
    withdrawnSc: 0,
    stillInGameSc: 0,
    depositUsers: 0,
    withdrawUsers: 0,
    ...extra
  };
}

function finalizeBucket(bucket) {
  bucket.depositedSc = round2(bucket.depositedSc);
  bucket.withdrawnSc = round2(bucket.withdrawnSc);
  bucket.stillInGameSc = round2(
    bucket.stillInGameSc != null
      ? bucket.stillInGameSc
      : num(bucket.depositedSc) - num(bucket.withdrawnSc)
  );
  bucket.depositUsers = Math.max(0, Math.round(num(bucket.depositUsers)));
  bucket.withdrawUsers = Math.max(0, Math.round(num(bucket.withdrawUsers)));
  return bucket;
}

function applyRow(bucket, row) {
  bucket.depositedSc += num(row.deposited_sc);
  bucket.withdrawnSc += num(row.withdrawn_sc);
  bucket.depositUsers += num(row.deposit_users);
  bucket.withdrawUsers += num(row.withdraw_users);
  if (row.still_in_game_sc != null) {
    bucket.stillInGameSc = num(bucket.stillInGameSc) + num(row.still_in_game_sc);
  }
}

function storeJoinSql(storeCode, replacements, userAlias = 'u') {
  const sc = storeCode && String(storeCode).trim();
  if (!sc) return '';
  replacements.filterStoreCode = sc;
  return `AND ${userAlias}.store_code = :filterStoreCode`;
}

/** Collapse Game Vault / GameVault, OrionStars Agent/Bot, etc. into one family. */
const PLATFORM_GAME_KEY_SQL = `
  regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(trim(coalesce(nullif(trim(g.name), ''), 'Unknown'))),
        '[_[:space:]-]+(agent|bot)$',
        '',
        'g'
      ),
      '[^a-z0-9]+',
      '',
      'g'
    ),
    '(agent|bot)$',
    ''
  )
`;

const PLATFORM_GAME_LABELS = {
  gamevault: 'Game Vault',
  gamevault2: 'Game Vault 2',
  orionstars: 'Orion Stars',
  firekirin: 'Fire Kirin',
  goldendragon: 'Golden Dragon',
  ultrapanda: 'Ultra Panda',
  vblink: 'VBlink',
  cashmachine777: 'Cash Machine 777',
  egame99: 'EGame99',
  juwa: 'Juwa',
  juwa20: 'Juwa 2.0',
  juwa2: 'Juwa 2.0',
  milkyway: 'Milky Way',
  pandamaster: 'Panda Master',
  pandamaster2: 'Panda Master',
  riversweeps: 'River Sweeps'
};

function platformGameLabel(key, fallback) {
  const normalized = String(key || '').trim().toLowerCase();
  if (PLATFORM_GAME_LABELS[normalized]) return PLATFORM_GAME_LABELS[normalized];
  const pretty = String(fallback || key || 'Unknown').trim();
  return pretty || 'Unknown';
}

async function queryPurchase({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  const rows = await db.sequelize.query(
    `
    SELECT
      COALESCE(SUM(
        COALESCE(
          NULLIF(ut.metadata->>'pay_amount', '')::numeric,
          NULLIF(ut.metadata->>'payAmount', '')::numeric,
          ut.amount
        )
      ), 0)::float AS paid_amount,
      COALESCE(SUM(
        COALESCE(
          NULLIF(ut.metadata->>'credit_sc', '')::numeric,
          NULLIF(ut.metadata->>'creditAmount', '')::numeric,
          ut.amount
        )
      ), 0)::float AS sc_given,
      COUNT(DISTINCT ut.user_id)::int AS users
    FROM user_transactions ut
    INNER JOIN users u ON u.user_id = ut.user_id
    WHERE ut.type = 'deposit'
      AND u.role = :userRole
      AND ut.created_at >= :from
      AND ut.created_at <= :to
      ${storeSql}
    `,
    { replacements, type: QueryTypes.SELECT }
  );
  const row = rows && rows[0] ? rows[0] : {};
  const paidAmount = round2(row.paid_amount);
  const scGiven = round2(row.sc_given);
  return {
    paidAmount,
    scGiven,
    extraSc: round2(scGiven - paidAmount),
    uniqueUsers: Math.max(0, Math.round(num(row.users)))
  };
}

async function queryWalletSnapshot({ storeCode }) {
  const replacements = { userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  const rows = await db.sequelize.query(
    `
    SELECT COALESCE(SUM(w.balance), 0)::float AS still_in_wallet
    FROM wallets w
    INNER JOIN users u ON u.user_id = w.user_id
    WHERE u.role = :userRole
      AND UPPER(COALESCE(w.currency_code, '')) IN ('PSC', 'BSC', 'RSC', 'SC')
      ${storeSql}
    `,
    { replacements, type: QueryTypes.SELECT }
  );
  return round2(rows && rows[0] ? rows[0].still_in_wallet : 0);
}

async function queryOneGameHub({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  const rows = await db.sequelize.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN LOWER(ogh.operation) = 'bet' THEN ogh.amount ELSE 0 END), 0)::float AS deposited_sc,
      COALESCE(SUM(CASE WHEN LOWER(ogh.operation) = 'win' THEN ogh.amount ELSE 0 END), 0)::float AS withdrawn_sc,
      COUNT(DISTINCT CASE WHEN LOWER(ogh.operation) = 'bet' THEN ogh.user_id END)::int AS deposit_users,
      COUNT(DISTINCT CASE WHEN LOWER(ogh.operation) = 'win' THEN ogh.user_id END)::int AS withdraw_users
    FROM one_game_hub_transactions ogh
    INNER JOIN users u ON u.user_id = ogh.user_id
    WHERE u.role = :userRole
      AND LOWER(COALESCE(ogh.status, '')) = 'completed'
      AND LOWER(ogh.operation) IN ('bet', 'win')
      AND ogh.created_at >= :from
      AND ogh.created_at <= :to
      ${storeSql}
    `,
    { replacements, type: QueryTypes.SELECT }
  );
  return rows && rows[0] ? rows[0] : {};
}

async function queryScorpio({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  const rows = await db.sequelize.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN LOWER(st.command) = 'bet' THEN st.amount ELSE 0 END), 0)::float AS deposited_sc,
      COALESCE(SUM(CASE WHEN LOWER(st.command) = 'win' THEN st.amount ELSE 0 END), 0)::float AS withdrawn_sc,
      COUNT(DISTINCT CASE WHEN LOWER(st.command) = 'bet' THEN st.user_id END)::int AS deposit_users,
      COUNT(DISTINCT CASE WHEN LOWER(st.command) = 'win' THEN st.user_id END)::int AS withdraw_users
    FROM scorpio_transactions st
    INNER JOIN users u ON u.user_id = st.user_id
    WHERE u.role = :userRole
      AND LOWER(COALESCE(st.status, '')) = 'completed'
      AND LOWER(st.command) IN ('bet', 'win')
      AND st.created_at >= :from
      AND st.created_at <= :to
      ${storeSql}
    `,
    { replacements, type: QueryTypes.SELECT }
  );
  return rows && rows[0] ? rows[0] : {};
}

async function queryWin568({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  const rows = await db.sequelize.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(wb.status, '')) <> 'void' THEN wb.stake ELSE 0 END), 0)::float AS deposited_sc,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(wb.status, '')) = 'settled' THEN GREATEST(COALESCE(wb.winloss, 0), 0) ELSE 0 END), 0)::float AS withdrawn_sc,
      COUNT(DISTINCT CASE WHEN LOWER(COALESCE(wb.status, '')) <> 'void' THEN wb.user_id END)::int AS deposit_users,
      COUNT(DISTINCT CASE WHEN LOWER(COALESCE(wb.status, '')) = 'settled' AND COALESCE(wb.winloss, 0) > 0 THEN wb.user_id END)::int AS withdraw_users
    FROM win568_bets wb
    INNER JOIN users u ON u.user_id = wb.user_id
    WHERE u.role = :userRole
      AND wb.created_at >= :from
      AND wb.created_at <= :to
      ${storeSql}
    `,
    { replacements, type: QueryTypes.SELECT }
  );
  return rows && rows[0] ? rows[0] : {};
}

async function queryGitslotparkByProvider({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  return db.sequelize.query(
    `
    SELECT
      CASE
        WHEN LOWER(COALESCE(gt.provider, '')) IN ('win568', '568win') THEN 'win568'
        WHEN LOWER(COALESCE(gt.provider, '')) = 'bona' THEN 'bona'
        ELSE 'gitslotpark'
      END AS group_key,
      COALESCE(SUM(CASE
        WHEN LOWER(gt.operation) = 'withdraw' THEN gt.amount
        WHEN LOWER(gt.operation) = 'betwin' THEN COALESCE(gt.bet_amount, 0)
        ELSE 0
      END), 0)::float AS deposited_sc,
      COALESCE(SUM(CASE
        WHEN LOWER(gt.operation) = 'deposit' THEN gt.amount
        WHEN LOWER(gt.operation) = 'betwin' THEN COALESCE(gt.win_amount, 0)
        ELSE 0
      END), 0)::float AS withdrawn_sc,
      COUNT(DISTINCT CASE
        WHEN LOWER(gt.operation) IN ('withdraw', 'betwin') THEN gt.user_id
      END)::int AS deposit_users,
      COUNT(DISTINCT CASE
        WHEN LOWER(gt.operation) IN ('deposit', 'betwin') THEN gt.user_id
      END)::int AS withdraw_users
    FROM gitslotpark_transactions gt
    INNER JOIN users u ON u.user_id = gt.user_id
    WHERE u.role = :userRole
      AND LOWER(COALESCE(gt.status, '')) = 'completed'
      AND LOWER(gt.operation) IN ('withdraw', 'deposit', 'betwin')
      AND LOWER(COALESCE(gt.provider, '')) NOT IN ('win568', '568win')
      AND gt.created_at >= :from
      AND gt.created_at <= :to
      ${storeSql}
    GROUP BY 1
    `,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function queryPlatformUniqueUsers({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  const rows = await db.sequelize.query(
    `
    SELECT
      COUNT(DISTINCT CASE WHEN LOWER(ga.activity_type) = 'topup' THEN ga.user_id END)::int AS deposit_users,
      COUNT(DISTINCT CASE WHEN LOWER(ga.activity_type) IN ('redeem', 'withdraw') THEN ga.user_id END)::int AS withdraw_users
    FROM game_activities ga
    INNER JOIN users u ON u.user_id = ga.user_id
    WHERE u.role = :userRole
      AND LOWER(ga.activity_type) IN ('topup', 'redeem', 'withdraw')
      AND ga.created_at >= :from
      AND ga.created_at <= :to
      ${storeSql}
    `,
    { replacements, type: QueryTypes.SELECT }
  );
  const row = rows && rows[0] ? rows[0] : {};
  return {
    depositUsers: Math.max(0, Math.round(num(row.deposit_users))),
    withdrawUsers: Math.max(0, Math.round(num(row.withdraw_users)))
  };
}

async function queryPlatformGames({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  return db.sequelize.query(
    `
    SELECT
      (${PLATFORM_GAME_KEY_SQL}) AS game_key,
      (
        ARRAY_AGG(
          COALESCE(NULLIF(TRIM(g.name), ''), 'Unknown')
          ORDER BY
            CASE WHEN LOWER(TRIM(g.name)) ~ '(agent|bot)' THEN 1 ELSE 0 END,
            LENGTH(TRIM(g.name)),
            TRIM(g.name)
        )
      )[1] AS game_name,
      COALESCE(SUM(CASE WHEN LOWER(ga.activity_type) = 'topup' THEN ga.amount ELSE 0 END), 0)::float AS deposited_sc,
      COALESCE(SUM(CASE WHEN LOWER(ga.activity_type) IN ('redeem', 'withdraw') THEN ga.amount ELSE 0 END), 0)::float AS withdrawn_sc,
      COUNT(DISTINCT CASE WHEN LOWER(ga.activity_type) = 'topup' THEN ga.user_id END)::int AS deposit_users,
      COUNT(DISTINCT CASE WHEN LOWER(ga.activity_type) IN ('redeem', 'withdraw') THEN ga.user_id END)::int AS withdraw_users
    FROM game_activities ga
    INNER JOIN users u ON u.user_id = ga.user_id
    LEFT JOIN games g ON g.id = ga.game_id
    WHERE u.role = :userRole
      AND LOWER(ga.activity_type) IN ('topup', 'redeem', 'withdraw')
      AND ga.created_at >= :from
      AND ga.created_at <= :to
      ${storeSql}
    GROUP BY (${PLATFORM_GAME_KEY_SQL})
    HAVING
      COALESCE(SUM(CASE WHEN LOWER(ga.activity_type) = 'topup' THEN ga.amount ELSE 0 END), 0) <> 0
      OR COALESCE(SUM(CASE WHEN LOWER(ga.activity_type) IN ('redeem', 'withdraw') THEN ga.amount ELSE 0 END), 0) <> 0
    ORDER BY (${PLATFORM_GAME_KEY_SQL}) ASC
    `,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function queryPlatformStillInGame({ storeCode }) {
  const replacements = { userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  return db.sequelize.query(
    `
    SELECT
      (${PLATFORM_GAME_KEY_SQL}) AS game_key,
      (
        COALESCE(SUM(CASE WHEN LOWER(ga.activity_type) = 'topup' THEN ga.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN LOWER(ga.activity_type) IN ('redeem', 'withdraw') THEN ga.amount ELSE 0 END), 0)
      )::float AS still_in_game_sc
    FROM game_activities ga
    INNER JOIN users u ON u.user_id = ga.user_id
    LEFT JOIN games g ON g.id = ga.game_id
    WHERE u.role = :userRole
      AND LOWER(ga.activity_type) IN ('topup', 'redeem', 'withdraw')
      ${storeSql}
    GROUP BY (${PLATFORM_GAME_KEY_SQL})
    `,
    { replacements, type: QueryTypes.SELECT }
  );
}

async function queryUniqueUsers({ from, to, storeCode }) {
  const replacements = { from, to, userRole: ROLES.USER };
  const storeSql = storeJoinSql(storeCode, replacements);
  const rows = await db.sequelize.query(
    `
    SELECT
      COUNT(DISTINCT CASE WHEN flow.kind = 'deposit' THEN flow.user_id END)::int AS deposit_users,
      COUNT(DISTINCT CASE WHEN flow.kind = 'withdraw' THEN flow.user_id END)::int AS withdraw_users
    FROM (
      SELECT ogh.user_id, 'deposit'::text AS kind
      FROM one_game_hub_transactions ogh
      INNER JOIN users u ON u.user_id = ogh.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(ogh.status, '')) = 'completed'
        AND LOWER(ogh.operation) = 'bet'
        AND ogh.created_at >= :from
        AND ogh.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT ogh.user_id, 'withdraw'
      FROM one_game_hub_transactions ogh
      INNER JOIN users u ON u.user_id = ogh.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(ogh.status, '')) = 'completed'
        AND LOWER(ogh.operation) = 'win'
        AND ogh.created_at >= :from
        AND ogh.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT wb.user_id, 'deposit'
      FROM win568_bets wb
      INNER JOIN users u ON u.user_id = wb.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(wb.status, '')) <> 'void'
        AND wb.created_at >= :from
        AND wb.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT wb.user_id, 'withdraw'
      FROM win568_bets wb
      INNER JOIN users u ON u.user_id = wb.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(wb.status, '')) = 'settled'
        AND COALESCE(wb.winloss, 0) > 0
        AND wb.created_at >= :from
        AND wb.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT gt.user_id, 'deposit'
      FROM gitslotpark_transactions gt
      INNER JOIN users u ON u.user_id = gt.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(gt.status, '')) = 'completed'
        AND LOWER(gt.operation) IN ('withdraw', 'betwin')
        AND gt.created_at >= :from
        AND gt.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT gt.user_id, 'withdraw'
      FROM gitslotpark_transactions gt
      INNER JOIN users u ON u.user_id = gt.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(gt.status, '')) = 'completed'
        AND LOWER(gt.operation) IN ('deposit', 'betwin')
        AND gt.created_at >= :from
        AND gt.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT st.user_id, 'deposit'
      FROM scorpio_transactions st
      INNER JOIN users u ON u.user_id = st.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(st.status, '')) = 'completed'
        AND LOWER(st.command) = 'bet'
        AND st.created_at >= :from
        AND st.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT st.user_id, 'withdraw'
      FROM scorpio_transactions st
      INNER JOIN users u ON u.user_id = st.user_id
      WHERE u.role = :userRole
        AND LOWER(COALESCE(st.status, '')) = 'completed'
        AND LOWER(st.command) = 'win'
        AND st.created_at >= :from
        AND st.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT ga.user_id, 'deposit'
      FROM game_activities ga
      INNER JOIN users u ON u.user_id = ga.user_id
      WHERE u.role = :userRole
        AND LOWER(ga.activity_type) = 'topup'
        AND ga.created_at >= :from
        AND ga.created_at <= :to
        ${storeSql}

      UNION ALL

      SELECT ga.user_id, 'withdraw'
      FROM game_activities ga
      INNER JOIN users u ON u.user_id = ga.user_id
      WHERE u.role = :userRole
        AND LOWER(ga.activity_type) IN ('redeem', 'withdraw')
        AND ga.created_at >= :from
        AND ga.created_at <= :to
        ${storeSql}
    ) flow
    `,
    { replacements, type: QueryTypes.SELECT }
  );
  const row = rows && rows[0] ? rows[0] : {};
  return {
    depositUsers: Math.max(0, Math.round(num(row.deposit_users))),
    withdrawUsers: Math.max(0, Math.round(num(row.withdraw_users)))
  };
}

async function safeQuery(fallback, fn) {
  try {
    return await fn();
  } catch (_) {
    return fallback;
  }
}

/**
 * Purchase vs SC given, plus SC deposited / won / still in games by family.
 * Slots (1GameHub, Bona, GitSlotPark, Scorpio Play) are seamless: deposited = bets, withdrawn = wins.
 * Platform games (VBlink, Golden Dragon, FireKirin, …) use wallet topup / redeem.
 */
async function getPaymentReportGameFlow({ from, to, storeCode }) {
  const emptyPurchase = { paidAmount: 0, scGiven: 0, extraSc: 0, uniqueUsers: 0 };
  const emptyTotals = emptyBucket({ stillInWalletSc: 0 });

  if (!from || !to) {
    return {
      purchase: emptyPurchase,
      totals: emptyTotals,
      groups: []
    };
  }

  const [
    purchase,
    stillInWalletSc,
    oghRow,
    scorpioRow,
    win568Row,
    gspRows,
    platformRows,
    platformStillRows,
    platformUnique,
    uniqueUsers
  ] = await Promise.all([
    safeQuery(emptyPurchase, () => queryPurchase({ from, to, storeCode })),
    safeQuery(0, () => queryWalletSnapshot({ storeCode })),
    safeQuery({}, () => queryOneGameHub({ from, to, storeCode })),
    safeQuery({}, () => queryScorpio({ from, to, storeCode })),
    safeQuery({}, () => queryWin568({ from, to, storeCode })),
    safeQuery([], () => queryGitslotparkByProvider({ from, to, storeCode })),
    safeQuery([], () => queryPlatformGames({ from, to, storeCode })),
    safeQuery([], () => queryPlatformStillInGame({ storeCode })),
    safeQuery({ depositUsers: 0, withdrawUsers: 0 }, () => queryPlatformUniqueUsers({ from, to, storeCode })),
    safeQuery({ depositUsers: 0, withdrawUsers: 0 }, () => queryUniqueUsers({ from, to, storeCode }))
  ]);

  const stillByGameKey = new Map();
  let platformStillTotal = 0;
  for (const row of platformStillRows || []) {
    const still = num(row.still_in_game_sc);
    const key = String(row.game_key || 'unknown');
    stillByGameKey.set(key, still);
    platformStillTotal += still;
  }

  const onegamehub = emptyBucket({
    key: 'onegamehub',
    label: '1GameHub',
    kind: 'slots'
  });
  applyRow(onegamehub, oghRow);
  onegamehub.stillInGameSc = round2(onegamehub.depositedSc - onegamehub.withdrawnSc);

  const scorpio = emptyBucket({
    key: 'scorpio',
    label: 'Scorpio Play',
    kind: 'slots'
  });
  applyRow(scorpio, scorpioRow);
  scorpio.stillInGameSc = round2(scorpio.depositedSc - scorpio.withdrawnSc);

  const bona = emptyBucket({ key: 'bona', label: 'Bona Games', kind: 'slots' });
  const win568 = emptyBucket({ key: 'win568', label: 'Win568', kind: 'slots' });
  const gitslotpark = emptyBucket({ key: 'gitslotpark', label: 'GitSlotPark', kind: 'slots' });
  applyRow(win568, win568Row);
  for (const row of gspRows || []) {
    if (row.group_key === 'bona') applyRow(bona, row);
    else if (row.group_key === 'win568') applyRow(win568, row);
    else applyRow(gitslotpark, row);
  }
  bona.stillInGameSc = round2(bona.depositedSc - bona.withdrawnSc);
  win568.stillInGameSc = round2(win568.depositedSc - win568.withdrawnSc);
  gitslotpark.stillInGameSc = round2(gitslotpark.depositedSc - gitslotpark.withdrawnSc);

  const platform = emptyBucket({
    key: 'platform',
    label: 'Platform games',
    kind: 'platform',
    games: []
  });
  for (const row of platformRows || []) {
    const gameKey = String(row.game_key || row.game_name || 'unknown').toLowerCase();
    const game = emptyBucket({
      key: `game-${gameKey || 'unknown'}`,
      label: platformGameLabel(gameKey, row.game_name),
      kind: 'platform'
    });
    applyRow(game, row);
    game.stillInGameSc = stillByGameKey.has(gameKey)
      ? round2(stillByGameKey.get(gameKey))
      : round2(game.depositedSc - game.withdrawnSc);
    finalizeBucket(game);
    platform.depositedSc += game.depositedSc;
    platform.withdrawnSc += game.withdrawnSc;
    platform.games.push(game);
  }
  platform.games.sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
  platform.stillInGameSc = platformStillTotal;
  platform.depositUsers = platformUnique.depositUsers;
  platform.withdrawUsers = platformUnique.withdrawUsers;

  const groups = [onegamehub, bona, gitslotpark, scorpio, win568, platform].map((group) => {
    finalizeBucket(group);
    return group;
  });

  const totals = emptyBucket({
    stillInWalletSc,
    depositUsers: uniqueUsers.depositUsers,
    withdrawUsers: uniqueUsers.withdrawUsers
  });
  for (const group of groups) {
    totals.depositedSc += group.depositedSc;
    totals.withdrawnSc += group.withdrawnSc;
    totals.stillInGameSc += group.stillInGameSc;
  }
  finalizeBucket(totals);

  return {
    purchase,
    totals,
    groups
  };
}

module.exports = {
  getPaymentReportGameFlow
};
