'use strict';

const META_TITLE_MAX = 512;
const META_DESC_MAX = 2000;
const META_TAGS_MAX = 1024;

function normalizeOptionalSeo(value, { max, field }) {
  if (value === undefined) return undefined;
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > max) {
    const err = new Error(`${field} is too long (max ${max} characters).`);
    err.statusCode = 400;
    throw err;
  }
  return s;
}

/** Pick optional SEO fields from an admin request body. Undefined = leave unchanged. */
function seoFromBody(body = {}) {
  const metaTitle = normalizeOptionalSeo(body.metaTitle ?? body.meta_title, {
    max: META_TITLE_MAX,
    field: 'Meta title'
  });
  const metaDescription = normalizeOptionalSeo(body.metaDescription ?? body.meta_description, {
    max: META_DESC_MAX,
    field: 'Meta description'
  });
  const metaTags = normalizeOptionalSeo(body.metaTags ?? body.meta_tags, {
    max: META_TAGS_MAX,
    field: 'Meta tags'
  });

  const out = {};
  if (metaTitle !== undefined) out.metaTitle = metaTitle;
  if (metaDescription !== undefined) out.metaDescription = metaDescription;
  if (metaTags !== undefined) out.metaTags = metaTags;
  return out;
}

function seoToPlain(p = {}) {
  return {
    metaTitle: p.metaTitle ?? p.meta_title ?? null,
    metaDescription: p.metaDescription ?? p.meta_description ?? null,
    metaTags: p.metaTags ?? p.meta_tags ?? null
  };
}

const CANONICAL_MAX = 1024;

/** Optional absolute http(s) URL. Undefined = leave unchanged. Empty = clear. */
function canonicalUrlFromBody(body = {}) {
  if (body.canonicalUrl === undefined && body.canonical_url === undefined) return undefined;
  const raw = body.canonicalUrl ?? body.canonical_url;
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length > CANONICAL_MAX) {
    const err = new Error(`Canonical URL is too long (max ${CANONICAL_MAX} characters).`);
    err.statusCode = 400;
    throw err;
  }
  let url;
  try {
    url = new URL(s);
  } catch {
    const err = new Error('Canonical URL must be a full link starting with http:// or https://.');
    err.statusCode = 400;
    throw err;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    const err = new Error('Canonical URL must start with http:// or https://.');
    err.statusCode = 400;
    throw err;
  }
  return url.href;
}

module.exports = {
  seoFromBody,
  seoToPlain,
  canonicalUrlFromBody
};
