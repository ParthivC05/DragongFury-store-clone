'use strict';

const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { seoFromBody, seoToPlain } = require('../cms/seoFields');
const footer = require('../footer/footer.service');

const LEGAL_PAGES = [
  {
    pageKey: 'privacy',
    path: '/privacy',
    title: 'Privacy Policy'
  },
  {
    pageKey: 'terms',
    path: '/terms',
    title: 'Terms & Conditions'
  },
  {
    pageKey: 'responsible-gaming',
    path: '/responsible-gaming',
    title: 'Responsible Gaming'
  }
];

const LEGAL_PAGE_MAP = Object.fromEntries(LEGAL_PAGES.map((page) => [page.pageKey, page]));

const PAGE_KEY_ALIASES = {
  privacy: 'privacy',
  'privacy-policy': 'privacy',
  terms: 'terms',
  'terms-and-conditions': 'terms',
  'terms-of-service': 'terms',
  'responsible-gaming': 'responsible-gaming',
  'responsiblegaming': 'responsible-gaming'
};

function normalizePageKey(raw) {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return PAGE_KEY_ALIASES[key] || null;
}

function catalogPage(pageKey) {
  return LEGAL_PAGE_MAP[pageKey] || null;
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

function htmlHasContent(html) {
  const text = String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Boolean(text);
}

function toPlain(row, catalog) {
  const p = row?.get ? row.get({ plain: true }) : (row || {});
  const pageKey = catalog.pageKey;
  const content = p.content != null ? String(p.content) : '';
  return {
    id: p.id || null,
    storeCode: p.storeCode ?? p.store_code ?? null,
    pageKey,
    path: catalog.path,
    title: (p.title && String(p.title).trim()) || catalog.title,
    content,
    hasContent: htmlHasContent(content),
    ...seoToPlain(p),
    allowIndex: p.allowIndex !== false && p.allow_index !== false,
    isActive: p.isActive !== false && p.is_active !== false,
    createdAt: p.createdAt ?? p.created_at ?? null,
    updatedAt: p.updatedAt ?? p.updated_at ?? null
  };
}

function emptyPlain(storeCode, catalog) {
  return {
    id: null,
    storeCode: storeCode || null,
    pageKey: catalog.pageKey,
    path: catalog.path,
    title: catalog.title,
    content: '',
    hasContent: false,
    metaTitle: null,
    metaDescription: null,
    metaTags: null,
    allowIndex: true,
    isActive: true,
    createdAt: null,
    updatedAt: null
  };
}

function assertKnownPageKey(pageKeyRaw) {
  const pageKey = normalizePageKey(pageKeyRaw);
  const catalog = pageKey ? catalogPage(pageKey) : null;
  if (!catalog) {
    const err = new Error('Unknown legal page. Use privacy, terms, or responsible-gaming.');
    err.statusCode = 400;
    throw err;
  }
  return catalog;
}

async function resolveStoreCodeAdmin(req, payload = {}) {
  if (req.role === ROLES.STORE_ADMIN) {
    const storeCode = footer.normalizeStoreCode(req.storeCode);
    if (!storeCode) {
      const err = new Error('Store admin must have a store code.');
      err.statusCode = 400;
      throw err;
    }
    return storeCode;
  }
  if (req.role === ROLES.MASTER_ADMIN) {
    const storeCode = footer.normalizeStoreCode(payload.storeCode || '');
    if (!storeCode) {
      const err = new Error('storeCode is required.');
      err.statusCode = 400;
      throw err;
    }
    const allowed = footer.getAdminFooterStoreCodes(req);
    if (allowed != null && !allowed.includes(storeCode)) {
      const err = new Error('You do not have footer access for this store.');
      err.statusCode = 403;
      throw err;
    }
    return storeCode;
  }
  const err = new Error('Forbidden.');
  err.statusCode = 403;
  throw err;
}

async function findRow(storeCode, pageKey) {
  return db.LegalPage.findOne({
    where: { storeCode, pageKey }
  });
}

async function listAdmin(req, query = {}) {
  const storeCode = await resolveStoreCodeAdmin(req, query);
  const rows = await db.LegalPage.findAll({
    where: { storeCode }
  });
  const byKey = new Map(rows.map((row) => [row.pageKey, row]));
  return {
    storeCode,
    legal_pages: LEGAL_PAGES.map((catalog) => {
      const row = byKey.get(catalog.pageKey);
      return row ? toPlain(row, catalog) : emptyPlain(storeCode, catalog);
    })
  };
}

async function getAdmin(req, pageKeyRaw, query = {}) {
  const catalog = assertKnownPageKey(pageKeyRaw);
  const storeCode = await resolveStoreCodeAdmin(req, query);
  const row = await findRow(storeCode, catalog.pageKey);
  return {
    storeCode,
    legal_page: row ? toPlain(row, catalog) : emptyPlain(storeCode, catalog)
  };
}

async function upsertAdmin(req, pageKeyRaw, body = {}) {
  const catalog = assertKnownPageKey(pageKeyRaw);
  const storeCode = await resolveStoreCodeAdmin(req, body);
  const title = body.title != null ? String(body.title).trim() : '';
  if (!title) {
    const err = new Error('Title is required.');
    err.statusCode = 400;
    throw err;
  }

  const content = body.content != null ? String(body.content) : '';
  const isActive = body.isActive !== false && body.isActive !== 'false';
  const allowIndex = allowIndexFromBody(body);
  const seo = seoFromBody(body);

  const [row] = await db.LegalPage.findOrCreate({
    where: { storeCode, pageKey: catalog.pageKey },
    defaults: {
      storeCode,
      pageKey: catalog.pageKey,
      title,
      content,
      metaTitle: seo.metaTitle ?? null,
      metaDescription: seo.metaDescription ?? null,
      metaTags: seo.metaTags ?? null,
      allowIndex: allowIndex !== false,
      isActive
    }
  });

  const patch = {
    title,
    content,
    isActive
  };
  if (allowIndex !== undefined) patch.allowIndex = allowIndex;
  Object.assign(patch, seo);
  await row.update(patch);

  return {
    storeCode,
    legal_page: toPlain(row, catalog)
  };
}

async function getPublic(storeCodeRaw, pageKeyRaw) {
  const catalog = assertKnownPageKey(pageKeyRaw);
  const storeCode = footer.normalizeStoreCode(storeCodeRaw || '');
  if (!storeCode) {
    const err = new Error('store_code is required.');
    err.statusCode = 400;
    throw err;
  }

  const row = await findRow(storeCode, catalog.pageKey);
  const plain = row ? toPlain(row, catalog) : emptyPlain(storeCode, catalog);
  const published = plain.isActive !== false && plain.hasContent;

  return {
    store_code: storeCode,
    legal_page: {
      pageKey: plain.pageKey,
      path: plain.path,
      title: plain.title,
      content: published ? plain.content : '',
      metaTitle: published ? plain.metaTitle : null,
      metaDescription: published ? plain.metaDescription : null,
      metaTags: published ? plain.metaTags : null,
      allowIndex: published ? plain.allowIndex : true,
      isActive: plain.isActive !== false,
      updatedAt: published ? plain.updatedAt : null
    }
  };
}

module.exports = {
  LEGAL_PAGES,
  normalizePageKey,
  listAdmin,
  getAdmin,
  upsertAdmin,
  getPublic
};
