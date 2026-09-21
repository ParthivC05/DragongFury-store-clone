'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const {
  ALL_STORES_STORE_CODE,
  isAllStoresCode,
  normalizeIp,
  parseAllowlistEntry,
  normalizeStoreCode
} = require('../geo/ipAllowlist.service');

const CACHE_TTL_MS = 30_000;
/** @type {{ expiresAt: number, byStore: Map<string, { ips: Set<string>, cidrs: string[] }>, global: { ips: Set<string>, cidrs: string[] } }} */
let cache = {
  expiresAt: 0,
  byStore: new Map(),
  global: { ips: new Set(), cidrs: [] }
};
let cacheLoad = null;

function invalidateFingerprintSignupIpAllowlistCache() {
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

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIPInCidr(ip, cidr) {
  const { isIP } = require('node:net');
  const [network, prefixLength] = cidr.split('/');
  const prefix = Number(prefixLength);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;
  if (isIP(network) !== 4 || isIP(ip) !== 4) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

function matchesBucket(bucket, normalizedIp) {
  if (!bucket) return false;
  if (bucket.ips.has(normalizedIp)) return true;
  const { isIP } = require('node:net');
  if (isIP(normalizedIp) !== 4) return false;
  return bucket.cidrs.some((cidr) => isIPInCidr(normalizedIp, cidr));
}

async function loadAllowlistCache() {
  const now = Date.now();
  if (cache.expiresAt > now) return cache;
  if (cacheLoad) return cacheLoad;

  cacheLoad = (async () => {
    const rows = await db.FingerprintSignupIpAllowlist.findAll({
      attributes: ['storeCode', 'ipAddress'],
      raw: true
    });

    const byStore = new Map();
    const global = emptyBucket();

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

/**
 * @param {string} ip
 * @param {string|null|undefined} storeCode
 */
async function isFingerprintSignupIpAllowlisted(ip, storeCode) {
  const { isIP } = require('node:net');
  const normalized = normalizeIp(ip);
  if (!normalized || !isIP(normalized)) return false;

  const data = await loadAllowlistCache();
  if (matchesBucket(data.global, normalized)) return true;

  const store = normalizeStoreCode(storeCode);
  if (!store) return false;
  return matchesBucket(data.byStore.get(store), normalized);
}

async function isAnyFingerprintSignupIpAllowlisted(ips, storeCode) {
  const list = Array.isArray(ips) ? ips : [ips];
  for (const ip of list) {
    if (await isFingerprintSignupIpAllowlisted(ip, storeCode)) return true;
  }
  return false;
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

  const { count, rows } = await db.FingerprintSignupIpAllowlist.findAndCountAll({
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

  const existing = await db.FingerprintSignupIpAllowlist.findOne({
    where: { storeCode, ipAddress: parsed.value }
  });
  if (existing) {
    const err = new Error(
      isAllStoresCode(storeCode)
        ? 'This IP / range is already on the signup allowlist for all stores.'
        : 'This IP / range is already on the signup allowlist for this store.'
    );
    err.statusCode = 409;
    throw err;
  }

  const row = await db.FingerprintSignupIpAllowlist.create({
    storeCode,
    ipAddress: parsed.value,
    note,
    createdByUserId: req.user?.userId || null
  });

  invalidateFingerprintSignupIpAllowlistCache();

  const full = await db.FingerprintSignupIpAllowlist.findByPk(row.id, {
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
  const row = await db.FingerprintSignupIpAllowlist.findByPk(id);
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
  invalidateFingerprintSignupIpAllowlistCache();
  return { deleted: true, id };
}

module.exports = {
  isFingerprintSignupIpAllowlisted,
  isAnyFingerprintSignupIpAllowlisted,
  invalidateFingerprintSignupIpAllowlistCache,
  listEntries,
  createEntry,
  deleteEntry
};
