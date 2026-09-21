'use strict';

const { isIP } = require('node:net');
const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { normalizeStoreCode } = require('../bonusCodes/resolveSignupBonusCodeForRegister.service');

const CACHE_TTL_MS = 30_000;
/** Sentinel store_code for entries that apply to every partner store. */
const ALL_STORES_STORE_CODE = '*';
/** @type {{ expiresAt: number, byStore: Map<string, { ips: Set<string>, cidrs: string[] }>, global: { ips: Set<string>, cidrs: string[] } }} */
let cache = {
  expiresAt: 0,
  byStore: new Map(),
  global: { ips: new Set(), cidrs: [] }
};
/** In-flight allowlist DB load so concurrent geo checks share one query. */
let cacheLoad = null;

function isAllStoresCode(value) {
  if (value == null) return false;
  const raw = String(value).trim().toLowerCase();
  return raw === '*' || raw === 'all' || raw === '__all__';
}

function normalizeIp(ip) {
  if (!ip) return null;
  let value = String(ip).trim().toLowerCase();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  return value || null;
}

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIPInCidr(ip, cidr) {
  const [network, prefixLength] = cidr.split('/');
  const prefix = Number(prefixLength);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;
  if (isIP(network) !== 4 || isIP(ip) !== 4) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

function parseAllowlistEntry(raw) {
  const value = normalizeIp(raw);
  if (!value) return null;
  if (value.includes('/')) {
    const [network, prefixLength] = value.split('/');
    const prefix = Number(prefixLength);
    if (isIP(network) !== 4 || !Number.isFinite(prefix) || prefix < 0 || prefix > 32) {
      return null;
    }
    return { type: 'cidr', value: `${network}/${prefix}` };
  }
  if (!isIP(value)) return null;
  return { type: 'ip', value };
}

function envAllowlistEntries() {
  const raw = process.env.GEO_IP_ALLOWLIST || '';
  return String(raw)
    .split(',')
    .map((part) => parseAllowlistEntry(part))
    .filter(Boolean);
}

function invalidateIpAllowlistCache() {
  cache = {
    expiresAt: 0,
    byStore: new Map(),
    global: { ips: new Set(), cidrs: [] }
  };
  cacheLoad = null;
}

function emptyBucket() {
  return { ips: new Set(), cidrs: [] };
}

function addParsed(bucket, entry) {
  if (!entry) return;
  if (entry.type === 'ip') bucket.ips.add(entry.value);
  else bucket.cidrs.push(entry.value);
}

async function loadAllowlistCache() {
  const now = Date.now();
  if (cache.expiresAt > now) return cache;
  if (cacheLoad) return cacheLoad;

  cacheLoad = (async () => {
    const rows = await db.GeoIpAllowlist.findAll({
      attributes: ['storeCode', 'ipAddress'],
      raw: true
    });

    const byStore = new Map();
    const global = emptyBucket();

    for (const entry of envAllowlistEntries()) {
      addParsed(global, entry);
    }

    for (const row of rows) {
      if (isAllStoresCode(row.storeCode)) {
        addParsed(global, parseAllowlistEntry(row.ipAddress));
        continue;
      }
      const store = normalizeStoreCode(row.storeCode);
      if (!store) continue;
      if (!byStore.has(store)) byStore.set(store, emptyBucket());
      addParsed(byStore.get(store), parseAllowlistEntry(row.ipAddress));
    }

    cache = { expiresAt: Date.now() + CACHE_TTL_MS, byStore, global };
    return cache;
  })().finally(() => {
    cacheLoad = null;
  });

  return cacheLoad;
}

function matchesBucket(bucket, normalizedIp) {
  if (!bucket) return false;
  if (bucket.ips.has(normalizedIp)) return true;
  if (isIP(normalizedIp) !== 4) return false;
  return bucket.cidrs.some((cidr) => isIPInCidr(normalizedIp, cidr));
}

/**
 * @param {string} ip
 * @param {string|null|undefined} storeCode
 */
async function isIpAllowlisted(ip, storeCode) {
  const normalized = normalizeIp(ip);
  if (!normalized || !isIP(normalized)) return false;

  const data = await loadAllowlistCache();
  if (matchesBucket(data.global, normalized)) return true;

  const store = normalizeStoreCode(storeCode);
  if (!store) return false;
  return matchesBucket(data.byStore.get(store), normalized);
}

function resolveStoreCodeFromReq(req, body = {}) {
  if (req.role === ROLES.STORE_ADMIN) {
    return normalizeStoreCode(req.storeCode);
  }
  if (isAllStoresCode(body.storeCode || req.query?.storeCode || '')) {
    return ALL_STORES_STORE_CODE;
  }
  return normalizeStoreCode(body.storeCode || req.query?.storeCode || '');
}

function assertCanAccessStore(req, storeCode) {
  if (isAllStoresCode(storeCode)) {
    if (req.role === ROLES.MASTER_ADMIN) return;
    const err = new Error('Allowlist entry not found.');
    err.statusCode = 404;
    throw err;
  }
  if (req.role === ROLES.MASTER_ADMIN) return;
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    if (!sc || sc !== storeCode) {
      const err = new Error('Allowlist entry not found.');
      err.statusCode = 404;
      throw err;
    }
    return;
  }
  const err = new Error('Forbidden.');
  err.statusCode = 403;
  throw err;
}

function listScopeWhere(req, query = {}) {
  if (req.role === ROLES.MASTER_ADMIN) {
    const raw =
      query.storeCode && typeof query.storeCode === 'string' ? query.storeCode.trim() : '';
    if (isAllStoresCode(raw)) return { storeCode: ALL_STORES_STORE_CODE };
    const storeCode = raw ? normalizeStoreCode(raw) : null;
    if (storeCode) {
      return { [Op.or]: [{ storeCode }, { storeCode: ALL_STORES_STORE_CODE }] };
    }
    return {};
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    return sc ? { [Op.or]: [{ storeCode: sc }, { storeCode: ALL_STORES_STORE_CODE }] } : { id: -1 };
  }
  return { id: -1 };
}

function serializeRow(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const createdBy = plain.CreatedBy || null;
  return {
    id: plain.id,
    storeCode: plain.storeCode,
    ipAddress: plain.ipAddress,
    note: plain.note || null,
    createdByUserId: plain.createdByUserId || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    createdBy: createdBy
      ? {
          userId: createdBy.userId,
          username: createdBy.username || null,
          email: createdBy.email || null,
          firstName: createdBy.firstName || null
        }
      : null
  };
}

async function listEntries(req, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const clauses = [];
  const scope = listScopeWhere(req, query);
  if (scope && Object.keys(scope).length) clauses.push(scope);

  if (query.search && typeof query.search === 'string' && query.search.trim()) {
    const s = query.search.trim();
    clauses.push({
      [Op.or]: [
        { ipAddress: { [Op.iLike]: `%${s}%` } },
        { note: { [Op.iLike]: `%${s}%` } },
        { storeCode: { [Op.iLike]: `%${s}%` } }
      ]
    });
  }

  const where = clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { [Op.and]: clauses };

  const { count, rows } = await db.GeoIpAllowlist.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    include: [
      {
        model: db.User,
        as: 'CreatedBy',
        attributes: ['userId', 'username', 'email', 'firstName'],
        required: false
      }
    ]
  });

  return {
    entries: rows.map(serializeRow),
    total: count,
    page,
    limit,
    total_pages: Math.ceil(count / limit) || 1
  };
}

async function createEntry(req, body = {}) {
  const parsed = parseAllowlistEntry(body.ipAddress || body.ip || '');
  if (!parsed) {
    const err = new Error('Enter a valid IPv4/IPv6 address or IPv4 CIDR (e.g. 203.0.113.10 or 27.34.66.0/24).');
    err.statusCode = 400;
    throw err;
  }

  const storeCode = resolveStoreCodeFromReq(req, body);
  if (!storeCode) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  if (isAllStoresCode(storeCode) && req.role !== ROLES.MASTER_ADMIN) {
    const err = new Error('Only master admin can add an IP for all stores.');
    err.statusCode = 403;
    throw err;
  }
  assertCanAccessStore(req, storeCode);

  const note =
    body.note != null && String(body.note).trim()
      ? String(body.note).trim().slice(0, 255)
      : null;

  const existing = await db.GeoIpAllowlist.findOne({
    where: { storeCode, ipAddress: parsed.value }
  });
  if (existing) {
    const err = new Error(
      isAllStoresCode(storeCode)
        ? 'This IP / range is already on the allowlist for all stores.'
        : 'This IP / range is already on the allowlist for this store.'
    );
    err.statusCode = 409;
    throw err;
  }

  const row = await db.GeoIpAllowlist.create({
    storeCode,
    ipAddress: parsed.value,
    note,
    createdByUserId: req.user?.userId || null
  });

  invalidateIpAllowlistCache();

  const full = await db.GeoIpAllowlist.findByPk(row.id, {
    include: [
      {
        model: db.User,
        as: 'CreatedBy',
        attributes: ['userId', 'username', 'email', 'firstName'],
        required: false
      }
    ]
  });

  return serializeRow(full);
}

async function deleteEntry(req, id) {
  const row = await db.GeoIpAllowlist.findByPk(id);
  if (!row) {
    const err = new Error('Allowlist entry not found.');
    err.statusCode = 404;
    throw err;
  }
  assertCanAccessStore(
    req,
    isAllStoresCode(row.storeCode) ? ALL_STORES_STORE_CODE : normalizeStoreCode(row.storeCode)
  );
  await row.destroy();
  invalidateIpAllowlistCache();
  return { deleted: true, id };
}

/**
 * Resolve store code for geo middleware from query/body without custom headers
 * (custom headers would force a CORS preflight on the public geo check).
 * Frontends send storeCode on /api/geo/check and clientStoreCode on auth.
 */
function resolveStoreCodeForGeoRequest(req) {
  const fromQuery = req.query?.storeCode || req.query?.clientStoreCode;
  const fromBody = req.body?.clientStoreCode || req.body?.storeCode;
  return normalizeStoreCode(fromQuery || fromBody || '');
}

module.exports = {
  ALL_STORES_STORE_CODE,
  isAllStoresCode,
  normalizeIp,
  parseAllowlistEntry,
  isIpAllowlisted,
  invalidateIpAllowlistCache,
  listEntries,
  createEntry,
  deleteEntry,
  resolveStoreCodeForGeoRequest,
  normalizeStoreCode
};
