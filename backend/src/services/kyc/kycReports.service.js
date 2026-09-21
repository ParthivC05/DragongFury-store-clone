'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { getKycConfiguredStoreCodes } = require('./kycSettings.service');
const { getDiditConfig } = require('./didit.client');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

const KYC_STATUSES = ['not_started', 'pending', 'in_review', 'approved', 'declined'];

const KYC_STATUS_LABELS = {
  not_started: 'Not started',
  pending: 'Pending',
  in_review: 'In review',
  approved: 'Approved',
  declined: 'Declined'
};

function parseLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function parsePage(page) {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function resolveDateRange(startDate, endDate) {
  const normalizedStart =
    startDate && String(startDate).trim() && String(startDate).trim() !== 'undefined'
      ? String(startDate).trim()
      : null;
  const normalizedEnd =
    endDate && String(endDate).trim() && String(endDate).trim() !== 'undefined'
      ? String(endDate).trim()
      : null;
  if (!normalizedStart && !normalizedEnd) {
    return { from: null, to: null, rangeStart: null, rangeEnd: null };
  }
  return {
    rangeStart: normalizedStart,
    rangeEnd: normalizedEnd,
    from: normalizedStart ? toDateRangeStart(normalizedStart) : null,
    to: normalizedEnd ? toDateRangeEnd(normalizedEnd) : null
  };
}

/**
 * Restrict reports to stores in KYC_STORE_CODES (Didit-integrated stores only).
 * Returns null when all stores are configured (empty allowlist).
 * Returns [] when a requested store is outside the allowlist.
 */
function resolveAllowedStoreCodes(filterStoreCode) {
  const configured = getKycConfiguredStoreCodes(); // Set|null
  const requested = filterStoreCode ? String(filterStoreCode).trim().toLowerCase() : '';

  if (configured) {
    const allowed = [...configured];
    if (requested) {
      return configured.has(requested) ? [requested] : [];
    }
    return allowed;
  }

  if (requested) return [requested];
  return null;
}

function buildWhere({ storeCode, status, search, startDate, endDate }) {
  const where = { role: ROLES.USER };
  const and = [];
  const allowedStores = resolveAllowedStoreCodes(storeCode);
  const cfg = getDiditConfig();
  const kycWorkflowId = String(cfg.workflowId || '').trim();

  // Empty allowlist match → no rows (e.g. filter store not in KYC_STORE_CODES)
  if (Array.isArray(allowedStores) && allowedStores.length === 0) {
    where.userId = { [Op.eq]: -1 };
    return where;
  }

  // Only Didit KYC-integrated stores (KYC_STORE_CODES), case-insensitive
  if (Array.isArray(allowedStores)) {
    and.push({
      [Op.or]: allowedStores.map((code) => ({
        storeCode: { [Op.iLike]: code }
      }))
    });
  }

  // Identity KYC only — phone OTP sessions leave didit_workflow_id null.
  // Prefer configured DIDIT_WORKFLOW_ID when set.
  if (kycWorkflowId) {
    and.push({ diditWorkflowId: kycWorkflowId });
  } else {
    and.push({ diditWorkflowId: { [Op.ne]: null } });
  }

  const statusVal = status && String(status).trim().toLowerCase();
  if (statusVal && statusVal !== 'all' && KYC_STATUSES.includes(statusVal)) {
    where.kycStatus = statusVal;
  } else {
    // Default "all": players with real identity KYC activity
    and.push({
      [Op.or]: [
        { kycStatus: { [Op.ne]: 'not_started' } },
        { kycUpdatedAt: { [Op.ne]: null } }
      ]
    });
  }

  const q = search && String(search).trim();
  if (q) {
    const like = { [Op.iLike]: `%${q}%` };
    const searchOr = [{ username: like }, { email: like }];
    const asId = Number(q);
    if (Number.isFinite(asId) && Number.isInteger(asId) && String(asId) === q) {
      searchOr.push({ userId: asId });
    }
    and.push({ [Op.or]: searchOr });
  }

  const { from, to } = resolveDateRange(startDate, endDate);
  if (from || to) {
    const range = {};
    if (from) range[Op.gte] = from;
    if (to) range[Op.lte] = to;
    where.kycUpdatedAt = range;
  }

  if (and.length) where[Op.and] = and;
  return where;
}

function mapRow(u) {
  const status = String(u.kycStatus || 'not_started').toLowerCase();
  return {
    userId: u.userId,
    username: u.username || null,
    email: u.email || null,
    firstName: u.firstName || null,
    lastName: u.lastName || null,
    storeCode: u.storeCode || null,
    distributorCode: u.distributorCode || null,
    kycStatus: status,
    kycStatusLabel: KYC_STATUS_LABELS[status] || status,
    kycProvider: u.kycProvider || null,
    diditSessionId: u.diditSessionId || null,
    diditWorkflowId: u.diditWorkflowId || null,
    kycVerifiedAt: u.kycVerifiedAt || null,
    kycUpdatedAt: u.kycUpdatedAt || null,
    kycDeclineReason: u.kycDeclineReason || null
  };
}

/**
 * Paginated KYC verification report rows.
 */
async function getKycReports({
  storeCode,
  status,
  search,
  startDate,
  endDate,
  page,
  limit
} = {}) {
  const where = buildWhere({ storeCode, status, search, startDate, endDate });
  const pageNum = parsePage(page);
  const pageLimit = parseLimit(limit);
  const offset = (pageNum - 1) * pageLimit;

  const { rows, count } = await db.User.findAndCountAll({
    where,
    attributes: [
      'userId',
      'username',
      'email',
      'firstName',
      'lastName',
      'storeCode',
      'distributorCode',
      'kycStatus',
      'kycProvider',
      'diditSessionId',
      'diditWorkflowId',
      'kycVerifiedAt',
      'kycUpdatedAt',
      'kycDeclineReason'
    ],
    order: [
      [db.sequelize.col('kyc_updated_at'), 'DESC NULLS LAST'],
      [db.sequelize.col('user_id'), 'DESC']
    ],
    limit: pageLimit,
    offset,
    raw: true
  });

  return {
    rows: (rows || []).map(mapRow),
    total: count || 0,
    page: pageNum,
    limit: pageLimit
  };
}

/**
 * Status counts for the same filter set (ignores status filter for breakdown).
 */
async function getKycReportsSummary({ storeCode, search, startDate, endDate, status } = {}) {
  // Summary respects store/search/date; if a specific status is selected, still show full breakdown
  // but totalPlayers matches the list filter.
  const listWhere = buildWhere({ storeCode, status, search, startDate, endDate });
  const baseWhere = buildWhere({
    storeCode,
    status: 'all',
    search,
    startDate,
    endDate
  });

  const [totalPlayers, grouped] = await Promise.all([
    db.User.count({ where: listWhere }),
    db.User.findAll({
      where: baseWhere,
      attributes: [
        'kycStatus',
        [db.sequelize.fn('COUNT', db.sequelize.col('User.user_id')), 'count']
      ],
      group: ['User.kyc_status'],
      raw: true
    })
  ]);

  const countByStatus = {};
  for (const s of KYC_STATUSES) countByStatus[s] = 0;
  for (const row of grouped || []) {
    const key = String(row.kycStatus || 'not_started').toLowerCase();
    const n = Number(row.count) || 0;
    if (countByStatus[key] != null) countByStatus[key] += n;
    else countByStatus[key] = n;
  }

  const byStatus = KYC_STATUSES.map((s) => ({
    status: s,
    label: KYC_STATUS_LABELS[s] || s,
    count: countByStatus[s] || 0
  }));

  return {
    totalPlayers: totalPlayers || 0,
    approved: countByStatus.approved || 0,
    pending: (countByStatus.pending || 0) + (countByStatus.in_review || 0),
    declined: countByStatus.declined || 0,
    notStarted: countByStatus.not_started || 0,
    byStatus
  };
}

async function getKycReportsFilterOptions() {
  const statusOptions = KYC_STATUSES.map((s) => ({
    value: s,
    label: KYC_STATUS_LABELS[s] || s
  }));

  const configured = getKycConfiguredStoreCodes();
  if (configured) {
    return {
      statusOptions,
      storeCodes: [...configured].sort()
    };
  }

  const storeRows = await db.User.findAll({
    where: { role: ROLES.STORE_ADMIN },
    attributes: ['storeCode'],
    raw: true
  });
  const storeCodes = [...new Set((storeRows || []).map((r) => r.storeCode).filter(Boolean))].sort();

  return { statusOptions, storeCodes };
}

module.exports = {
  KYC_STATUSES,
  KYC_STATUS_LABELS,
  getKycReports,
  getKycReportsSummary,
  getKycReportsFilterOptions
};
