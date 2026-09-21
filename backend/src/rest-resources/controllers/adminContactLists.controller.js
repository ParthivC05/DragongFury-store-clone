'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { logger } = require('../../libs/logger');
const { ROLES } = require('../../constants/roles');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const {
  listContacts,
  listFilterOptions,
  exportContacts,
  listDownloads
} = require('../../services/contactLists/contactLists.service');

function hasAccess(req) {
  return req.role === ROLES.MASTER_ADMIN && canAdmin(req, ADMIN_FEATURE_KEYS.CONTACT_LISTS);
}

function parseVerifiedOnly(value) {
  if (value === true || value === 1) return true;
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function queryFilters(query = {}) {
  return {
    listType: query.listType || query.type,
    storeCode: query.storeCode,
    distributorCode: query.distributorCode,
    verifiedOnly: parseVerifiedOnly(query.verifiedOnly),
    search: query.search,
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder || query.order
  };
}

function clientIp(req) {
  const ip = String(req.ip || '').replace(/^::ffff:/, '').slice(0, 64);
  return ip || null;
}

function fail(res, err, fallback) {
  const status = Number(err && err.statusCode) || 500;
  if (status >= 500) {
    logger.error(`Contact lists error: ${err && err.message ? err.message : fallback}`, {
      stack: err && err.stack
    });
    return sendError(res, fallback, status);
  }
  return sendError(res, (err && err.message) || fallback, status);
}

function safeCsvFileName(name) {
  const cleaned = String(name || 'contact-list.csv').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  return cleaned.toLowerCase().endsWith('.csv') ? cleaned : `${cleaned || 'contact-list'}.csv`;
}

function sendCsvFile(res, data) {
  const fileName = safeCsvFileName(data.fileName);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.set('X-Export-Row-Count', String(Number(data.rowCount) || 0));
  return res.status(200).send(data.csv || '');
}

async function list(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to email and mobile number lists.', 403);
    }
    const data = await listContacts(queryFilters(req.query || {}));
    return sendSuccess(res, data);
  } catch (err) {
    return fail(res, err, 'Failed to load contact list.');
  }
}

async function filterOptions(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to email and mobile number lists.', 403);
    }
    const data = await listFilterOptions();
    return sendSuccess(res, data);
  } catch (err) {
    return fail(res, err, 'Failed to load filter options.');
  }
}

async function download(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to email and mobile number lists.', 403);
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const filters = queryFilters(body);
    const actor = {
      userId: req.user?.userId || null,
      email: req.user?.email || null,
      username: req.user?.username || null,
      ipAddress: clientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 512) || null
    };
    const data = await exportContacts(filters, actor);
    return sendCsvFile(res, data);
  } catch (err) {
    return fail(res, err, 'Failed to download contact list.');
  }
}

async function downloads(req, res) {
  try {
    if (!hasAccess(req)) {
      return sendError(res, 'You do not have access to email and mobile number lists.', 403);
    }
    const data = await listDownloads(queryFilters(req.query || {}));
    return sendSuccess(res, data);
  } catch (err) {
    return fail(res, err, 'Failed to load download tracking.');
  }
}

module.exports = {
  list,
  filterOptions,
  download,
  downloads
};
