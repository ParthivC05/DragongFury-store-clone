'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { ROLES } = require('../../constants/roles');
const { EVENT_TYPES, WALLET_TYPES } = require('../../constants/walletScLedger');
const { activitySourceSql, getLedgerLiveStart } = require('./walletScActivitySource.sql');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function emptyWalletBlock() {
  return {
    opening: 0,
    credits: 0,
    debits: 0,
    closing: 0,
    difference: 0,
    liveBalance: 0,
    ledgerBalance: 0
  };
}

function resolveDateRange(startDate, endDate, timezoneOffset) {
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = startDate && String(startDate).trim() ? String(startDate).trim() : today;
  const rangeEnd = endDate && String(endDate).trim() ? String(endDate).trim() : today;
  return {
    rangeStart,
    rangeEnd,
    from: toDateRangeStart(rangeStart, timezoneOffset),
    to: toDateRangeEnd(rangeEnd, timezoneOffset)
  };
}

function parsePageLimit(page, limit) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  let l = parseInt(limit, 10) || DEFAULT_LIMIT;
  if (!Number.isFinite(l) || l < 1) l = DEFAULT_LIMIT;
  if (l > MAX_LIMIT) l = MAX_LIMIT;
  return { page: p, limit: l, offset: (p - 1) * l };
}

function scopeSql({ storeCode, userId, username }, alias = 'u') {
  const bind = { userRole: ROLES.USER };
  const parts = [`${alias}.role = :userRole`];
  if (storeCode) {
    bind.storeCode = String(storeCode).trim();
    parts.push(`${alias}.store_code = :storeCode`);
  }
  if (userId) {
    bind.filterUserId = parseInt(userId, 10);
    parts.push(`${alias}.user_id = :filterUserId`);
  }
  if (username) {
    bind.username = `%${String(username).trim().toLowerCase()}%`;
    parts.push(`LOWER(COALESCE(${alias}.username, '')) LIKE :username`);
  }
  return { sql: parts.join(' AND '), bind };
}

function sumEvents(rows, walletType, eventTypes, direction) {
  const set = new Set(eventTypes);
  return round2(
    rows
      .filter((r) => r.wallet_type === walletType && r.direction === direction && set.has(r.event_type))
      .reduce((s, r) => s + num(r.total), 0)
  );
}

function sumProducts(rows, walletType, productId, direction, extraFilter) {
  return round2(
    rows
      .filter((r) => {
        if (r.wallet_type !== walletType || r.direction !== direction) return false;
        if (productId && r.product_id !== productId) return false;
        if (typeof extraFilter === 'function' && !extraFilter(r)) return false;
        return true;
      })
      .reduce((s, r) => s + num(r.total), 0)
  );
}

async function queryActivityBundle({ from, to, activityTo, bind, userSql, ledgerStart }) {
  const rows = await db.sequelize.query(
    `
    SELECT
      l.wallet_type,
      l.direction,
      l.event_type,
      COALESCE(l.product_id, '') AS product_id,
      COALESCE(l.bonus_type, '') AS bonus_type,
      COALESCE(SUM(CASE WHEN l.created_at <= :to THEN l.amount ELSE 0 END), 0)::float AS total,
      COALESCE(SUM(CASE WHEN l.created_at <= :to THEN l.gross_amount ELSE 0 END), 0)::float AS gross_total,
      COALESCE(SUM(CASE WHEN l.created_at <= :to THEN l.eligible_amount ELSE 0 END), 0)::float AS eligible_total,
      COALESCE(SUM(CASE WHEN l.created_at <= :to THEN l.voided_amount ELSE 0 END), 0)::float AS voided_total,
      COALESCE(SUM(CASE WHEN l.created_at <= :to THEN 1 ELSE 0 END), 0)::int AS entry_count,
      COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END), 0)::float AS net_since_from
    FROM ${activitySourceSql()} l
    JOIN users u ON u.user_id = l.user_id
    WHERE ${userSql}
      AND l.created_at >= :from
      AND l.created_at <= :activityTo
    GROUP BY 1, 2, 3, 4, 5
    `,
    { replacements: { ...bind, from, to, activityTo, ledgerStart }, type: QueryTypes.SELECT }
  );
  const netMap = {};
  for (const r of rows) {
    netMap[r.wallet_type] = round2((netMap[r.wallet_type] || 0) + num(r.net_since_from));
  }
  return {
    eventRows: rows.filter((r) => Math.abs(num(r.total)) > 0.0001 || num(r.entry_count) > 0),
    netMap
  };
}

async function queryLiveVsLedger({ bind, userSql }) {
  return db.sequelize.query(
    `
    SELECT
      w.currency_code,
      COALESCE(SUM(w.balance), 0)::float AS live_balance,
      COALESCE((
        SELECT SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END)
        FROM wallet_sc_ledger l
        JOIN users u2 ON u2.user_id = l.user_id
        WHERE ${userSql.replace(/\bu\./g, 'u2.')}
          AND l.wallet_type = CASE UPPER(TRIM(w.currency_code))
            WHEN 'BSC' THEN 'BONUS'
            WHEN 'RSC' THEN 'RSC'
            ELSE 'PSC'
          END
      ), 0)::float AS ledger_balance
    FROM wallets w
    JOIN users u ON u.user_id = w.user_id
    WHERE ${userSql}
      AND UPPER(TRIM(w.currency_code)) IN ('PSC', 'BSC', 'RSC', 'SC')
    GROUP BY w.currency_code
    `,
    { replacements: bind, type: QueryTypes.SELECT }
  );
}

async function queryAlerts({ from, to, bind, userSql }) {
  const [purchaseNoPayment, bonusNoType, rscNoOrigin, manualNoReason, negatives, duplicates] = await Promise.all([
    db.sequelize.query(
      `
      SELECT COUNT(*)::int AS c FROM wallet_sc_ledger l
      JOIN users u ON u.user_id = l.user_id
      WHERE ${userSql}
        AND l.created_at >= :from AND l.created_at <= :to
        AND l.wallet_type = 'PSC' AND l.direction = 'CREDIT' AND l.event_type = 'PURCHASE'
        AND (l.payment_id IS NULL OR TRIM(l.payment_id) = '')
      `,
      { replacements: { ...bind, from, to }, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `
      SELECT COUNT(*)::int AS c FROM wallet_sc_ledger l
      JOIN users u ON u.user_id = l.user_id
      WHERE ${userSql}
        AND l.created_at >= :from AND l.created_at <= :to
        AND l.wallet_type = 'BONUS' AND l.direction = 'CREDIT'
        AND l.event_type <> 'OPENING_SNAPSHOT'
        AND (l.bonus_type IS NULL OR TRIM(l.bonus_type) = '')
      `,
      { replacements: { ...bind, from, to }, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `
      SELECT COUNT(*)::int AS c FROM wallet_sc_ledger l
      JOIN users u ON u.user_id = l.user_id
      WHERE ${userSql}
        AND l.created_at >= :from AND l.created_at <= :to
        AND l.wallet_type = 'RSC' AND l.direction = 'CREDIT'
        AND l.event_type LIKE 'WIN_%'
        AND (l.product_id IS NULL OR TRIM(l.product_id) = '')
      `,
      { replacements: { ...bind, from, to }, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `
      SELECT COUNT(*)::int AS c FROM wallet_sc_ledger l
      JOIN users u ON u.user_id = l.user_id
      WHERE ${userSql}
        AND l.created_at >= :from AND l.created_at <= :to
        AND l.event_type IN ('MANUAL_CREDIT', 'MANUAL_DEBIT', 'MANUAL_BONUS', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT')
        AND (l.remarks IS NULL OR TRIM(l.remarks) = '')
      `,
      { replacements: { ...bind, from, to }, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `
      SELECT COUNT(*)::int AS c FROM wallets w
      JOIN users u ON u.user_id = w.user_id
      WHERE ${userSql}
        AND w.balance < -0.009
        AND UPPER(TRIM(w.currency_code)) IN ('PSC', 'BSC', 'RSC', 'SC')
      `,
      { replacements: bind, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `
      SELECT COUNT(*)::int AS c FROM (
        SELECT l.source_type, l.source_id, l.wallet_type, l.direction, l.event_type
        FROM wallet_sc_ledger l
        JOIN users u ON u.user_id = l.user_id
        WHERE ${userSql}
          AND l.created_at >= :from AND l.created_at <= :to
          AND l.source_id IS NOT NULL AND TRIM(l.source_id) <> ''
        GROUP BY 1, 2, 3, 4, 5
        HAVING COUNT(*) > 1
      ) d
      `,
      { replacements: { ...bind, from, to }, type: QueryTypes.SELECT }
    )
  ]);

  return {
    purchaseWithoutPayment: num(purchaseNoPayment[0]?.c),
    bonusWithoutType: num(bonusNoType[0]?.c),
    rscWithoutOrigin: num(rscNoOrigin[0]?.c),
    manualWithoutReason: num(manualNoReason[0]?.c),
    negativeBalances: num(negatives[0]?.c),
    duplicateGroups: num(duplicates[0]?.c)
  };
}

async function queryCarryForwardCheck({ from, bind, userSql }) {
  const prevEnd = new Date(from.getTime() - 1);
  const [yesterdayClose, todayOpen] = await Promise.all([
    db.sequelize.query(
      `
      SELECT l.wallet_type,
        COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END), 0)::float AS total
      FROM wallet_sc_ledger l
      JOIN users u ON u.user_id = l.user_id
      WHERE ${userSql} AND l.created_at <= :prevEnd
      GROUP BY l.wallet_type
      `,
      { replacements: { ...bind, prevEnd }, type: QueryTypes.SELECT }
    ),
    db.sequelize.query(
      `
      SELECT l.wallet_type,
        COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END), 0)::float AS total
      FROM wallet_sc_ledger l
      JOIN users u ON u.user_id = l.user_id
      WHERE ${userSql} AND l.created_at < :from
      GROUP BY l.wallet_type
      `,
      { replacements: { ...bind, from }, type: QueryTypes.SELECT }
    )
  ]);
  const map = (rows) => Object.fromEntries(rows.map((r) => [r.wallet_type, round2(r.total)]));
  const y = map(yesterdayClose);
  const t = map(todayOpen);
  const wallets = ['PSC', 'BONUS', 'RSC'];
  const mismatches = wallets.filter((w) => Math.abs((y[w] || 0) - (t[w] || 0)) > 0.009);
  return { yesterdayClose: y, todayOpen: t, mismatched: mismatches };
}

function buildPsc(opening, rows, live) {
  const purchased = sumEvents(rows, 'PSC', [EVENT_TYPES.PURCHASE], 'CREDIT');
  const manualCredits = sumEvents(rows, 'PSC', [EVENT_TYPES.MANUAL_CREDIT, EVENT_TYPES.ADJUSTMENT_CREDIT, EVENT_TYPES.REFUND], 'CREDIT');
  const usedJuwa = sumEvents(rows, 'PSC', [EVENT_TYPES.USED_JUWA], 'DEBIT');
  const usedGv = sumEvents(rows, 'PSC', [EVENT_TYPES.USED_GAMEVAULT], 'DEBIT');
  const usedGd = sumEvents(rows, 'PSC', [EVENT_TYPES.USED_GOLDEN_DRAGON], 'DEBIT');
  const usedDirect = sumEvents(rows, 'PSC', [EVENT_TYPES.USED_DIRECT], 'DEBIT');
  const otherDebits = sumEvents(
    rows,
    'PSC',
    [EVENT_TYPES.USED_OTHER, EVENT_TYPES.MANUAL_DEBIT, EVENT_TYPES.ADJUSTMENT_DEBIT, EVENT_TYPES.NEVER_DEPOSITED_CLEAR, EVENT_TYPES.UNCLASSIFIED],
    'DEBIT'
  );
  const credits = round2(purchased + manualCredits);
  const debits = round2(usedJuwa + usedGv + usedGd + usedDirect + otherDebits);
  const closing = round2(opening + credits - debits);
  return {
    opening,
    purchased,
    manualCredits,
    usedJuwa,
    usedGameVault: usedGv,
    usedGoldenDragon: usedGd,
    usedDirect,
    otherDebits,
    credits,
    debits,
    closing,
    difference: round2(opening + credits - debits - closing),
    liveBalance: live.live,
    ledgerBalance: live.ledger
  };
}

function buildBonus(opening, rows, live) {
  const packageBonus = sumEvents(rows, 'BONUS', [EVENT_TYPES.PACKAGE_BONUS], 'CREDIT');
  const welcome = sumEvents(rows, 'BONUS', [EVENT_TYPES.WELCOME_BONUS], 'CREDIT');
  const spin = sumEvents(rows, 'BONUS', [EVENT_TYPES.SPIN_BONUS], 'CREDIT');
  const referral = sumEvents(rows, 'BONUS', [EVENT_TYPES.REFERRAL_BONUS], 'CREDIT');
  const coinback = sumEvents(rows, 'BONUS', [EVENT_TYPES.COINBACK], 'CREDIT');
  const otherIssued = sumEvents(
    rows,
    'BONUS',
    [EVENT_TYPES.DAILY_BONUS, EVENT_TYPES.VIP_BONUS, EVENT_TYPES.BONUS_CODE, EVENT_TYPES.MANUAL_BONUS, EVENT_TYPES.OTHER_BONUS, EVENT_TYPES.UNCLASSIFIED, EVENT_TYPES.ADJUSTMENT_CREDIT, EVENT_TYPES.REFUND],
    'CREDIT'
  );
  const usedJuwa = sumEvents(rows, 'BONUS', [EVENT_TYPES.USED_JUWA], 'DEBIT');
  const usedGv = sumEvents(rows, 'BONUS', [EVENT_TYPES.USED_GAMEVAULT], 'DEBIT');
  const usedGd = sumEvents(rows, 'BONUS', [EVENT_TYPES.USED_GOLDEN_DRAGON], 'DEBIT');
  const usedDirect = sumEvents(rows, 'BONUS', [EVENT_TYPES.USED_DIRECT], 'DEBIT');
  const expired = sumEvents(rows, 'BONUS', [EVENT_TYPES.EXPIRED], 'DEBIT');
  const voided = sumEvents(rows, 'BONUS', [EVENT_TYPES.VOIDED, EVENT_TYPES.NEVER_DEPOSITED_CLEAR], 'DEBIT');
  const cashoutCapVoid = sumEvents(rows, 'BONUS', [EVENT_TYPES.CASHOUT_CAP_VOID], 'DEBIT');
  const otherDebits = sumEvents(rows, 'BONUS', [EVENT_TYPES.USED_OTHER, EVENT_TYPES.MANUAL_DEBIT, EVENT_TYPES.ADJUSTMENT_DEBIT], 'DEBIT');
  const credits = round2(packageBonus + welcome + spin + referral + coinback + otherIssued);
  const used = round2(usedJuwa + usedGv + usedGd + usedDirect + otherDebits);
  const removed = round2(expired + voided + cashoutCapVoid);
  const closing = round2(opening + credits - used - removed);
  return {
    opening,
    packageBonus,
    welcome,
    spin,
    referral,
    coinback,
    otherIssued,
    usedJuwa,
    usedGameVault: usedGv,
    usedGoldenDragon: usedGd,
    usedDirect,
    expired,
    voided,
    cashoutCapVoid,
    otherDebits,
    credits,
    used,
    removed,
    closing,
    difference: round2(opening + credits - used - removed - closing),
    liveBalance: live.live,
    ledgerBalance: live.ledger
  };
}

function sumWallet(rows, walletType, direction, extraFilter) {
  return round2(
    rows
      .filter((r) => {
        if (r.wallet_type !== walletType || r.direction !== direction) return false;
        if (typeof extraFilter === 'function' && !extraFilter(r)) return false;
        return true;
      })
      .reduce((s, r) => s + num(r.total), 0)
  );
}

function buildRsc(opening, rows, live) {
  const fromJuwa = sumEvents(rows, 'RSC', [EVENT_TYPES.WIN_JUWA], 'CREDIT');
  const fromGv = sumEvents(rows, 'RSC', [EVENT_TYPES.WIN_GAMEVAULT], 'CREDIT');
  const fromGd = sumEvents(rows, 'RSC', [EVENT_TYPES.WIN_GOLDEN_DRAGON], 'CREDIT');
  const fromDirect = sumEvents(rows, 'RSC', [EVENT_TYPES.WIN_DIRECT], 'CREDIT');
  const fromOther = sumEvents(rows, 'RSC', [EVENT_TYPES.WIN_OTHER, EVENT_TYPES.MANUAL_CREDIT, EVENT_TYPES.ADJUSTMENT_CREDIT, EVENT_TYPES.REFUND], 'CREDIT');
  const winRows = rows.filter((r) => r.wallet_type === 'RSC' && r.direction === 'CREDIT' && String(r.event_type).startsWith('WIN_'));
  const bonusRscVoided = sumEvents(rows, 'RSC', [EVENT_TYPES.CASHOUT_CAP_VOID], 'DEBIT');
  const eligible = round2(winRows.reduce((s, r) => s + num(r.eligible_total || r.total), 0));
  const grossBonusRsc = round2(eligible + bonusRscVoided);
  const withdrawals = sumEvents(rows, 'RSC', [EVENT_TYPES.WITHDRAWAL], 'DEBIT');
  const otherDebits = sumEvents(
    rows,
    'RSC',
    [EVENT_TYPES.VOIDED, EVENT_TYPES.MANUAL_DEBIT, EVENT_TYPES.ADJUSTMENT_DEBIT, EVENT_TYPES.USED_JUWA, EVENT_TYPES.USED_GAMEVAULT, EVENT_TYPES.USED_GOLDEN_DRAGON, EVENT_TYPES.USED_DIRECT, EVENT_TYPES.USED_OTHER, EVENT_TYPES.NEVER_DEPOSITED_CLEAR, EVENT_TYPES.UNCLASSIFIED, EVENT_TYPES.EXPIRED],
    'DEBIT'
  );
  const generated = sumWallet(rows, 'RSC', 'CREDIT', (r) => String(r.event_type) !== EVENT_TYPES.OPENING_SNAPSHOT);
  const allDebits = sumWallet(rows, 'RSC', 'DEBIT');
  const usedInGamesAndStaff = round2(Math.max(0, allDebits - withdrawals));
  const closing = round2(opening + generated - withdrawals - usedInGamesAndStaff);
  const debits = round2(withdrawals + usedInGamesAndStaff);
  return {
    opening,
    fromJuwa,
    fromGameVault: fromGv,
    fromGoldenDragon: fromGd,
    fromDirect,
    fromOther,
    grossBonusRsc,
    bonusRscVoided,
    usedInGamesAndStaff,
    eligible,
    withdrawals,
    otherDebits,
    generated,
    debits,
    closing,
    difference: round2(opening + generated - withdrawals - usedInGamesAndStaff - closing),
    liveBalance: live.live,
    ledgerBalance: live.ledger
  };
}

const PRODUCT_LABELS = {
  JUWA: 'Juwa',
  JUWA20: 'Juwa 2.0',
  GAMEVAULT: 'Game Vault',
  GAMEVAULT2: 'Game Vault 2',
  GOLDEN_DRAGON: 'Golden Dragon',
  ORIONSTARS: 'Orion Stars',
  EGAME99: 'Egame99',
  FIRE_KIRIN: 'Fire Kirin',
  PANDA: 'Panda',
  PANDA_MASTER: 'Panda Master',
  VBLINK: 'VBlink',
  MILKYWAY: 'Milky Way',
  ULTRA_PANDA: 'Ultra Panda',
  CASH_MACHINE_777: 'Cash Machine 777',
  RIVER_SWEEPS: 'River Sweeps',
  VEGASX: 'VegasX',
  GAMEROOM: 'Game Room',
  MAFIA: 'Mafia',
  LUCKY_PARADISE: 'Lucky Paradise',
  GITSLOTPARK: 'Slot games (GitSlotPark)',
  ONEGAMEHUB: 'Slot games (1GameHub)',
  BONA: 'Bona games',
  WIN568: 'Win568 games',
  DIRECT: 'Other slot games',
  OTHER: 'Other games'
};

function humanizeProductId(id) {
  if (PRODUCT_LABELS[id]) return PRODUCT_LABELS[id];
  return String(id || 'Other games')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildProducts(rows) {
  const ids = [
    'JUWA',
    'JUWA20',
    'GAMEVAULT',
    'GAMEVAULT2',
    'GOLDEN_DRAGON',
    'ORIONSTARS',
    'EGAME99',
    'FIRE_KIRIN',
    'PANDA_MASTER',
    'CASH_MACHINE_777',
    'RIVER_SWEEPS',
    'GITSLOTPARK',
    'ONEGAMEHUB',
    'BONA',
    'WIN568',
    'DIRECT',
    'OTHER'
  ];
  for (const r of rows) {
    const id = String(r.product_id || '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids
    .map((id) => ({
      productId: id,
      label: humanizeProductId(id),
      pscUsed: sumProducts(rows, 'PSC', id, 'DEBIT'),
      bonusUsed: sumProducts(rows, 'BONUS', id, 'DEBIT'),
      rscUsed: sumProducts(rows, 'RSC', id, 'DEBIT', (r) => String(r.event_type || '').startsWith('USED_')),
      rscGenerated: sumProducts(rows, 'RSC', id, 'CREDIT')
    }))
    .filter((p) => p.pscUsed || p.bonusUsed || p.rscUsed || p.rscGenerated);
}

function liveMap(rows) {
  const out = {
    PSC: { live: 0, ledger: 0 },
    BONUS: { live: 0, ledger: 0 },
    RSC: { live: 0, ledger: 0 }
  };
  for (const r of rows) {
    const code = String(r.currency_code || '').toUpperCase();
    const key = code === 'BSC' ? 'BONUS' : code === 'RSC' ? 'RSC' : 'PSC';
    out[key].live = round2(out[key].live + num(r.live_balance));
    out[key].ledger = round2(num(r.ledger_balance));
  }
  return out;
}

async function getWalletScReconciliation({
  startDate,
  endDate,
  timezoneOffset,
  storeCode,
  userId,
  username
}) {
  const range = resolveDateRange(startDate, endDate, timezoneOffset);
  const { sql: userSql, bind } = scopeSql({ storeCode, userId, username });
  const ledgerStart = await getLedgerLiveStart(db.sequelize, QueryTypes);
  const activityTo = new Date();

  const [activity, liveRows, alertCounts, carry] = await Promise.all([
    queryActivityBundle({ from: range.from, to: range.to, activityTo, bind, userSql, ledgerStart }),
    queryLiveVsLedger({ bind, userSql }),
    queryAlerts({ from: range.from, to: range.to, bind, userSql }),
    queryCarryForwardCheck({ from: range.from, bind, userSql })
  ]);

  const live = liveMap(liveRows);
  const netMap = activity.netMap;
  const eventRows = activity.eventRows;
  const openingMap = {
    PSC: round2(live.PSC.live - (netMap.PSC || 0)),
    BONUS: round2(live.BONUS.live - (netMap.BONUS || 0)),
    RSC: round2(live.RSC.live - (netMap.RSC || 0))
  };

  const psc = buildPsc(openingMap.PSC || 0, eventRows, live.PSC);
  const bonus = buildBonus(openingMap.BONUS || 0, eventRows, live.BONUS);
  const rsc = buildRsc(openingMap.RSC || 0, eventRows, live.RSC);
  const products = buildProducts(eventRows);

  const walletMismatch = ['PSC', 'BONUS', 'RSC'].filter((w) => {
    const block = w === 'PSC' ? psc : w === 'BONUS' ? bonus : rsc;
    return Math.abs(round2(block.liveBalance - block.ledgerBalance)) > 0.009;
  });

  const formulaOk = Math.abs(psc.difference) < 0.009 && Math.abs(bonus.difference) < 0.009 && Math.abs(rsc.difference) < 0.009;

  const alerts = [];
  if (walletMismatch.length) {
    alerts.push({
      code: 'WALLET_LEDGER_MISMATCH',
      level: 'red',
      title: 'Wallet does not match the story book',
      detail: `These jars do not match: ${walletMismatch.join(', ')}.`
    });
  }
  if (alertCounts.negativeBalances > 0) {
    alerts.push({
      code: 'NEGATIVE_BALANCE',
      level: 'red',
      title: 'Someone has less than zero SC',
      detail: `${alertCounts.negativeBalances} wallet(s) went below zero.`
    });
  }
  if (alertCounts.purchaseWithoutPayment > 0) {
    alerts.push({
      code: 'PSC_WITHOUT_PAYMENT',
      level: 'red',
      title: 'Bought SC with no payment',
      detail: `${alertCounts.purchaseWithoutPayment} purchased-SC rows have no payment id.`
    });
  }
  if (alertCounts.bonusWithoutType > 0) {
    alerts.push({
      code: 'BONUS_WITHOUT_TYPE',
      level: 'red',
      title: 'Gift SC with no gift name',
      detail: `${alertCounts.bonusWithoutType} bonus rows are missing a bonus type.`
    });
  }
  if (alertCounts.rscWithoutOrigin > 0) {
    alerts.push({
      code: 'RSC_WITHOUT_ORIGIN',
      level: 'red',
      title: 'Win SC with no game name',
      detail: `${alertCounts.rscWithoutOrigin} win rows have no product.`
    });
  }
  if (alertCounts.manualWithoutReason > 0) {
    alerts.push({
      code: 'MANUAL_WITHOUT_REASON',
      level: 'red',
      title: 'Manual change with no why',
      detail: `${alertCounts.manualWithoutReason} admin changes have no reason.`
    });
  }
  if (alertCounts.duplicateGroups > 0) {
    alerts.push({
      code: 'DUPLICATE_LEDGER',
      level: 'red',
      title: 'Same story written twice',
      detail: `${alertCounts.duplicateGroups} duplicate ledger groups found.`
    });
  }
  if (carry.mismatched.length) {
    alerts.push({
      code: 'CARRY_FORWARD_MISMATCH',
      level: 'red',
      title: 'Yesterday leftover is not today start',
      detail: `Jars that do not match: ${carry.mismatched.join(', ')}.`
    });
  }

  return {
    range: { startDate: range.rangeStart, endDate: range.rangeEnd, from: range.from, to: range.to },
    filters: { storeCode: storeCode || null, userId: userId || null, username: username || null },
    psc,
    bonus,
    rsc,
    products,
    formulaOk,
    dailyTally: {
      psc: {
        opening: psc.opening,
        added: psc.credits,
        used: psc.debits,
        closing: psc.closing,
        difference: psc.difference
      },
      bonus: {
        opening: bonus.opening,
        added: bonus.credits,
        used: bonus.used,
        voidedExpired: bonus.removed,
        closing: bonus.closing,
        difference: bonus.difference
      },
      rsc: {
        opening: rsc.opening,
        generated: rsc.generated,
        withdrawn: rsc.withdrawals,
        voided: rsc.usedInGamesAndStaff,
        closing: rsc.closing,
        difference: rsc.difference
      }
    },
    alerts,
    liveVsLedger: live
  };
}

async function getWalletScReconciliationFilterOptions() {
  const stores = await db.sequelize.query(
    `
    SELECT DISTINCT store_code
    FROM users
    WHERE role = :userRole AND store_code IS NOT NULL AND TRIM(store_code) <> ''
    ORDER BY store_code
    `,
    { replacements: { userRole: ROLES.USER }, type: QueryTypes.SELECT }
  );
  return {
    storeCodes: stores.map((r) => r.store_code).filter(Boolean)
  };
}

module.exports = {
  getWalletScReconciliation,
  getWalletScReconciliationFilterOptions,
  resolveDateRange,
  scopeSql,
  parsePageLimit,
  round2,
  emptyWalletBlock
};
