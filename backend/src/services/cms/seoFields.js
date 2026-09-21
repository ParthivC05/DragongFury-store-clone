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

module.exports = {
  seoFromBody,
  seoToPlain
};
