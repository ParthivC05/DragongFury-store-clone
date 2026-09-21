'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { ROLES } = require('../../constants/roles');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');

function makeKey(distributorCode, storeCode) {
  return `${String(distributorCode || '').trim()}|${String(storeCode || '').trim()}`;
}

function emptyTotals() {
  return {
    walletDeposit: 0,
    walletWithdraw: 0,
    chimeWithdraw: 0,
    cashappWithdraw: 0,
    totalWithdraw: 0,
    net: 0
  };
}

function emptyStoreRow(distributorCode, storeCode) {
  return {
    distributorCode,
    storeCode,
    walletDeposit: 0,
    walletWithdraw: 0,
    chimeWithdraw: 0,
    cashappWithdraw: 0
  };
}

/** All primary store_admin rows (storeRoleId null), keyed by distributor|store. */
async function loadPrimaryStoresMap() {
  const stores = await db.User.findAll({
    where: {
      role: ROLES.STORE_ADMIN,
      storeRoleId: null,
      distributorCode: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      storeCode: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
    },
    attributes: ['distributorCode', 'storeCode'],
    raw: true
  });
  const byKey = new Map();
  for (const s of stores || []) {
    const dc = String(s.distributorCode || '').trim();
    const sc = String(s.storeCode || '').trim();
    if (!dc || !sc) continue;
    const k = makeKey(dc, sc);
    if (!byKey.has(k)) byKey.set(k, emptyStoreRow(dc, sc));
  }
  return byKey;
}

function finalizeRows(byKey) {
  const rows = [...byKey.values()].map((row) => {
    const totalWithdraw = row.walletWithdraw + row.chimeWithdraw + row.cashappWithdraw;
    return {
      ...row,
      totalWithdraw,
      net: row.walletDeposit - totalWithdraw
    };
  });
  rows.sort((a, b) => {
    const byDist = a.distributorCode.localeCompare(b.distributorCode);
    if (byDist !== 0) return byDist;
    return a.storeCode.localeCompare(b.storeCode);
  });
  const totals = rows.reduce((acc, r) => {
    acc.walletDeposit += r.walletDeposit;
    acc.walletWithdraw += r.walletWithdraw;
    acc.chimeWithdraw += r.chimeWithdraw;
    acc.cashappWithdraw += r.cashappWithdraw;
    acc.totalWithdraw += r.totalWithdraw;
    acc.net += r.net;
    return acc;
  }, emptyTotals());
  return { rows, totals };
}

/**
 * Per-store wallet topup / withdraw (user_transactions) plus completed Chime/Cash App manual withdrawals.
 * Master admin only; date range required (same semantics as admin reports).
 *
 * @param {{ startDate?: string, endDate?: string }} params
 * @returns {Promise<{ rows: object[], totals: object, startDate: string|null, endDate: string|null }>}
 */
async function getStoreWalletSummaryByStore({ startDate, endDate }) {
  const startStr = startDate && String(startDate).trim();
  const endStr = endDate && String(endDate).trim();
  const empty = { rows: [], totals: emptyTotals(), startDate: startStr || null, endDate: endStr || null };
  if (!startStr || !endStr) return empty;

  const dateFrom = toDateRangeStart(startStr);
  const dateTo = toDateRangeEnd(endStr);
  if (!dateFrom || !dateTo) return empty;

  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  if (isPg) {
    const replacements = { dateFrom, dateTo };
    const walletSql = `
      SELECT u.distributor_code AS "distributorCode",
             u.store_code AS "storeCode",
             COALESCE(SUM(CASE WHEN ut.type = 'deposit' THEN ut.amount::float ELSE 0 END), 0) AS "walletDeposit",
             COALESCE(SUM(CASE WHEN ut.type = 'withdraw' THEN ut.amount::float ELSE 0 END), 0) AS "walletWithdraw"
      FROM user_transactions ut
      INNER JOIN users u ON u.user_id = ut.user_id
      WHERE u.role = :userRole
        AND u.distributor_code IS NOT NULL AND TRIM(u.distributor_code) <> ''
        AND u.store_code IS NOT NULL AND TRIM(u.store_code) <> ''
        AND ut.created_at >= :dateFrom AND ut.created_at <= :dateTo
        AND ut.type IN ('deposit', 'withdraw')
      GROUP BY u.distributor_code, u.store_code
    `;
    const chimeSql = `
      SELECT distributor_code AS "distributorCode",
             store_code AS "storeCode",
             COALESCE(SUM(CASE WHEN payout_type = 'chime' THEN amount::float ELSE 0 END), 0) AS "chimeWithdraw",
             COALESCE(SUM(CASE WHEN payout_type = 'cashapp' THEN amount::float ELSE 0 END), 0) AS "cashappWithdraw"
      FROM chime_cashapp_withdrawal_requests
      WHERE status = 'completed'
        AND updated_at >= :dateFrom AND updated_at <= :dateTo
        AND distributor_code IS NOT NULL AND TRIM(distributor_code) <> ''
        AND store_code IS NOT NULL AND TRIM(store_code) <> ''
      GROUP BY distributor_code, store_code
    `;
    const rep = { ...replacements, userRole: ROLES.USER };
    const [byKey, walletRows, chimeRows] = await Promise.all([
      loadPrimaryStoresMap(),
      db.sequelize.query(walletSql, { replacements: rep, type: db.Sequelize.QueryTypes.SELECT }),
      db.sequelize.query(chimeSql, { replacements, type: db.Sequelize.QueryTypes.SELECT })
    ]);

    for (const r of walletRows || []) {
      const dc = String(r.distributorCode || '').trim();
      const sc = String(r.storeCode || '').trim();
      if (!dc || !sc) continue;
      const existing = byKey.get(makeKey(dc, sc));
      if (!existing) continue;
      existing.walletDeposit = Number(r.walletDeposit) || 0;
      existing.walletWithdraw = Number(r.walletWithdraw) || 0;
    }
    for (const r of chimeRows || []) {
      const dc = String(r.distributorCode || '').trim();
      const sc = String(r.storeCode || '').trim();
      if (!dc || !sc) continue;
      const existing = byKey.get(makeKey(dc, sc));
      if (!existing) continue;
      existing.chimeWithdraw = Number(r.chimeWithdraw) || 0;
      existing.cashappWithdraw = Number(r.cashappWithdraw) || 0;
    }

    const { rows, totals } = finalizeRows(byKey);
    return { rows, totals, startDate: startStr, endDate: endStr };
  }

  // Non-Postgres: aggregate via Sequelize (same numbers as PG path for wallet; Chime table grouped in JS).
  const byStore = new Map();
  const primaryStores = await loadPrimaryStoresMap();
  for (const row of primaryStores.values()) {
    const k = makeKey(row.distributorCode, row.storeCode);
    byStore.set(k, { distributorCode: row.distributorCode, storeCode: row.storeCode, userIds: null });
  }

  const storeUsers = await db.User.findAll({
    where: {
      role: ROLES.USER,
      distributorCode: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      storeCode: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
    },
    attributes: ['distributorCode', 'storeCode', 'userId'],
    raw: true
  });
  const userIdsByStore = new Map();
  for (const u of storeUsers || []) {
    const dc = String(u.distributorCode || '').trim();
    const sc = String(u.storeCode || '').trim();
    if (!dc || !sc) continue;
    const k = makeKey(dc, sc);
    if (!userIdsByStore.has(k)) userIdsByStore.set(k, []);
    userIdsByStore.get(k).push(u.userId);
  }

  const baseTxWhere = {
    createdAt: { [Op.gte]: dateFrom, [Op.lte]: dateTo },
    type: { [Op.in]: ['deposit', 'withdraw'] }
  };

  const rows = [];
  for (const { distributorCode, storeCode } of byStore.values()) {
    const k = makeKey(distributorCode, storeCode);
    const userIds = userIdsByStore.get(k) || [];
    if (!userIds.length) {
      rows.push({
        distributorCode,
        storeCode,
        walletDeposit: 0,
        walletWithdraw: 0,
        chimeWithdraw: 0,
        cashappWithdraw: 0,
        totalWithdraw: 0,
        net: 0
      });
      continue;
    }
    const depositWhere = { ...baseTxWhere, userId: { [Op.in]: userIds }, type: 'deposit' };
    const withdrawWhere = { ...baseTxWhere, userId: { [Op.in]: userIds }, type: 'withdraw' };
    const [depSum, witSum] = await Promise.all([
      db.UserTransaction.sum('amount', { where: depositWhere }),
      db.UserTransaction.sum('amount', { where: withdrawWhere })
    ]);
    const walletDeposit = Number(depSum) || 0;
    const walletWithdraw = Number(witSum) || 0;

    const [chimeSum, cashappSum] = await Promise.all([
      db.ChimeCashappWithdrawalRequest.sum('amount', {
        where: {
          userId: { [Op.in]: userIds },
          status: 'completed',
          payoutType: 'chime',
          updatedAt: { [Op.gte]: dateFrom, [Op.lte]: dateTo }
        }
      }),
      db.ChimeCashappWithdrawalRequest.sum('amount', {
        where: {
          userId: { [Op.in]: userIds },
          status: 'completed',
          payoutType: 'cashapp',
          updatedAt: { [Op.gte]: dateFrom, [Op.lte]: dateTo }
        }
      })
    ]);
    const chimeWithdraw = Number(chimeSum) || 0;
    const cashappWithdraw = Number(cashappSum) || 0;

    const totalWithdraw = walletWithdraw + chimeWithdraw + cashappWithdraw;
    rows.push({
      distributorCode,
      storeCode,
      walletDeposit,
      walletWithdraw,
      chimeWithdraw,
      cashappWithdraw,
      totalWithdraw,
      net: walletDeposit - totalWithdraw
    });
  }

  const { rows: sortedRows, totals } = finalizeRows(
    new Map(rows.map((r) => [makeKey(r.distributorCode, r.storeCode), r]))
  );

  return { rows: sortedRows, totals, startDate: startStr, endDate: endStr };
}

module.exports = { getStoreWalletSummaryByStore };
