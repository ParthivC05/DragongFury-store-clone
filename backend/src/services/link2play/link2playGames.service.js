'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');

/** Stores that do not use Link2Play. */
const LINK2PLAY_EXCLUDED_STORES = new Set(['casinoslots', 'grandsweeps', 'grandsweep']);

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isLink2PlayStoreAllowed(storeCode) {
  const sc = normalizeStoreCode(storeCode);
  if (!sc) return false;
  return !LINK2PLAY_EXCLUDED_STORES.has(sc);
}

function assertLink2PlayStoreAllowed(storeCode) {
  if (!isLink2PlayStoreAllowed(storeCode)) {
    const err = new Error('Link2Play is not available for this store.');
    err.statusCode = 403;
    throw err;
  }
}

function isSafeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function normalizeOptionalUrl(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (!isSafeHttpUrl(trimmed)) {
    const err = new Error('Links must be valid http(s) URLs.');
    err.statusCode = 400;
    throw err;
  }
  return trimmed;
}

function normalizeImageUrl(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (isSafeHttpUrl(trimmed)) return trimmed;
  const err = new Error('Image must be an uploaded URL or a site path starting with /.');
  err.statusCode = 400;
  throw err;
}

function toBool(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function normalizeCategoryFlags(body = {}) {
  let isPopular = body.isPopular ?? body.is_popular;
  let isLive = body.isLive ?? body.is_live;

  if (isPopular === undefined && isLive === undefined && body.category != null) {
    const cat = String(body.category).trim().toLowerCase();
    isPopular = cat === 'popular';
    isLive = cat === 'live' || cat === 'popular';
  }

  isPopular = toBool(isPopular, false);
  isLive = toBool(isLive, false);

  if (!isPopular && !isLive) {
    const err = new Error('Select at least one category: Popular or Live.');
    err.statusCode = 400;
    throw err;
  }

  return { isPopular, isLive };
}

function assertScope(req, row) {
  assertLink2PlayStoreAllowed(row.storeCode);
  if (req.role === ROLES.MASTER_ADMIN) return;
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    if (!sc || normalizeStoreCode(row.storeCode) !== sc) {
      const err = new Error('Link2Play game not found.');
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
    const storeCode = query.storeCode && typeof query.storeCode === 'string'
      ? normalizeStoreCode(query.storeCode)
      : null;
    if (storeCode) {
      assertLink2PlayStoreAllowed(storeCode);
      return { storeCode };
    }
    return {
      storeCode: { [Op.notIn]: Array.from(LINK2PLAY_EXCLUDED_STORES) }
    };
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    assertLink2PlayStoreAllowed(sc);
    return sc ? { storeCode: sc } : { id: -1 };
  }
  return { id: -1 };
}

async function resolveCreateStoreCode(req, body = {}) {
  if (req.role === ROLES.STORE_ADMIN) {
    const storeCode = normalizeStoreCode(req.storeCode);
    assertLink2PlayStoreAllowed(storeCode);
    if (!storeCode) {
      const err = new Error('Store admin must have a store code.');
      err.statusCode = 400;
      throw err;
    }
    return storeCode;
  }
  if (req.role === ROLES.MASTER_ADMIN) {
    const storeCode = normalizeStoreCode(body.storeCode || '');
    if (!storeCode) {
      const err = new Error('storeCode is required.');
      err.statusCode = 400;
      throw err;
    }
    assertLink2PlayStoreAllowed(storeCode);
    return storeCode;
  }
  const err = new Error('Forbidden.');
  err.statusCode = 403;
  throw err;
}

function toPlain(row) {
  const p = row.get ? row.get({ plain: true }) : row;
  const isPopular = Boolean(p.isPopular ?? p.is_popular);
  const isLive = Boolean(p.isLive ?? p.is_live);
  return {
    id: p.id,
    storeCode: p.storeCode ?? p.store_code,
    name: p.name,
    imageUrl: p.imageUrl ?? p.image_url,
    isPopular,
    isLive,
    linkWeb: p.linkWeb ?? p.link_web ?? null,
    linkAndroid: p.linkAndroid ?? p.link_android ?? null,
    linkIos: p.linkIos ?? p.link_ios ?? null,
    isActive: p.isActive ?? p.is_active,
    createdAt: p.createdAt ?? p.created_at,
    updatedAt: p.updatedAt ?? p.updated_at
  };
}

/** Shape used by user-site Link2Play UIs (DragonFury multi-link + tile stores). */
function toPublicGame(row) {
  const p = toPlain(row);
  const primaryUrl = p.linkWeb || p.linkAndroid || p.linkIos || undefined;
  return {
    id: String(p.id),
    name: p.name,
    image_url: p.imageUrl,
    url: primaryUrl,
    status: 'live',
    popular: p.isPopular,
    isLive: p.isLive,
    isPopular: p.isPopular,
    fromAdmin: true,
    links: {
      web: p.linkWeb || undefined,
      android: p.linkAndroid || undefined,
      ios: p.linkIos || undefined
    }
  };
}

function assertAtLeastOneLink({ linkWeb, linkAndroid, linkIos }) {
  if (!linkWeb && !linkAndroid && !linkIos) {
    const err = new Error('At least one platform link (Web, Android, or iPhone) is required.');
    err.statusCode = 400;
    throw err;
  }
}

async function listAdmin(req, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const where = listScopeWhere(req, query);

  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.category === 'popular') where.isPopular = true;
  if (query.category === 'live') where.isLive = true;
  if (query.search && typeof query.search === 'string' && query.search.trim()) {
    const s = query.search.trim();
    where.name = { [Op.iLike]: `%${s}%` };
  }

  const { count, rows } = await db.Link2PlayGame.findAndCountAll({
    where,
    order: [['id', 'ASC']],
    limit,
    offset
  });

  return {
    link2play_games: rows.map(toPlain),
    total: count,
    page,
    limit,
    total_pages: Math.ceil(count / limit) || 1
  };
}

async function getAdminById(req, id) {
  const row = await db.Link2PlayGame.findByPk(id);
  if (!row) {
    const err = new Error('Link2Play game not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  return toPlain(row);
}

async function createAdmin(req, body = {}) {
  const storeCode = await resolveCreateStoreCode(req, body);
  const name = body.name != null ? String(body.name).trim() : '';
  const imageUrl = normalizeImageUrl(body.imageUrl ?? body.image_url);
  const { isPopular, isLive } = normalizeCategoryFlags(body);
  const linkWeb = normalizeOptionalUrl(body.linkWeb ?? body.link_web);
  const linkAndroid = normalizeOptionalUrl(body.linkAndroid ?? body.link_android);
  const linkIos = normalizeOptionalUrl(body.linkIos ?? body.link_ios);
  const isActive = body.isActive !== false && body.isActive !== 'false';

  if (!name) {
    const err = new Error('Game name is required.');
    err.statusCode = 400;
    throw err;
  }
  assertAtLeastOneLink({ linkWeb, linkAndroid, linkIos });

  const row = await db.Link2PlayGame.create({
    storeCode,
    name,
    imageUrl,
    isPopular,
    isLive,
    linkWeb,
    linkAndroid,
    linkIos,
    isActive
  });
  return toPlain(row);
}

async function updateAdmin(req, id, body = {}) {
  const row = await db.Link2PlayGame.findByPk(id);
  if (!row) {
    const err = new Error('Link2Play game not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);

  const patch = {};
  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) {
      const err = new Error('Game name is required.');
      err.statusCode = 400;
      throw err;
    }
    patch.name = name;
  }
  if (body.imageUrl !== undefined || body.image_url !== undefined) {
    patch.imageUrl = normalizeImageUrl(body.imageUrl ?? body.image_url);
  }

  const categoryTouched =
    body.isPopular !== undefined ||
    body.is_popular !== undefined ||
    body.isLive !== undefined ||
    body.is_live !== undefined ||
    body.category !== undefined;
  if (categoryTouched) {
    if (body.category !== undefined && body.isPopular === undefined && body.isLive === undefined) {
      Object.assign(patch, normalizeCategoryFlags({ category: body.category }));
    } else {
      patch.isPopular = toBool(body.isPopular ?? body.is_popular, row.isPopular);
      patch.isLive = toBool(body.isLive ?? body.is_live, row.isLive);
      if (!patch.isPopular && !patch.isLive) {
        const err = new Error('Select at least one category: Popular or Live.');
        err.statusCode = 400;
        throw err;
      }
    }
  }

  if (body.linkWeb !== undefined || body.link_web !== undefined) {
    patch.linkWeb = normalizeOptionalUrl(body.linkWeb ?? body.link_web);
  }
  if (body.linkAndroid !== undefined || body.link_android !== undefined) {
    patch.linkAndroid = normalizeOptionalUrl(body.linkAndroid ?? body.link_android);
  }
  if (body.linkIos !== undefined || body.link_ios !== undefined) {
    patch.linkIos = normalizeOptionalUrl(body.linkIos ?? body.link_ios);
  }
  if (body.isActive !== undefined) {
    patch.isActive = body.isActive !== false && body.isActive !== 'false';
  }
  if (req.role === ROLES.MASTER_ADMIN && body.storeCode != null) {
    const storeCode = normalizeStoreCode(body.storeCode);
    assertLink2PlayStoreAllowed(storeCode);
    patch.storeCode = storeCode;
  }

  const nextLinks = {
    linkWeb: patch.linkWeb !== undefined ? patch.linkWeb : row.linkWeb,
    linkAndroid: patch.linkAndroid !== undefined ? patch.linkAndroid : row.linkAndroid,
    linkIos: patch.linkIos !== undefined ? patch.linkIos : row.linkIos
  };
  assertAtLeastOneLink(nextLinks);

  await row.update(patch);
  return toPlain(row);
}

async function toggleAdmin(req, id, status) {
  const row = await db.Link2PlayGame.findByPk(id);
  if (!row) {
    const err = new Error('Link2Play game not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  const isActive = status === true || status === 'true';
  await row.update({ isActive });
  return toPlain(row);
}

async function deleteAdmin(req, id) {
  const row = await db.Link2PlayGame.findByPk(id);
  if (!row) {
    const err = new Error('Link2Play game not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  await row.destroy();
  return { deleted: true, id };
}

/** Public list — active Link2Play games for a store (excluded stores return []). */
async function listPublic(storeCodeRaw) {
  const storeCode = normalizeStoreCode(storeCodeRaw || '');
  if (!storeCode) {
    const err = new Error('store_code is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!isLink2PlayStoreAllowed(storeCode)) {
    return { games: [] };
  }

  const rows = await db.Link2PlayGame.findAll({
    where: { storeCode, isActive: true },
    order: [['id', 'ASC']]
  });

  return { games: rows.map(toPublicGame) };
}

module.exports = {
  LINK2PLAY_EXCLUDED_STORES,
  normalizeStoreCode,
  isLink2PlayStoreAllowed,
  listAdmin,
  getAdminById,
  createAdmin,
  updateAdmin,
  toggleAdmin,
  deleteAdmin,
  listPublic
};
