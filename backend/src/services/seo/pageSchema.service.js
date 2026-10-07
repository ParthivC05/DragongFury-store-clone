'use strict';

const PLAYJUWA = 'dragonfury';
const PLAYJUWA_ORIGIN = 'https://dragonfury.casino';

const SCHEMA_TYPES = ['WebPage', 'BlogPosting', 'Organization', 'Breadcrumb', 'Custom'];

function isPlayjuwa(storeCode) {
  return String(storeCode || '').trim().toLowerCase() === PLAYJUWA;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function prefer(saved, auto) {
  const next = clean(saved);
  return next || clean(auto);
}

function isoDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function originBase(origin) {
  return clean(origin).replace(/\/$/, '') || PLAYJUWA_ORIGIN;
}

function parseCustomSchema(raw) {
  let text = clean(raw);
  if (!text) {
    const err = new Error('Paste the JSON-LD schema.');
    err.statusCode = 400;
    throw err;
  }
  const wrapped = text.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (wrapped) text = wrapped[1].trim();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const err = new Error('Schema JSON-LD is not valid JSON.');
    err.statusCode = 400;
    throw err;
  }
  if (!data || typeof data !== 'object') {
    const err = new Error('Schema JSON-LD must be a JSON object.');
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(data) && !data['@context']) data['@context'] = 'https://schema.org';
  return data;
}

function sanitizeFields(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fields = {};
  ['name', 'description', 'url', 'image', 'author', 'logo', 'datePublished', 'dateModified'].forEach((key) => {
    const value = clean(src[key]).slice(0, 2000);
    if (value) fields[key] = value;
  });
  if (Array.isArray(src.breadcrumbs)) {
    const crumbs = src.breadcrumbs
      .slice(0, 8)
      .map((item) => ({
        name: clean(item?.name).slice(0, 300),
        url: clean(item?.url || item?.item).slice(0, 1024)
      }))
      .filter((item) => item.name || item.url);
    if (crumbs.length) fields.breadcrumbs = crumbs;
  }
  return fields;
}

function breadcrumbSchema(crumbs) {
  const list = (Array.isArray(crumbs) ? crumbs : [])
    .map((item) => ({
      name: clean(item?.name),
      item: clean(item?.url || item?.item)
    }))
    .filter((item) => item.name && item.item);
  if (!list.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.item
    }))
  };
}

function buildManagedSchema({ enabled, type, fields, custom, auto }) {
  if (enabled === false) return null;
  const kind = SCHEMA_TYPES.includes(type) ? type : 'WebPage';
  if (kind === 'Custom') return parseCustomSchema(custom);
  const saved = fields && typeof fields === 'object' ? fields : {};
  const source = auto || {};
  const name = prefer(saved.name, source.name);
  const description = prefer(saved.description, source.description);
  const url = prefer(saved.url, source.url);
  const image = prefer(saved.image, source.image);
  const author = prefer(saved.author, source.author);
  const logo = prefer(saved.logo, source.logo);
  const datePublished = prefer(saved.datePublished, source.datePublished);
  const dateModified = prefer(saved.dateModified, source.dateModified);

  if (kind === 'WebPage') {
    const schema = { '@context': 'https://schema.org', '@type': 'WebPage' };
    if (name) schema.name = name;
    if (description) schema.description = description;
    if (url) schema.url = url;
    return schema;
  }

  if (kind === 'BlogPosting') {
    const schema = { '@context': 'https://schema.org', '@type': 'BlogPosting' };
    if (name) schema.headline = name;
    if (description) schema.description = description;
    if (url) schema.mainEntityOfPage = url;
    if (image) schema.image = image;
    if (datePublished) schema.datePublished = datePublished;
    if (dateModified) schema.dateModified = dateModified;
    if (author) {
      schema.author = { '@type': 'Organization', name: author };
      schema.publisher = { '@type': 'Organization', name: author };
    }
    return schema;
  }

  if (kind === 'Organization') {
    const schema = { '@context': 'https://schema.org', '@type': 'Organization' };
    if (name) schema.name = name;
    if (url) schema.url = url;
    if (logo) schema.logo = logo;
    if (description) schema.description = description;
    return schema;
  }

  const customCrumbs = Array.isArray(saved.breadcrumbs) && saved.breadcrumbs.length
    ? saved.breadcrumbs
    : source.breadcrumbs;
  return breadcrumbSchema(customCrumbs);
}

function blogAuto({ origin, storeLabel, post }) {
  const base = originBase(origin);
  const slug = clean(post?.slug);
  const ownUrl = `${base}/blog/${slug}`;
  const url = clean(post?.canonicalUrl || post?.canonical_url) || ownUrl;
  const title = clean(post?.title);
  return {
    name: clean(post?.metaTitle || post?.meta_title) || title,
    description: clean(post?.metaDescription || post?.meta_description),
    url,
    image: clean(post?.titleImage || post?.title_image),
    author: clean(storeLabel) || 'dragonfury.casino',
    logo: `${base}/logo.png`,
    datePublished: isoDate(post?.createdAt || post?.created_at),
    dateModified: isoDate(post?.updatedAt || post?.updated_at || post?.createdAt || post?.created_at),
    breadcrumbs: [
      { name: 'Home', url: `${base}/` },
      { name: 'Blog', url: `${base}/blog` },
      { name: title || 'Post', url }
    ]
  };
}

function homeAuto({ origin, storeLabel }) {
  const base = originBase(origin);
  const label = clean(storeLabel) || 'dragonfury.casino';
  const url = `${base}/`;
  return {
    name: `${label} | USA Sweepstakes Casino Games & Bonuses`,
    description: `Play sweepstakes casino games online with ${label}. Explore platforms, fish games, bonuses, and secure play across the USA.`,
    url,
    image: '',
    author: label,
    logo: `${base}/logo.png`,
    breadcrumbs: [{ name: 'Home', url }]
  };
}

function schemaFromBody(body = {}, defaultType) {
  const enabled = body.schemaEnabled !== false && body.schemaEnabled !== 'false';
  const type = SCHEMA_TYPES.includes(body.schemaType) ? body.schemaType : defaultType;
  const fields = sanitizeFields(body.schemaFields);
  const custom = body.schemaCustom != null ? String(body.schemaCustom) : '';
  if (enabled && type === 'Custom') parseCustomSchema(custom);
  return {
    schemaEnabled: enabled,
    schemaType: type,
    schemaFields: fields,
    schemaCustom: custom || null
  };
}

function schemaForBlogPost({ origin, storeLabel, post }) {
  if (!isPlayjuwa(post?.storeCode || post?.store_code)) return undefined;
  const auto = blogAuto({ origin, storeLabel, post });
  try {
    return buildManagedSchema({
      enabled: post.schemaEnabled !== false && post.schema_enabled !== false,
      type: post.schemaType || post.schema_type || 'BlogPosting',
      fields: post.schemaFields || post.schema_fields || {},
      custom: post.schemaCustom || post.schema_custom || '',
      auto
    });
  } catch {
    return null;
  }
}


function hostFromOrigin(origin) {
  return originBase(origin).replace(/^https?:\/\//, '');
}

function contentSchema(page, auto, defaultType) {
  try {
    return buildManagedSchema({
      enabled: page.schemaEnabled !== false && page.schema_enabled !== false,
      type: page.schemaType || page.schema_type || defaultType,
      fields: page.schemaFields || page.schema_fields || {},
      custom: page.schemaCustom || page.schema_custom || '',
      auto
    });
  } catch {
    return null;
  }
}

function footerAuto({ origin, storeLabel, page }) {
  const base = originBase(origin);
  const slug = clean(page?.slug);
  const url = slug ? `${base}/${slug}` : `${base}/`;
  const title = clean(page?.title);
  const label = clean(storeLabel) || hostFromOrigin(base);
  return {
    name: clean(page?.metaTitle || page?.meta_title) || title,
    description: clean(page?.metaDescription || page?.meta_description),
    url,
    image: '',
    author: label,
    logo: `${base}/logo.png`,
    datePublished: isoDate(page?.createdAt || page?.created_at),
    dateModified: isoDate(page?.updatedAt || page?.updated_at || page?.createdAt || page?.created_at),
    breadcrumbs: [
      { name: 'Home', url: `${base}/` },
      { name: title || 'Page', url }
    ]
  };
}

function gameAuto({ origin, storeLabel, page }) {
  const base = originBase(origin);
  const slug = clean(page?.slug);
  const ownUrl = `${base}/games/${slug}`;
  const url = clean(page?.canonicalUrl || page?.canonical_url) || ownUrl;
  const title = clean(page?.name || page?.title);
  const label = clean(storeLabel) || hostFromOrigin(base);
  return {
    name: clean(page?.metaTitle || page?.meta_title) || title,
    description: clean(page?.metaDescription || page?.meta_description) || clean(page?.heroLead || page?.hero_lead),
    url,
    image: clean(page?.imageUrl || page?.image_url || page?.image || page?.defaultImage || page?.default_image),
    author: label,
    logo: `${base}/logo.png`,
    datePublished: isoDate(page?.createdAt || page?.created_at),
    dateModified: isoDate(page?.updatedAt || page?.updated_at || page?.createdAt || page?.created_at),
    breadcrumbs: [
      { name: 'Home', url: `${base}/` },
      { name: 'Games', url: `${base}/games` },
      { name: title || 'Game', url }
    ]
  };
}

function schemaForFooterPage({ origin, storeLabel, page }) {
  if (!isPlayjuwa(page?.storeCode || page?.store_code)) return undefined;
  if (clean(page?.redirectPath || page?.redirect_path)) return null;
  return contentSchema(page, footerAuto({ origin, storeLabel, page }), 'WebPage');
}

function schemaForGamePage({ origin, storeLabel, page }) {
  const store = String(page?.storeCode || page?.store_code || '').trim().toLowerCase();
  if (store !== 'playjuwa' && store !== 'dragonfury') return undefined;
  if (!isPlayjuwa(store)) return undefined;
  return contentSchema(page, gameAuto({ origin, storeLabel, page }), 'WebPage');
}
module.exports = {
  PLAYJUWA,
  PLAYJUWA_ORIGIN,
  SCHEMA_TYPES,
  isPlayjuwa,
  parseCustomSchema,
  sanitizeFields,
  buildManagedSchema,
  blogAuto,
  homeAuto,
  schemaFromBody,
  schemaForBlogPost,
  footerAuto,
  gameAuto,
  schemaForFooterPage,
  schemaForGamePage
};
