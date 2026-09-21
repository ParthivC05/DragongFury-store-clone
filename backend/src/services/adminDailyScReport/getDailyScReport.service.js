'use strict';

const { QueryTypes } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const {
  resolveDateRange,
  scopeSql
} = require('../adminWalletScReconciliation/getWalletScReconciliation.service');
const { activitySourceSql, getLedgerLiveStart } = require('../adminWalletScReconciliation/walletScActivitySource.sql');
const {
  MAX_RANGE_DAYS,
  round2,
  num,
  emptyFlow,
  applyRow,
  mapToList,
  inPartsMatch,
  outPartsMatch,
  listDatesInclusive
} = require('./dailyScReport.constants');

const EPOCH = new Date('1970-01-01T00:00:00.000Z');

function parseTimezoneOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 14 * 60) return 0;
  return n;
}

function dayExpr() {
  return `to_char((l.created_at AT TIME ZONE 'UTC') - (:tzOffset * INTERVAL '1 minute'), 'YYYY-MM-DD')`;
}

async function queryOpeningByWallet({ from, bind, userSql, ledgerStart, tzOffset }) {
  const activityTo = new Date(from.getTime() - 1);
  const rows = await db.sequelize.query(
    `
    SELECT
      l.wallet_type,
      COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END), 0)::float AS net
    FROM ${activitySourceSql()} l
    JOIN users u ON u.user_id = l.user_id
    WHERE ${userSql}
    GROUP BY l.wallet_type
    `,
    {
      replacements: { ...bind, from: EPOCH, to: activityTo, activityTo, ledgerStart, tzOffset },
      type: QueryTypes.SELECT
    }
  );
  const opening = { PSC: 0, BONUS: 0, RSC: 0 };
  for (const row of rows) {
    const key = String(row.wallet_type || '').toUpperCase();
    if (opening[key] != null) opening[key] = round2(row.net);
    else opening.PSC = round2(opening.PSC + num(row.net));
  }
  return opening;
}

async function queryDailyRows({ from, to, bind, userSql, ledgerStart, tzOffset }) {
  return db.sequelize.query(
    `
    SELECT
      ${dayExpr()} AS day,
      l.wallet_type,
      l.direction,
      l.event_type,
      COALESCE(l.bonus_type, '') AS bonus_type,
      COALESCE(l.product_id, '') AS product_id,
      COALESCE(l.product_type, '') AS product_type,
      COALESCE(l.provider_id, '') AS provider_id,
      COALESCE(l.source_type, '') AS source_type,
      LOWER(COALESCE(l.metadata->>'provider', '')) AS meta_provider,
      l.game_id,
      COALESCE(g.name, '') AS game_name,
      COALESCE(g.game_key, '') AS game_key,
      COALESCE(SUM(l.amount), 0)::float AS total,
      COUNT(*)::int AS entry_count
    FROM ${activitySourceSql()} l
    JOIN users u ON u.user_id = l.user_id
    LEFT JOIN games g ON g.id = l.game_id
    WHERE ${userSql}
      AND l.created_at >= :from
      AND l.created_at <= :to
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
    `,
    {
      replacements: { ...bind, from, to, activityTo: to, ledgerStart, tzOffset },
      type: QueryTypes.SELECT
    }
  );
}

async function queryRangeDirectionTotals({ from, to, bind, userSql, ledgerStart, tzOffset }) {
  const rows = await db.sequelize.query(
    `
    SELECT
      l.direction,
      COALESCE(SUM(l.amount), 0)::float AS total,
      COUNT(*)::int AS entry_count
    FROM ${activitySourceSql()} l
    JOIN users u ON u.user_id = l.user_id
    WHERE ${userSql}
      AND l.created_at >= :from
      AND l.created_at <= :to
    GROUP BY l.direction
    `,
    {
      replacements: { ...bind, from, to, activityTo: to, ledgerStart, tzOffset },
      type: QueryTypes.SELECT
    }
  );
  const out = { credits: 0, debits: 0, creditCount: 0, debitCount: 0 };
  for (const row of rows) {
    if (String(row.direction).toUpperCase() === 'CREDIT') {
      out.credits = round2(row.total);
      out.creditCount = Number(row.entry_count) || 0;
    } else if (String(row.direction).toUpperCase() === 'DEBIT') {
      out.debits = round2(row.total);
      out.debitCount = Number(row.entry_count) || 0;
    }
  }
  return out;
}

function mergeProviderRows(betsMap, winsMap) {
  const keys = new Set([...Object.keys(betsMap || {}), ...Object.keys(winsMap || {})]);
  return [...keys]
    .map((key) => {
      const bets = betsMap[key] || {};
      const wins = winsMap[key] || {};
      return {
        key,
        label: bets.label || wins.label || key,
        bets: round2(bets.amount),
        wins: round2(wins.amount)
      };
    })
    .filter((row) => row.bets > 0.0001 || row.wins > 0.0001)
    .sort((a, b) => (b.bets + b.wins) - (a.bets + a.wins));
}

function mergePlatformRows(topupMap, redeemMap) {
  const keys = new Set([...Object.keys(topupMap || {}), ...Object.keys(redeemMap || {})]);
  return [...keys]
    .map((key) => {
      const topup = topupMap[key] || {};
      const redeem = redeemMap[key] || {};
      return {
        key,
        label: topup.label || redeem.label || key,
        productId: topup.productId || redeem.productId || key,
        topUp: round2(topup.amount),
        redeemed: round2(redeem.amount)
      };
    })
    .filter((row) => row.topUp > 0.0001 || row.redeemed > 0.0001)
    .sort((a, b) => (b.topUp + b.redeemed) - (a.topUp + a.redeemed));
}

function buildDayPayload(date, fromYesterday, scTypeOpening, flow) {
  const remaining = round2(flow.totalIn - flow.totalOut);
  const totalRemaining = round2(fromYesterday + flow.totalIn - flow.totalOut);
  const leftoverSitting = totalRemaining;
  const scTypes = {
    bought: {
      fromYesterday: scTypeOpening.bought,
      inToday: flow.scTypes.bought.credits,
      outToday: flow.scTypes.bought.debits,
      remaining: round2(flow.scTypes.bought.credits - flow.scTypes.bought.debits),
      totalRemaining: round2(scTypeOpening.bought + flow.scTypes.bought.credits - flow.scTypes.bought.debits),
      leftoverSitting: round2(scTypeOpening.bought + flow.scTypes.bought.credits - flow.scTypes.bought.debits)
    },
    bonus: {
      fromYesterday: scTypeOpening.bonus,
      inToday: flow.scTypes.bonus.credits,
      outToday: flow.scTypes.bonus.debits,
      remaining: round2(flow.scTypes.bonus.credits - flow.scTypes.bonus.debits),
      totalRemaining: round2(scTypeOpening.bonus + flow.scTypes.bonus.credits - flow.scTypes.bonus.debits),
      leftoverSitting: round2(scTypeOpening.bonus + flow.scTypes.bonus.credits - flow.scTypes.bonus.debits)
    },
    win: {
      fromYesterday: scTypeOpening.win,
      inToday: flow.scTypes.win.credits,
      outToday: flow.scTypes.win.debits,
      remaining: round2(flow.scTypes.win.credits - flow.scTypes.win.debits),
      totalRemaining: round2(scTypeOpening.win + flow.scTypes.win.credits - flow.scTypes.win.debits),
      leftoverSitting: round2(scTypeOpening.win + flow.scTypes.win.credits - flow.scTypes.win.debits)
    }
  };
  const formulaOk = Math.abs(round2(flow.totalIn - flow.totalOut - remaining)) < 0.009
    && Math.abs(round2(fromYesterday + flow.totalIn - flow.totalOut - totalRemaining)) < 0.009
    && inPartsMatch(flow)
    && outPartsMatch(flow);
  const scTypeSumOk = Math.abs(round2(
    scTypes.bought.remaining + scTypes.bonus.remaining + scTypes.win.remaining - remaining
  )) < 0.009
    && Math.abs(round2(
      scTypes.bought.totalRemaining + scTypes.bonus.totalRemaining + scTypes.win.totalRemaining - totalRemaining
    )) < 0.009;

  return {
    date,
    fromYesterday,
    remaining,
    totalRemaining,
    leftoverSitting,
    deposits: flow.deposits,
    bonuses: flow.bonuses,
    gameWins: flow.gameWins,
    casinoWins: flow.casinoWins,
    platformWins: flow.platformWins,
    adminAdd: flow.adminAdd,
    otherIn: flow.otherIn,
    totalIn: flow.totalIn,
    casinoUsed: flow.casinoUsed,
    platformUsed: flow.platformUsed,
    withdrawals: flow.withdrawals,
    adminRemove: flow.adminRemove,
    otherOut: flow.otherOut,
    totalOut: flow.totalOut,
    unclassifiedIn: flow.unclassifiedIn,
    unclassifiedOut: flow.unclassifiedOut,
    formulaOk: formulaOk && scTypeSumOk,
    inPartsOk: inPartsMatch(flow),
    outPartsOk: outPartsMatch(flow),
    scTypes,
    inBreakdown: [
      { metric: 'deposits', label: 'SC deposits', amount: flow.deposits },
      { metric: 'bonuses', label: 'Bonuses', amount: flow.bonuses },
      { metric: 'casino_wins', label: 'Casino won', amount: flow.casinoWins },
      { metric: 'platform_wins', label: 'Platform redeemed', amount: flow.platformWins },
      { metric: 'other_in', label: 'Other in (admin add, refunds)', amount: flow.otherIn }
    ].filter((row) => row.amount > 0.0001),
    bonusByType: mapToList(flow.bonusByType),
    outBreakdown: [
      { metric: 'casino_used', label: 'Casino bets', amount: flow.casinoUsed },
      { metric: 'platform_used', label: 'Platform top up', amount: flow.platformUsed },
      { metric: 'withdrawals', label: 'SC withdrawals (RSC)', amount: flow.withdrawals },
      { metric: 'other_out', label: 'Other out (admin remove, expired, void)', amount: flow.otherOut }
    ].filter((row) => row.amount > 0.0001),
    casinoByProvider: mergeProviderRows(flow.casinoBetsByProvider, flow.casinoWinsByProvider),
    platformByGame: mergePlatformRows(flow.platformTopupByGame, flow.platformRedeemedByGame)
  };
}

function assertRangeLength(rangeStart, rangeEnd) {
  const dates = listDatesInclusive(rangeStart, rangeEnd);
  if (!dates.length) {
    const err = new Error('Pick a valid date range.');
    err.statusCode = 400;
    throw err;
  }
  if (dates.length > MAX_RANGE_DAYS) {
    const err = new Error(`Pick ${MAX_RANGE_DAYS} days or fewer.`);
    err.statusCode = 400;
    throw err;
  }
  return dates;
}

async function getDailyScReport({
  startDate,
  endDate,
  timezoneOffset,
  storeCode
}) {
  const range = resolveDateRange(startDate, endDate, timezoneOffset);
  const dates = assertRangeLength(range.rangeStart, range.rangeEnd);
  const tzOffset = parseTimezoneOffset(timezoneOffset);
  const { sql: userSql, bind } = scopeSql({ storeCode });
  const ledgerStart = await getLedgerLiveStart(db.sequelize, QueryTypes);

  const [openingByWallet, groupedRows, rangeTotals] = await Promise.all([
    queryOpeningByWallet({
      from: range.from,
      bind,
      userSql,
      ledgerStart,
      tzOffset
    }),
    queryDailyRows({
      from: range.from,
      to: range.to,
      bind,
      userSql,
      ledgerStart,
      tzOffset
    }),
    queryRangeDirectionTotals({
      from: range.from,
      to: range.to,
      bind,
      userSql,
      ledgerStart,
      tzOffset
    })
  ]);

  const rowsByDay = new Map();
  for (const row of groupedRows) {
    const day = String(row.day || '').slice(0, 10);
    if (!day) continue;
    if (!rowsByDay.has(day)) rowsByDay.set(day, []);
    rowsByDay.get(day).push(row);
  }

  let fromYesterday = round2(openingByWallet.PSC + openingByWallet.BONUS + openingByWallet.RSC);
  const scTypeOpening = {
    bought: round2(openingByWallet.PSC),
    bonus: round2(openingByWallet.BONUS),
    win: round2(openingByWallet.RSC)
  };

  const days = [];
  let carryMismatch = false;
  let formulaMismatch = false;

  for (const date of dates) {
    const flow = emptyFlow();
    const dayRows = rowsByDay.get(date) || [];
    for (const row of dayRows) applyRow(flow, row);

    const day = buildDayPayload(date, fromYesterday, { ...scTypeOpening }, flow);
    if (!day.formulaOk) formulaMismatch = true;
    days.push(day);

    const nextFromYesterday = day.leftoverSitting;
    fromYesterday = nextFromYesterday;
    scTypeOpening.bought = day.scTypes.bought.leftoverSitting;
    scTypeOpening.bonus = day.scTypes.bonus.leftoverSitting;
    scTypeOpening.win = day.scTypes.win.leftoverSitting;
  }

  for (let i = 1; i < days.length; i += 1) {
    if (Math.abs(round2(days[i].fromYesterday - days[i - 1].leftoverSitting)) > 0.009) {
      carryMismatch = true;
      days[i].carryOk = false;
    } else {
      days[i].carryOk = true;
    }
  }
  if (days[0]) days[0].carryOk = true;

  const summedIn = round2(days.reduce((s, d) => s + d.totalIn, 0));
  const summedOut = round2(days.reduce((s, d) => s + d.totalOut, 0));
  const totalsMatch = Math.abs(summedIn - rangeTotals.credits) < 0.009
    && Math.abs(summedOut - rangeTotals.debits) < 0.009;

  const totals = days.reduce((acc, day) => {
    acc.deposits = round2(acc.deposits + day.deposits);
    acc.bonuses = round2(acc.bonuses + day.bonuses);
    acc.gameWins = round2(acc.gameWins + day.gameWins);
    acc.otherIn = round2(acc.otherIn + day.otherIn);
    acc.totalIn = round2(acc.totalIn + day.totalIn);
    acc.casinoUsed = round2(acc.casinoUsed + day.casinoUsed);
    acc.platformUsed = round2(acc.platformUsed + day.platformUsed);
    acc.withdrawals = round2(acc.withdrawals + day.withdrawals);
    acc.otherOut = round2(acc.otherOut + day.otherOut);
    acc.totalOut = round2(acc.totalOut + day.totalOut);
    return acc;
  }, {
    fromYesterday: days[0] ? days[0].fromYesterday : 0,
    deposits: 0,
    bonuses: 0,
    gameWins: 0,
    otherIn: 0,
    totalIn: 0,
    casinoUsed: 0,
    platformUsed: 0,
    withdrawals: 0,
    otherOut: 0,
    totalOut: 0,
    remaining: round2(days.reduce((s, d) => s + d.remaining, 0)),
    totalRemaining: days.length ? days[days.length - 1].totalRemaining : 0
  });

  const ok = !carryMismatch && !formulaMismatch && totalsMatch;

  return {
    range: { startDate: range.rangeStart, endDate: range.rangeEnd, from: range.from, to: range.to },
    filters: { storeCode: storeCode || null },
    days,
    totals,
    checks: {
      ok,
      carryOk: !carryMismatch,
      formulaOk: !formulaMismatch,
      totalsMatch,
      sourceCredits: rangeTotals.credits,
      sourceDebits: rangeTotals.debits,
      summedCredits: summedIn,
      summedDebits: summedOut,
      sourceCreditCount: rangeTotals.creditCount,
      sourceDebitCount: rangeTotals.debitCount
    }
  };
}

async function getDailyScReportFilterOptions() {
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
  getDailyScReport,
  getDailyScReportFilterOptions
};
