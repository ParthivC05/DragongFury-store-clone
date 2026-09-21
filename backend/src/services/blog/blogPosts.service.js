'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { seoFromBody, seoToPlain } = require('../cms/seoFields');

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSlug(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function adminHasBlogPosts(perms) {
  if (!perms || typeof perms !== 'object') return false;
  return perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] === true;
}

/**
 * Resolve which store codes a master_admin (with admin role) may manage for blog posts.
 * Returns null = all stores; string[] = limited; [] = none.
 * Super admin (no adminRoleId) and scope "all" → all stores.
 */
function getAdminBlogStoreCodes(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return null;
  if (!req.adminRoleId) return null;
  const perms = req.adminPermissions || {};
  if (!adminHasBlogPosts(perms)) return [];
  const scope = perms.blog_posts_store_scope === 'particular' ? 'particular' : 'all';
  if (scope !== 'particular') return null;
  const codes = Array.isArray(perms.blog_posts_store_codes)
    ? perms.blog_posts_store_codes.map((c) => normalizeStoreCode(String(c || ''))).filter(Boolean)
    : [];
  if (codes.length === 0) return null;
  return codes;
}

function assertAdminCanAccessStore(req, storeCode) {
  if (req.role !== ROLES.MASTER_ADMIN) return;
  const allowed = getAdminBlogStoreCodes(req);
  if (allowed == null) return;
  const sc = normalizeStoreCode(storeCode);
  if (!sc || !allowed.includes(sc)) {
    const err = new Error('You do not have blog access for this store.');
    err.statusCode = 403;
    throw err;
  }
}

function assertScope(req, row) {
  if (req.role === ROLES.MASTER_ADMIN) {
    assertAdminCanAccessStore(req, row.storeCode);
    return;
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    if (!sc || normalizeStoreCode(row.storeCode) !== sc) {
      const err = new Error('Blog post not found.');
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
    const allowed = getAdminBlogStoreCodes(req);
    const storeCode = query.storeCode && typeof query.storeCode === 'string'
      ? normalizeStoreCode(query.storeCode)
      : null;
    if (allowed != null) {
      if (allowed.length === 0) return { id: -1 };
      if (storeCode) {
        if (!allowed.includes(storeCode)) return { id: -1 };
        return { storeCode };
      }
      return { storeCode: { [Op.in]: allowed } };
    }
    if (storeCode) return { storeCode };
    return {};
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    return sc ? { storeCode: sc } : { id: -1 };
  }
  return { id: -1 };
}

function parseAllowIndex(value) {
  if (value === undefined) return undefined;
  if (value === null) return true;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === 'no' || s === 'noindex') return false;
    if (s === 'true' || s === '1' || s === 'yes' || s === 'index') return true;
  }
  return Boolean(value);
}

function allowIndexFromBody(body = {}) {
  if (body.allowIndex !== undefined || body.allow_index !== undefined) {
    return parseAllowIndex(body.allowIndex ?? body.allow_index);
  }
  if (body.noIndex !== undefined || body.noindex !== undefined) {
    const parsed = parseAllowIndex(body.noIndex ?? body.noindex);
    return parsed === undefined ? undefined : !parsed;
  }
  return undefined;
}

function toPlain(row) {
  const p = row.get ? row.get({ plain: true }) : row;
  return {
    id: p.id,
    storeCode: p.storeCode ?? p.store_code,
    title: p.title,
    slug: p.slug,
    content: p.content,
    category: p.category,
    titleImage: p.titleImage ?? p.title_image,
    ...seoToPlain(p),
    allowIndex: p.allowIndex !== false && p.allow_index !== false,
    isActive: p.isActive ?? p.is_active,
    createdAt: p.createdAt ?? p.created_at,
    updatedAt: p.updatedAt ?? p.updated_at
  };
}

async function listAdmin(req, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const where = listScopeWhere(req, query);

  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.category && typeof query.category === 'string' && query.category.trim()) {
    where.category = query.category.trim();
  }
  if (query.search && typeof query.search === 'string' && query.search.trim()) {
    const s = query.search.trim();
    where[Op.or] = [
      { title: { [Op.iLike]: `%${s}%` } },
      { slug: { [Op.iLike]: `%${s}%` } },
      { category: { [Op.iLike]: `%${s}%` } }
    ];
  }

  const { count, rows } = await db.BlogPost.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  return {
    blog_posts: rows.map(toPlain),
    total: count,
    page,
    limit,
    total_pages: Math.ceil(count / limit) || 1
  };
}

async function getAdminById(req, id) {
  const row = await db.BlogPost.findByPk(id);
  if (!row) {
    const err = new Error('Blog post not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  return toPlain(row);
}

async function resolveCreateStoreCode(req, body) {
  if (req.role === ROLES.STORE_ADMIN) {
    const storeCode = normalizeStoreCode(req.storeCode);
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
    assertAdminCanAccessStore(req, storeCode);
    return storeCode;
  }
  const err = new Error('Forbidden.');
  err.statusCode = 403;
  throw err;
}

async function assertUniqueSlug(storeCode, slug, excludeId = null) {
  const where = { storeCode, slug };
  if (excludeId != null) where.id = { [Op.ne]: excludeId };
  const existing = await db.BlogPost.findOne({ where, attributes: ['id'] });
  if (existing) {
    const err = new Error('A blog post with this slug already exists for this store.');
    err.statusCode = 409;
    throw err;
  }
}

async function createAdmin(req, body = {}) {
  const storeCode = await resolveCreateStoreCode(req, body);
  const title = body.title != null ? String(body.title).trim() : '';
  const slug = normalizeSlug(body.slug || title);
  const content = body.content != null ? String(body.content) : '';
  const category = body.category != null && String(body.category).trim()
    ? String(body.category).trim()
    : null;
  const titleImage = body.titleImage != null && String(body.titleImage).trim()
    ? String(body.titleImage).trim()
    : null;
  const isActive = body.isActive !== false && body.isActive !== 'false';
  const allowIndex = allowIndexFromBody(body) !== false;

  if (!title) {
    const err = new Error('Title is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    const err = new Error('Slug is required and may only contain a-z, 0-9, and hyphens.');
    err.statusCode = 400;
    throw err;
  }
  if (!titleImage || !/^https?:\/\//i.test(titleImage)) {
    const err = new Error('Cover image is required. Please upload an image.');
    err.statusCode = 400;
    throw err;
  }

  await assertUniqueSlug(storeCode, slug);

  const seo = seoFromBody(body);
  const row = await db.BlogPost.create({
    storeCode,
    title,
    slug,
    content,
    category,
    titleImage,
    metaTitle: seo.metaTitle ?? null,
    metaDescription: seo.metaDescription ?? null,
    metaTags: seo.metaTags ?? null,
    allowIndex,
    isActive
  });
  return toPlain(row);
}

async function updateAdmin(req, id, body = {}) {
  const row = await db.BlogPost.findByPk(id);
  if (!row) {
    const err = new Error('Blog post not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);

  const patch = {};
  if (body.title != null) {
    const title = String(body.title).trim();
    if (!title) {
      const err = new Error('Title is required.');
      err.statusCode = 400;
      throw err;
    }
    patch.title = title;
  }
  if (body.slug != null) {
    const slug = normalizeSlug(body.slug);
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      const err = new Error('Slug may only contain a-z, 0-9, and hyphens.');
      err.statusCode = 400;
      throw err;
    }
    await assertUniqueSlug(row.storeCode, slug, row.id);
    patch.slug = slug;
  }
  if (body.content != null) patch.content = String(body.content);
  if (body.category !== undefined) {
    patch.category = body.category != null && String(body.category).trim()
      ? String(body.category).trim()
      : null;
  }
  if (body.titleImage !== undefined) {
    const nextImage = body.titleImage != null && String(body.titleImage).trim()
      ? String(body.titleImage).trim()
      : null;
    if (!nextImage || !/^https?:\/\//i.test(nextImage)) {
      const err = new Error('Cover image is required. Please upload an image.');
      err.statusCode = 400;
      throw err;
    }
    patch.titleImage = nextImage;
  } else if (!row.titleImage) {
    const err = new Error('Cover image is required. Please upload an image.');
    err.statusCode = 400;
    throw err;
  }
  if (body.isActive !== undefined) {
    patch.isActive = body.isActive !== false && body.isActive !== 'false';
  }
  const allowIndex = allowIndexFromBody(body);
  if (allowIndex !== undefined) patch.allowIndex = allowIndex;
  Object.assign(patch, seoFromBody(body));
  if (req.role === ROLES.MASTER_ADMIN && body.storeCode != null) {
    const storeCode = normalizeStoreCode(body.storeCode);
    if (!storeCode) {
      const err = new Error('storeCode is required.');
      err.statusCode = 400;
      throw err;
    }
    assertAdminCanAccessStore(req, storeCode);
    const nextSlug = patch.slug || row.slug;
    await assertUniqueSlug(storeCode, nextSlug, row.id);
    patch.storeCode = storeCode;
  }

  await row.update(patch);
  return toPlain(row);
}

async function toggleAdmin(req, id, status) {
  const row = await db.BlogPost.findByPk(id);
  if (!row) {
    const err = new Error('Blog post not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  const isActive = status === true || status === 'true';
  await row.update({ isActive });
  return toPlain(row);
}

async function deleteAdmin(req, id) {
  const row = await db.BlogPost.findByPk(id);
  if (!row) {
    const err = new Error('Blog post not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  await row.destroy();
  return { deleted: true, id };
}

/** Public list — active posts for a store only. */
async function listPublic(storeCodeRaw, query = {}) {
  const storeCode = normalizeStoreCode(storeCodeRaw || '');
  if (!storeCode) {
    const err = new Error('store_code is required.');
    err.statusCode = 400;
    throw err;
  }

  const where = { storeCode, isActive: true };
  if (query.category && typeof query.category === 'string' && query.category.trim()) {
    where.category = query.category.trim();
  }

  const rows = await db.BlogPost.findAll({
    where,
    order: [['created_at', 'DESC']],
    attributes: ['id', 'title', 'slug', 'category', 'titleImage', 'metaDescription', 'allowIndex', 'created_at', 'updated_at']
  });

  return { blog_posts: rows.map(toPlain) };
}

/** Public detail by slug (or id) for a store. */
async function getPublic(storeCodeRaw, { slug, id } = {}) {
  const storeCode = normalizeStoreCode(storeCodeRaw || '');
  if (!storeCode) {
    const err = new Error('store_code is required.');
    err.statusCode = 400;
    throw err;
  }

  const where = { storeCode, isActive: true };
  if (id != null && String(id).trim() !== '') {
    const parsed = parseInt(id, 10);
    if (!Number.isFinite(parsed)) {
      const err = new Error('Invalid blog id.');
      err.statusCode = 400;
      throw err;
    }
    where.id = parsed;
  } else if (slug && typeof slug === 'string' && slug.trim()) {
    where.slug = normalizeSlug(slug);
  } else {
    const err = new Error('slug or id is required.');
    err.statusCode = 400;
    throw err;
  }

  const row = await db.BlogPost.findOne({ where });
  if (!row) {
    const err = new Error('Blog post not found.');
    err.statusCode = 404;
    throw err;
  }
  return { blog_post: toPlain(row) };
}

module.exports = {
  normalizeStoreCode,
  normalizeSlug,
  listAdmin,
  getAdminById,
  createAdmin,
  updateAdmin,
  toggleAdmin,
  deleteAdmin,
  listPublic,
  getPublic
};
