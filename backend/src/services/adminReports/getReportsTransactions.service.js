const db = require('../../db/models');
const { Op } = require('sequelize');
const { REPORTS_REAL_MONEY_ONLY } = require('./reportsConfig');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 500;
const VALID_TYPES = ['deposit', 'withdraw', 'spin_wheel', 'promotion', 'affiliate', 'vip_bonus', 'game_deposit', 'game_withdraw'];
const REAL_MONEY_TYPES = ['deposit', 'withdraw'];

function parseCodeList(param) {
  if (param == null || param === '') return [];
  const arr = Array.isArray(param) ? param : String(param).split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set(arr)].filter((s) => s !== 'undefined' && s.length > 0);
}

/**
 * List transactions for report table (scope via userIds). Paginated, sortable.
 * Optionally filter by distributorCode and/or storeCode (comma-separated; filter applied on User).
 * When REPORTS_REAL_MONEY_ONLY is true (reportsConfig.js), only deposit and withdraw transactions are returned.
 * @param {object} params - { userIds, startDate, endDate, type, page, limit, sortBy, sortOrder, distributorCode?, storeCode? }
 */
function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  };
}

async function getReportsTransactions({ userIds, startDate, endDate, timezoneOffset, type, page = 1, limit = DEFAULT_LIMIT, sortBy = 'createdAt', sortOrder = 'DESC', distributorCode, storeCode }) {
  if (!userIds || userIds.length === 0) {
    return { rows: [], total: 0, page: 1, limit: Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT)), totalPages: 0 };
  }

  const realMoneyOnly = REPORTS_REAL_MONEY_ONLY;
  const allowedTypes = realMoneyOnly ? REAL_MONEY_TYPES : VALID_TYPES;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const offset = (pageNum - 1) * limitNum;
  const orderField = sortBy === 'amount' ? 'amount' : 'createdAt';
  const orderDir = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const types = (() => {
    if (!type) return realMoneyOnly ? REAL_MONEY_TYPES : [];
    const arr = Array.isArray(type) ? type : String(type).split(',').map((t) => t.trim()).filter(Boolean);
    return arr.filter((t) => allowedTypes.includes(t));
  })();
  const distributorCodes = parseCodeList(distributorCode);
  const storeCodes = parseCodeList(storeCode);

  const normalizedStart = startDate && String(startDate).trim() && String(startDate).trim() !== 'undefined' ? String(startDate).trim() : null;
  const normalizedEnd = endDate && String(endDate).trim() && String(endDate).trim() !== 'undefined' ? String(endDate).trim() : null;
  const defaultRange = defaultDateRange();
  const rangeStart = normalizedStart || defaultRange.startDate;
  const rangeEnd = normalizedEnd || defaultRange.endDate;

  const where = { userId: { [Op.in]: userIds } };
  if (types.length > 0) where.type = { [Op.in]: types };
  else if (realMoneyOnly) where.type = { [Op.in]: REAL_MONEY_TYPES };

  const from = toDateRangeStart(rangeStart, timezoneOffset);
  const to = toDateRangeEnd(rangeEnd, timezoneOffset);
  if (from && to) {
    where.createdAt = { [Op.gte]: from, [Op.lte]: to };
  }

  const userWhere = [];
  if (distributorCodes.length > 0) userWhere.push({ distributorCode: { [Op.in]: distributorCodes } });
  if (storeCodes.length > 0) userWhere.push({ storeCode: { [Op.in]: storeCodes } });

  const includeUser = {
    model: db.User,
    as: 'User',
    required: true,
    attributes: ['userId', 'username', 'firstName', 'lastName', 'phone', 'distributorCode', 'storeCode']
  };
  if (userWhere.length > 0) includeUser.where = { [Op.and]: userWhere };

  const { count, rows } = await db.UserTransaction.findAndCountAll({
    where,
    order: [[orderField, orderDir]],
    limit: limitNum,
    offset,
    attributes: ['id', 'userId', 'type', 'amount', 'currencyCode', 'description', 'metadata', 'createdAt'],
    include: [includeUser]
  });

  const rowsOut = (rows || []).map((r) => {
    const u = r.User || {};
    const metadata = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
    const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || null;
    const username = u.username || fullName || u.phone || null;
    return {
      id: r.id,
      userId: r.userId,
      username: username || String(r.userId),
      userPhone: u.phone || null,
      type: r.type,
      amount: Number(r.amount),
      currencyCode: r.currencyCode || 'SC',
      description: r.description || null,
      gameName: metadata.game_name || null,
      createdAt: r.createdAt || r.created_at,
      storeCode: u.storeCode || null,
      distributorCode: u.distributorCode || null
    };
  });

  return {
    rows: rowsOut,
    total: count != null ? count : 0,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil((count != null ? count : 0) / limitNum)
  };
}

module.exports = { getReportsTransactions };
