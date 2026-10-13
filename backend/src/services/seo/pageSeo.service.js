'use strict';

const db = require('../../db/models');
const {
  originForStore,
  hostFromOrigin,
  schemaFromBody,
  buildManagedSchema
} = require('./pageSchema.service');

const COMMON_PAGES = [
  { pageKey: 'home', path: '/', label: 'Home' },
  { pageKey: 'faq', path: '/faq', label: 'FAQ' },
  { pageKey: 'help', path: '/help', label: 'Help' },
  { pageKey: 'casino', path: '/casino', label: 'Casino' },
  { pageKey: 'bonus', path: '/bonus', label: 'Bonus' },
  { pageKey: 'platform', path: '/platform', label: 'Platforms' },
  { pageKey: 'link2play', path: '/link2play', label: 'Link2Play' },
  { pageKey: 'contact', path: '/contact', label: 'Contact' }
];

const PAGE_BY_KEY = new Map(COMMON_PAGES.map((item) => [item.pageKey, item]));
const PAGE_BY_PATH = new Map(COMMON_PAGES.map((item) => [item.path, item]));

function fail(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function normalizeStoreCode(str) {
  return String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePath(raw) {
  let path = String(raw || '/').split('?')[0].split('#')[0] || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path === '/slots') path = '/casino';
  if (path === '/index.html') path = '/';
  return path || '/';
}

function keyFromPath(path) {
  const spec = PAGE_BY_PATH.get(normalizePath(path));
  return spec ? spec.pageKey : '';
}

function specFromKey(pageKey) {
  const key = String(pageKey || '').trim().toLowerCase().replace(/^\/+/, '');
  if (key === 'home' || key === '') return PAGE_BY_KEY.get('home');
  return PAGE_BY_KEY.get(key) || null;
}

function originPath(origin, path) {
  const base = String(origin || '').replace(/\/$/, '');
  if (!path || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function escapeAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ');
}

function replaceMeta(html, attr, key, value) {
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(value)}">`;
  const re = new RegExp(`<meta\\b[^>]*\\b${attr}\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  if (re.test(html)) return html.replace(re, tag);
  return html.replace('</title>', `</title>\n    ${tag}`);
}

function pageAuto({ origin, storeLabel, spec, saved }) {
  const base = String(origin || '').replace(/\/$/, '');
  const url = saved.canonicalUrl || originPath(origin, spec.path);
  const label = storeLabel || hostFromOrigin(origin);
  return {
    name: saved.metaTitle || spec.label,
    description: saved.metaDescription,
    url,
    image: '',
    author: label,
    logo: `${base}/logo.png`,
    breadcrumbs: [
      { name: 'Home', url: `${base}/` },
      ...(spec.path === '/' ? [] : [{ name: spec.label, url }])
    ]
  };
}

function present(row, { origin, spec, storeLabel }) {
  const plain = row?.get ? row.get({ plain: true }) : row || {};
  const metaTitle = String(plain.metaTitle || plain.meta_title || '').trim();
  const metaDescription = String(plain.metaDescription || plain.meta_description || '').trim();
  const metaTags = String(plain.metaTags || plain.meta_tags || '').trim();
  const canonicalUrl = String(plain.canonicalUrl || plain.canonical_url || '').trim();
  const allowIndex = plain.allowIndex !== false && plain.allow_index !== false;
  const schemaFields = {
    schemaEnabled: plain.schemaEnabled !== false && plain.schema_enabled !== false,
    schemaType: plain.schemaType || plain.schema_type || 'WebPage',
    schemaFields: plain.schemaFields || plain.schema_fields || {},
    schemaCustom: plain.schemaCustom || plain.schema_custom || ''
  };
  let schema = null;
  let schemaError = '';
  try {
    schema = buildManagedSchema({
      enabled: schemaFields.schemaEnabled,
      type: schemaFields.schemaType,
      fields: schemaFields.schemaFields,
      custom: schemaFields.schemaCustom,
      auto: pageAuto({
        origin,
        storeLabel,
        spec,
        saved: { metaTitle, metaDescription, canonicalUrl: canonicalUrl || originPath(origin, spec.path) }
      })
    });
  } catch (err) {
    schemaError = err.message || 'Schema JSON-LD is not valid JSON.';
  }
  return {
    pageKey: spec.pageKey,
    path: spec.path,
    label: spec.label,
    metaTitle,
    metaDescription,
    metaTags,
    canonicalUrl,
    allowIndex,
    ...schemaFields,
    schema,
    schemaError,
    publicCanonical: allowIndex ? (canonicalUrl || originPath(origin, spec.path)) : '',
    robots: allowIndex ? 'index, follow' : 'noindex, nofollow'
  };
}

async function listAdmin(storeCode, { origin, storeLabel } = {}) {
  const code = normalizeStoreCode(storeCode);
  if (!code) fail('storeCode is required.');
  const resolvedOrigin = origin || originForStore(code);
  const label = storeLabel || hostFromOrigin(resolvedOrigin);
  const rows = await db.PageSchema.findAll({ where: { storeCode: code } });
  const byKey = new Map(rows.map((row) => [row.pageKey, row]));
  return {
    pages: COMMON_PAGES.map((spec) =>
      present(byKey.get(spec.pageKey), { origin: resolvedOrigin, spec, storeLabel: label })
    )
  };
}

async function getAdmin(storeCode, pageKey, { origin, storeLabel } = {}) {
  const spec = specFromKey(pageKey);
  if (!spec) fail('Unknown common page.', 404);
  const code = normalizeStoreCode(storeCode);
  if (!code) fail('storeCode is required.');
  const resolvedOrigin = origin || originForStore(code);
  const row = await db.PageSchema.findOne({ where: { storeCode: code, pageKey: spec.pageKey } });
  return present(row, {
    origin: resolvedOrigin,
    spec,
    storeLabel: storeLabel || hostFromOrigin(resolvedOrigin)
  });
}

async function saveAdmin(storeCode, pageKey, body = {}, { origin, storeLabel } = {}) {
  const spec = specFromKey(pageKey);
  if (!spec) fail('Unknown common page.', 404);
  const code = normalizeStoreCode(storeCode);
  if (!code) fail('storeCode is required.');
  const schemaSaved = schemaFromBody(body, 'WebPage');
  const payload = {
    ...schemaSaved,
    metaTitle: String(body.metaTitle || body.meta_title || '').trim() || null,
    metaDescription: String(body.metaDescription || body.meta_description || '').trim() || null,
    metaTags: String(body.metaTags || body.meta_tags || '').trim() || null,
    canonicalUrl: String(body.canonicalUrl || body.canonical_url || '').trim() || null,
    allowIndex: body.allowIndex !== false && body.allow_index !== false
  };
  const [row] = await db.PageSchema.findOrCreate({
    where: { storeCode: code, pageKey: spec.pageKey },
    defaults: { storeCode: code, pageKey: spec.pageKey, ...payload }
  });
  await row.update(payload);
  return getAdmin(code, spec.pageKey, { origin, storeLabel });
}

async function getPublic(storeCode, path, { origin, storeLabel } = {}) {
  const spec = PAGE_BY_PATH.get(normalizePath(path));
  if (!spec) return null;
  const code = normalizeStoreCode(storeCode);
  if (!code) return null;
  const resolvedOrigin = origin || originForStore(code);
  const row = await db.PageSchema.findOne({ where: { storeCode: code, pageKey: spec.pageKey } });
  if (!row) return null;
  const saved = present(row, {
    origin: resolvedOrigin,
    spec,
    storeLabel: storeLabel || hostFromOrigin(resolvedOrigin)
  });
  const hasMeta = !!(saved.metaTitle || saved.metaDescription || saved.canonicalUrl || saved.allowIndex === false || saved.schema);
  return hasMeta ? saved : null;
}

async function listPublic(storeCode, { origin, storeLabel } = {}) {
  const { pages } = await listAdmin(storeCode, { origin, storeLabel });
  const map = {};
  for (const page of pages) {
    if (!page.metaTitle && !page.metaDescription && !page.canonicalUrl && page.allowIndex !== false && !page.schema) {
      continue;
    }
    map[page.path] = {
      title: page.metaTitle,
      description: page.metaDescription,
      keywords: page.metaTags,
      canonical: page.publicCanonical,
      robots: page.robots,
      schema: page.schema
    };
  }
  return { pages: map };
}

function overlayParts(parts, saved) {
  if (!parts || !saved) return parts;
  const alreadyHasJsonLd = /application\/ld\+json/.test(String(parts.extraHead || ''));
  const extra = [
    saved.schema && !alreadyHasJsonLd
      ? `  <script type="application/ld+json" id="pj-schema-page">${JSON.stringify(saved.schema)}</script>`
      : '',
    saved.metaTags
      ? `  <meta name="keywords" content="${escapeAttr(saved.metaTags)}">`
      : ''
  ].filter(Boolean).join('\n');
  return {
    ...parts,
    title: saved.metaTitle || parts.title,
    description: saved.metaDescription || parts.description,
    canonical: saved.allowIndex === false ? '' : (saved.canonicalUrl || parts.canonical),
    robots: saved.robots || parts.robots,
    extraHead: [extra, parts.extraHead].filter(Boolean).join('\n')
  };
}

function overlayHtml(html, saved) {
  if (!html || !saved) return html;
  let next = String(html);
  if (saved.metaTitle) {
    next = next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(saved.metaTitle)}</title>`);
    next = replaceMeta(next, 'property', 'og:title', saved.metaTitle);
    next = replaceMeta(next, 'name', 'twitter:title', saved.metaTitle);
  }
  if (saved.metaDescription) {
    next = replaceMeta(next, 'name', 'description', saved.metaDescription);
    next = replaceMeta(next, 'property', 'og:description', saved.metaDescription);
    next = replaceMeta(next, 'name', 'twitter:description', saved.metaDescription);
  }
  if (saved.metaTags) next = replaceMeta(next, 'name', 'keywords', saved.metaTags);
  next = replaceMeta(next, 'name', 'robots', saved.robots || 'index, follow');
  if (saved.allowIndex === false || !saved.publicCanonical) {
    next = next.replace(/\s*<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi, '');
  } else {
    const canonicalTag = `<link rel="canonical" href="${escapeAttr(saved.publicCanonical)}">`;
    if (/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.test(next)) {
      next = next.replace(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i, canonicalTag);
    } else {
      next = next.replace('</title>', `</title>\n    ${canonicalTag}`);
    }
    next = replaceMeta(next, 'property', 'og:url', saved.publicCanonical);
  }
  if (saved.schema) {
    const tag = `  <script type="application/ld+json" id="pj-schema-page">${JSON.stringify(saved.schema)}</script>`;
    if (/id=["']pj-schema-page["']/.test(next) || /id=["']pj-schema-webpage["']/.test(next)) {
      next = next.replace(/<script type=["']application\/ld\+json["'] id=["']pj-schema-(?:page|webpage)["'][\s\S]*?<\/script>/i, tag);
    } else if (!/<script[^>]*type=["']application\/ld\+json["']/i.test(next) && /<\/head>/i.test(next)) {
      next = next.replace(/<\/head>/i, `${tag}\n</head>`);
    }
  }
  return next;
}

module.exports = {
  COMMON_PAGES,
  keyFromPath,
  specFromKey,
  listAdmin,
  getAdmin,
  saveAdmin,
  getPublic,
  listPublic,
  overlayParts,
  overlayHtml
};
