'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { seoFromBody, seoToPlain } = require('../cms/seoFields');
const {
  sectionsFromBody,
  hasLayout,
  sectionsToHtml,
  emptySections,
  normalizeSections
} = require('./footerPageSections');

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

/**
 * Whether admin role perms grant footer CMS (aligned with canAdmin FOOTER_PAGES).
 */
function adminHasFooterPages(perms) {
  if (!perms || typeof perms !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(perms, ADMIN_FEATURE_KEYS.FOOTER_PAGES)) {
    return perms[ADMIN_FEATURE_KEYS.FOOTER_PAGES] === true;
  }
  return perms[ADMIN_FEATURE_KEYS.HELP_CONTENT] === true ||
    perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] === true;
}

/**
 * Resolve which store codes a master_admin (with admin role) may manage for footer.
 * Returns null = all stores; string[] = limited; [] = none.
 * Super admin (no adminRoleId) and scope "all" → all stores.
 */
function getAdminFooterStoreCodes(req) {
  if (req.role !== ROLES.MASTER_ADMIN) return null;
  if (!req.adminRoleId) return null; // full super admin
  const perms = req.adminPermissions || {};
  if (!adminHasFooterPages(perms)) return [];
  const scope = perms.footer_pages_store_scope === 'particular' ? 'particular' : 'all';
  if (scope !== 'particular') return null;
  const codes = Array.isArray(perms.footer_pages_store_codes)
    ? perms.footer_pages_store_codes.map((c) => normalizeStoreCode(String(c || ''))).filter(Boolean)
    : [];
  // Misconfigured particular with no codes → treat as all stores (don't lock staff out)
  if (codes.length === 0) return null;
  return codes;
}

function assertAdminCanAccessStore(req, storeCode) {
  if (req.role !== ROLES.MASTER_ADMIN) return;
  const allowed = getAdminFooterStoreCodes(req);
  if (allowed == null) return; // all stores
  const sc = normalizeStoreCode(storeCode);
  if (!sc || !allowed.includes(sc)) {
    const err = new Error('You do not have footer access for this store.');
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
      const err = new Error('Not found.');
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
    const allowed = getAdminFooterStoreCodes(req);
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

function toMenuPlain(row, includePages = false) {
  const p = row.get ? row.get({ plain: true }) : row;
  const out = {
    id: p.id,
    storeCode: p.storeCode ?? p.store_code,
    label: p.label,
    sortOrder: p.sortOrder ?? p.sort_order ?? 0,
    isActive: p.isActive ?? p.is_active,
    createdAt: p.createdAt ?? p.created_at,
    updatedAt: p.updatedAt ?? p.updated_at
  };
  if (includePages && Array.isArray(p.pages)) {
    out.pages = p.pages.map((pg) => toPagePlain(pg));
  }
  return out;
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

function safeSections(raw) {
  try {
    return normalizeSections(raw || emptySections());
  } catch {
    return emptySections();
  }
}

function toPagePlain(row) {
  const p = row.get ? row.get({ plain: true }) : row;
  const redirectPath = p.redirectPath ?? p.redirect_path ?? null;
  return {
    id: p.id,
    storeCode: p.storeCode ?? p.store_code,
    menuId: p.menuId ?? p.menu_id,
    title: p.title,
    slug: p.slug,
    content: p.content,
    sections: safeSections(p.sections),
    redirectPath: redirectPath && String(redirectPath).trim() ? String(redirectPath).trim() : null,
    linkType: redirectPath && String(redirectPath).trim() ? 'redirect' : 'content',
    ...seoToPlain(p),
    allowIndex: p.allowIndex !== false && p.allow_index !== false,
    sortOrder: p.sortOrder ?? p.sort_order ?? 0,
    isActive: p.isActive ?? p.is_active,
    createdAt: p.createdAt ?? p.created_at,
    updatedAt: p.updatedAt ?? p.updated_at,
    menuLabel: p.menu?.label || p.menuLabel || null
  };
}

/** Site path (/download) or absolute http(s) URL for external sites. */
function normalizeRedirectPath(raw) {
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return null;
  let s = String(raw).trim();
  if (/^https?:\/\//i.test(s)) {
    let url;
    try {
      url = new URL(s);
    } catch {
      const err = new Error('Invalid redirect URL.');
      err.statusCode = 400;
      throw err;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      const err = new Error('Redirect URL must use http:// or https://.');
      err.statusCode = 400;
      throw err;
    }
    if (!url.hostname) {
      const err = new Error('Invalid redirect URL.');
      err.statusCode = 400;
      throw err;
    }
    const href = url.href;
    if (href.length > 512) {
      const err = new Error('Redirect URL is too long (max 512 characters).');
      err.statusCode = 400;
      throw err;
    }
    return href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    const err = new Error('Use a site path like /download, or a full http(s) URL.');
    err.statusCode = 400;
    throw err;
  }
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(s)) {
    const err = new Error('Redirect path may only use letters, numbers, /, _, and - (or a full http(s) URL).');
    err.statusCode = 400;
    throw err;
  }
  return s;
}

const FOOTER_SETTINGS_KEY = 'footer_settings';

async function readFooterSettings(storeCode) {
  const sc = normalizeStoreCode(storeCode);
  if (!sc) return { showDefaultMenus: true };
  const row = await db.Setting.findOne({
    where: { key: FOOTER_SETTINGS_KEY, storeCode: sc }
  });
  if (!row?.value) return { showDefaultMenus: true };
  try {
    const parsed = JSON.parse(row.value);
    return {
      showDefaultMenus: parsed.showDefaultMenus !== false && parsed.show_default_menus !== false
    };
  } catch {
    return { showDefaultMenus: true };
  }
}

async function writeFooterSettings(storeCode, payload = {}) {
  const sc = normalizeStoreCode(storeCode);
  if (!sc) {
    const err = new Error('storeCode is required.');
    err.statusCode = 400;
    throw err;
  }
  const showDefaultMenus = payload.showDefaultMenus !== false && payload.show_default_menus !== false;
  const value = JSON.stringify({ showDefaultMenus });
  const [row] = await db.Setting.findOrCreate({
    where: { key: FOOTER_SETTINGS_KEY, storeCode: sc },
    defaults: {
      key: FOOTER_SETTINGS_KEY,
      distributorCode: null,
      storeCode: sc,
      value
    }
  });
  await row.update({ value });
  return { showDefaultMenus };
}

async function getSettingsAdmin(req, query = {}) {
  let storeCode;
  if (req.role === ROLES.STORE_ADMIN) {
    storeCode = normalizeStoreCode(req.storeCode);
  } else if (req.role === ROLES.MASTER_ADMIN) {
    storeCode = normalizeStoreCode(query.storeCode || '');
    if (!storeCode) {
      const err = new Error('storeCode is required.');
      err.statusCode = 400;
      throw err;
    }
    assertAdminCanAccessStore(req, storeCode);
  } else {
    const err = new Error('Forbidden.');
    err.statusCode = 403;
    throw err;
  }
  const settings = await readFooterSettings(storeCode);
  return { storeCode, settings };
}

async function updateSettingsAdmin(req, body = {}) {
  let storeCode;
  if (req.role === ROLES.STORE_ADMIN) {
    storeCode = normalizeStoreCode(req.storeCode);
  } else if (req.role === ROLES.MASTER_ADMIN) {
    storeCode = normalizeStoreCode(body.storeCode || '');
    if (!storeCode) {
      const err = new Error('storeCode is required.');
      err.statusCode = 400;
      throw err;
    }
    assertAdminCanAccessStore(req, storeCode);
  } else {
    const err = new Error('Forbidden.');
    err.statusCode = 403;
    throw err;
  }
  const settings = await writeFooterSettings(storeCode, body);
  return { storeCode, settings };
}

async function assertUniqueSlug(storeCode, slug, excludeId = null) {
  const where = { storeCode, slug };
  if (excludeId != null) where.id = { [Op.ne]: excludeId };
  const existing = await db.FooterPage.findOne({ where, attributes: ['id'] });
  if (existing) {
    const err = new Error('Slug already used. Please choose another slug.');
    err.statusCode = 409;
    err.code = 'FOOTER_SLUG_TAKEN';
    throw err;
  }
}

/** App routes that must not be claimed as footer page slugs (root /{slug}). */
const RESERVED_FOOTER_SLUGS = new Set([
  'login', 'signin', 'register', 'signup', 'verify-email', 'check-email',
  'forgot-password', 'reset-password', 'terms', 'privacy', 'responsible-gaming',
  'help', 'support',
  'blog', 'pages', 'link2play', 'install', 'download', 'games', 'casino', 'slots',
  'platform', 'platforms', 'testbona', 'deposit', 'withdraw', 'kyc', 'promotions',
  'spinwheel', 'daily-bonus', 'account', 'settings', 'play', 'auth', 'cashapp',
  'api', 'admin', 'footer', 'faq', 'contact'
]);

function assertSlugAllowed(slug) {
  if (RESERVED_FOOTER_SLUGS.has(slug)) {
    const err = new Error('Slug already used. Please choose another slug.');
    err.statusCode = 409;
    err.code = 'FOOTER_SLUG_TAKEN';
    throw err;
  }
}

/* ---------- Menus ---------- */

async function listMenusAdmin(req, query = {}) {
  const where = listScopeWhere(req, query);
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;

  const rows = await db.FooterMenu.findAll({
    where,
    include: [{
      model: db.FooterPage,
      as: 'pages',
      required: false,
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    }],
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });

  // Sequelize include order is unreliable on hasMany; sort pages in JS
  return {
    footer_menus: rows.map((row) => {
      const plain = toMenuPlain(row, true);
      if (Array.isArray(plain.pages)) {
        plain.pages.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
      }
      return plain;
    })
  };
}

async function getMenuAdmin(req, id) {
  const row = await db.FooterMenu.findByPk(id, {
    include: [{ model: db.FooterPage, as: 'pages', required: false }]
  });
  if (!row) {
    const err = new Error('Footer menu not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  const plain = toMenuPlain(row, true);
  if (Array.isArray(plain.pages)) {
    plain.pages.sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id));
  }
  return plain;
}

async function createMenuAdmin(req, body = {}) {
  const storeCode = await resolveCreateStoreCode(req, body);
  const label = body.label != null ? String(body.label).trim() : '';
  if (!label) {
    const err = new Error('Label is required.');
    err.statusCode = 400;
    throw err;
  }
  const sortOrder = Number.isFinite(parseInt(body.sortOrder, 10))
    ? parseInt(body.sortOrder, 10)
    : 0;
  const isActive = body.isActive !== false && body.isActive !== 'false';

  const row = await db.FooterMenu.create({
    storeCode,
    label,
    sortOrder,
    isActive
  });
  return toMenuPlain(row);
}

async function updateMenuAdmin(req, id, body = {}) {
  const row = await db.FooterMenu.findByPk(id);
  if (!row) {
    const err = new Error('Footer menu not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);

  const patch = {};
  if (body.label != null) {
    const label = String(body.label).trim();
    if (!label) {
      const err = new Error('Label is required.');
      err.statusCode = 400;
      throw err;
    }
    patch.label = label;
  }
  if (body.sortOrder !== undefined) {
    patch.sortOrder = Number.isFinite(parseInt(body.sortOrder, 10))
      ? parseInt(body.sortOrder, 10)
      : 0;
  }
  if (body.isActive !== undefined) {
    patch.isActive = body.isActive !== false && body.isActive !== 'false';
  }
  await row.update(patch);
  return toMenuPlain(row);
}

async function deleteMenuAdmin(req, id) {
  const row = await db.FooterMenu.findByPk(id);
  if (!row) {
    const err = new Error('Footer menu not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  await row.destroy();
  return { deleted: true, id };
}

/* ---------- Pages ---------- */

async function listPagesAdmin(req, query = {}) {
  const where = listScopeWhere(req, query);
  if (query.menuId != null && String(query.menuId).trim() !== '') {
    const menuId = parseInt(query.menuId, 10);
    if (Number.isFinite(menuId)) where.menuId = menuId;
  }
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.search && typeof query.search === 'string' && query.search.trim()) {
    const s = query.search.trim();
    where[Op.or] = [
      { title: { [Op.iLike]: `%${s}%` } },
      { slug: { [Op.iLike]: `%${s}%` } }
    ];
  }

  const rows = await db.FooterPage.findAll({
    where,
    include: [{ model: db.FooterMenu, as: 'menu', attributes: ['id', 'label'], required: false }],
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });

  return { footer_pages: rows.map(toPagePlain) };
}

async function getPageAdmin(req, id) {
  const row = await db.FooterPage.findByPk(id, {
    include: [{ model: db.FooterMenu, as: 'menu', attributes: ['id', 'label'], required: false }]
  });
  if (!row) {
    const err = new Error('Footer page not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  return toPagePlain(row);
}

async function createPageAdmin(req, body = {}) {
  const storeCode = await resolveCreateStoreCode(req, body);
  const menuId = parseInt(body.menuId, 10);
  if (!Number.isFinite(menuId)) {
    const err = new Error('menuId is required.');
    err.statusCode = 400;
    throw err;
  }

  const menu = await db.FooterMenu.findByPk(menuId);
  if (!menu || normalizeStoreCode(menu.storeCode) !== storeCode) {
    const err = new Error('Footer menu not found for this store.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, menu);

  const title = body.title != null ? String(body.title).trim() : '';
  const slug = normalizeSlug(body.slug || title);
  const redirectPath = normalizeRedirectPath(
    body.redirectPath != null ? body.redirectPath : body.redirect_path
  );
  if (body.linkType === 'redirect' && !redirectPath) {
    const err = new Error('Redirect is required (e.g. /download or https://example.com).');
    err.statusCode = 400;
    throw err;
  }
  const sections = redirectPath
    ? emptySections()
    : (sectionsFromBody(body) || emptySections());
  const content = redirectPath
    ? ''
    : (hasLayout(sections)
      ? sectionsToHtml(sections)
      : (body.content != null ? String(body.content) : ''));
  const sortOrder = Number.isFinite(parseInt(body.sortOrder, 10))
    ? parseInt(body.sortOrder, 10)
    : 0;
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

  assertSlugAllowed(slug);
  await assertUniqueSlug(storeCode, slug);

  const seo = seoFromBody(body);
  const row = await db.FooterPage.create({
    storeCode,
    menuId,
    title,
    slug,
    content,
    sections: redirectPath ? emptySections() : sections,
    redirectPath,
    metaTitle: seo.metaTitle ?? null,
    metaDescription: seo.metaDescription ?? null,
    metaTags: seo.metaTags ?? null,
    allowIndex,
    sortOrder,
    isActive
  });
  return toPagePlain(row);
}

async function updatePageAdmin(req, id, body = {}) {
  const row = await db.FooterPage.findByPk(id);
  if (!row) {
    const err = new Error('Footer page not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);

  const patch = {};
  if (body.menuId != null) {
    const menuId = parseInt(body.menuId, 10);
    if (!Number.isFinite(menuId)) {
      const err = new Error('Invalid menuId.');
      err.statusCode = 400;
      throw err;
    }
    const menu = await db.FooterMenu.findByPk(menuId);
    if (!menu || normalizeStoreCode(menu.storeCode) !== normalizeStoreCode(row.storeCode)) {
      const err = new Error('Footer menu not found for this store.');
      err.statusCode = 404;
      throw err;
    }
    patch.menuId = menuId;
  }
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
    assertSlugAllowed(slug);
    await assertUniqueSlug(row.storeCode, slug, row.id);
    patch.slug = slug;
  }

  const linkType = body.linkType === 'redirect' || body.linkType === 'content' ? body.linkType : null;
  let nextRedirectPath = row.redirectPath || null;
  if (linkType === 'content') {
    nextRedirectPath = null;
    patch.redirectPath = null;
  } else if (body.redirectPath !== undefined || body.redirect_path !== undefined) {
    nextRedirectPath = normalizeRedirectPath(
      body.redirectPath !== undefined ? body.redirectPath : body.redirect_path
    );
    patch.redirectPath = nextRedirectPath;
  } else if (linkType === 'redirect') {
    nextRedirectPath = normalizeRedirectPath(body.redirectPath || body.redirect_path || row.redirectPath);
    patch.redirectPath = nextRedirectPath;
    if (!nextRedirectPath) {
      const err = new Error('Redirect is required (e.g. /download or https://example.com).');
      err.statusCode = 400;
      throw err;
    }
  }

  if (nextRedirectPath) {
    patch.content = '';
    patch.sections = emptySections();
  } else {
    const sections = sectionsFromBody(body);
    if (sections) {
      patch.sections = sections;
      if (hasLayout(sections)) {
        patch.content = sectionsToHtml(sections);
      } else if (body.content != null) {
        patch.content = String(body.content);
      }
    } else if (body.content != null) {
      patch.content = String(body.content);
    }
  }

  if (body.sortOrder !== undefined) {
    patch.sortOrder = Number.isFinite(parseInt(body.sortOrder, 10))
      ? parseInt(body.sortOrder, 10)
      : 0;
  }
  if (body.isActive !== undefined) {
    patch.isActive = body.isActive !== false && body.isActive !== 'false';
  }
  const allowIndex = allowIndexFromBody(body);
  if (allowIndex !== undefined) patch.allowIndex = allowIndex;
  Object.assign(patch, seoFromBody(body));

  await row.update(patch);
  return toPagePlain(row);
}

async function deletePageAdmin(req, id) {
  const row = await db.FooterPage.findByPk(id);
  if (!row) {
    const err = new Error('Footer page not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  await row.destroy();
  return { deleted: true, id };
}

/* ---------- Public ---------- */

async function listPublic(storeCodeRaw) {
  const storeCode = normalizeStoreCode(storeCodeRaw || '');
  if (!storeCode) {
    const err = new Error('store_code is required.');
    err.statusCode = 400;
    throw err;
  }

  const settings = await readFooterSettings(storeCode);

  const menus = await db.FooterMenu.findAll({
    where: { storeCode, isActive: true },
    include: [{
      model: db.FooterPage,
      as: 'pages',
      required: false,
      where: { isActive: true },
      attributes: ['id', 'title', 'slug', 'sortOrder', 'isActive', 'redirectPath']
    }],
    order: [['sort_order', 'ASC'], ['id', 'ASC']]
  });

  const footer_menus = menus.map((m) => {
    const plain = toMenuPlain(m, true);
    if (Array.isArray(plain.pages)) {
      plain.pages = plain.pages
        .filter((p) => p.isActive !== false)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.id - b.id))
        .map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          redirectPath: p.redirectPath || null,
          sortOrder: p.sortOrder
        }));
    }
    return {
      id: plain.id,
      label: plain.label,
      sortOrder: plain.sortOrder,
      pages: plain.pages || []
    };
  }).filter((m) => (m.pages || []).length > 0);

  return {
    store_code: storeCode,
    show_default_menus: settings.showDefaultMenus !== false,
    footer_menus
  };
}

async function getPagePublic(storeCodeRaw, { slug, id } = {}) {
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
      const err = new Error('Invalid page id.');
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

  const row = await db.FooterPage.findOne({
    where,
    include: [{
      model: db.FooterMenu,
      as: 'menu',
      attributes: ['id', 'label', 'isActive'],
      required: true,
      where: { isActive: true }
    }]
  });
  if (!row) {
    const err = new Error('Footer page not found.');
    err.statusCode = 404;
    throw err;
  }

  const plain = toPagePlain(row);
  return {
    footer_page: {
      id: plain.id,
      title: plain.title,
      slug: plain.slug,
      content: plain.content,
      sections: plain.sections,
      redirectPath: plain.redirectPath,
      metaTitle: plain.metaTitle,
      metaDescription: plain.metaDescription,
      metaTags: plain.metaTags,
      allowIndex: plain.allowIndex,
      updatedAt: plain.updatedAt
    }
  };
}

module.exports = {
  normalizeStoreCode,
  normalizeSlug,
  getAdminFooterStoreCodes,
  listMenusAdmin,
  getMenuAdmin,
  createMenuAdmin,
  updateMenuAdmin,
  deleteMenuAdmin,
  listPagesAdmin,
  getPageAdmin,
  createPageAdmin,
  updatePageAdmin,
  deletePageAdmin,
  getSettingsAdmin,
  updateSettingsAdmin,
  listPublic,
  getPagePublic
};
