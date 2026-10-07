'use strict';

const homeSchema = require('../../services/seo/homeSchema.service');

const blogPosts = require('../../services/blog/blogPosts.service');
const {
  listIndexablePosts,
  buildSitemapXml,
  buildBlogIndexHtml,
  buildBlogPostHtml,
  buildNotFoundHtml,
  buildMarketingFallbackHtml,
  buildFooterPageHtml,
  buildHomeHtml,
  slugFromPath,
  MARKETING_SEO_PATHS
} = require('../../services/blog/blogPublicHtml.service');
const footer = require('../../services/footer/footer.service');
const { absoluteTarget } = require('../../services/cms/contentLifecycle');
const gameSeoPages = require('../../services/seo/gameSeoPages.service');
const legalPages = require('../../services/legal/legalPages.service');
const { resolvePublicStoreContext } = require('../../services/store/publicHostStore.service');

function storeLabelFromOrigin(origin, storeCode) {
  if (origin) {
    try {
      return new URL(origin).hostname.replace(/^www\./, '');
    } catch {
      /* fall through */
    }
  }
  return storeCode || 'Blog';
}

function sendXml(res, xml) {
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=300');
  return res.status(200).send(xml);
}

function sendHtml(res, html, status = 200) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', status === 200 ? 'public, max-age=60' : 'no-store');
  return res.status(status).send(html);
}

async function sitemap(req, res) {
  try {
    const { storeCode, origin } = await resolvePublicStoreContext(
      req,
      req.query.store_code || req.query.storeCode
    );
    if (!storeCode || !origin) {
      return sendXml(res, buildSitemapXml({ origin: origin || 'https://localhost', posts: [] }));
    }
    const posts = await listIndexablePosts(storeCode);
    return sendXml(res, buildSitemapXml({ origin, posts }));
  } catch (err) {
    return sendXml(res, buildSitemapXml({ origin: 'https://localhost', posts: [] }));
  }
}

async function blogIndex(req, res) {
  try {
    const { storeCode, origin } = await resolvePublicStoreContext(
      req,
      req.query.store_code || req.query.storeCode
    );
    if (!storeCode || !origin) {
      return sendHtml(res, buildNotFoundHtml({ origin: origin || '', storeLabel: 'Blog' }), 400);
    }
    const posts = await listIndexablePosts(storeCode);
    return sendHtml(
      res,
      buildBlogIndexHtml({
        origin,
        storeLabel: storeLabelFromOrigin(origin, storeCode),
        posts
      })
    );
  } catch (err) {
    return sendHtml(
      res,
      buildNotFoundHtml({ origin: '', storeLabel: 'Blog' }),
      err.statusCode || 500
    );
  }
}

async function blogPost(req, res) {
  let origin = '';
  let storeCode = '';
  try {
    const ctx = await resolvePublicStoreContext(req, req.query.store_code || req.query.storeCode);
    origin = ctx.origin || '';
    storeCode = ctx.storeCode || '';
    const storeLabel = storeLabelFromOrigin(origin, storeCode);
    if (!storeCode || !origin) {
      return sendHtml(res, buildNotFoundHtml({ origin, storeLabel }), 400);
    }
    const data = await blogPosts.getPublic(storeCode, { slug: req.params.slug });
    if (data?.redirect) {
      return res.redirect(301, absoluteTarget(origin, data.redirect));
    }
    const post = data?.blog_post;
    if (!post) {
      return sendHtml(res, buildNotFoundHtml({ origin, storeLabel }), 404);
    }
    return sendHtml(res, buildBlogPostHtml({ origin, storeLabel, post }));
  } catch (err) {
    const status = err.statusCode || 500;
    return sendHtml(
      res,
      buildNotFoundHtml({ origin, storeLabel: storeLabelFromOrigin(origin, storeCode) }),
      status === 404 ? 404 : status
    );
  }
}

async function tryLegalPage(storeCode, path) {
  const pageKey = legalPages.normalizePageKey(path);
  if (!storeCode || !pageKey) return null;
  try {
    const data = await legalPages.getPublic(storeCode, pageKey);
    const page = data?.legal_page;
    if (!page || !String(page.content || '').trim()) return null;
    return page;
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 404) return null;
    throw err;
  }
}

async function tryFooterPage(storeCode, path) {
  const slug = slugFromPath(path);
  if (!storeCode || !slug) return null;
  try {
    const data = await footer.getPagePublic(storeCode, { slug });
    if (data?.redirect) return { redirect: data.redirect };
    const page = data?.footer_page;
    if (!page || page.redirectPath) return null;
    return page;
  } catch (err) {
    if (err.statusCode === 404) return null;
    throw err;
  }
}

async function marketingPage(req, res) {
  let origin = '';
  let storeCode = '';
  const rawPath = req.path === '/casino' ? '/slots' : req.path || '/';
  const path = MARKETING_SEO_PATHS.includes(rawPath) || rawPath === '/slots' ? rawPath : '/';
  try {
    const ctx = await resolvePublicStoreContext(req, req.query.store_code || req.query.storeCode);
    origin = ctx.origin || '';
    storeCode = ctx.storeCode || '';
    const storeLabel = storeLabelFromOrigin(origin, storeCode);
    if (!storeCode || !origin) {
      return sendHtml(res, buildNotFoundHtml({ origin, storeLabel }), 400);
    }

    if (path === '/') {
      const posts = await listIndexablePosts(storeCode);
      let pageSchema = null;
      if (homeSchema.isPlayjuwa(storeCode)) {
        const saved = await homeSchema.getHome({ origin, storeLabel });
        pageSchema = saved.schema || null;
      }
      return sendHtml(res, buildHomeHtml({ origin, storeLabel, posts, pageSchema }));
    }

    const legalPage = await tryLegalPage(storeCode, path);
    if (legalPage) {
      return sendHtml(res, buildFooterPageHtml({ origin, storeLabel, path, page: legalPage }));
    }

    const footerPage = await tryFooterPage(storeCode, path);
    if (footerPage?.redirect) {
      return res.redirect(301, absoluteTarget(origin, footerPage.redirect));
    }
    if (footerPage) {
      return sendHtml(res, buildFooterPageHtml({ origin, storeLabel, path, page: footerPage }));
    }

    return sendHtml(res, buildMarketingFallbackHtml({ origin, storeLabel, path }));
  } catch (err) {
    const status = err.statusCode || 500;
    return sendHtml(
      res,
      buildNotFoundHtml({ origin, storeLabel: storeLabelFromOrigin(origin, storeCode) }),
      status === 404 ? 404 : status
    );
  }
}

async function gameRedirect(req, res, next) {
  try {
    const ctx = await resolvePublicStoreContext(req, req.query.store_code || req.query.storeCode);
    const storeCode = ctx.storeCode || 'dragonfury';
    const data = await gameSeoPages.getPublic(storeCode, req.params.slug);
    const dest = String(data?.redirect || '').trim();
    if (dest) {
      if (/^https?:\/\//i.test(dest)) return res.redirect(301, dest);
      const origin = String(ctx.origin || '').replace(/\/$/, '');
      const path = dest.startsWith('/') ? dest : `/${dest}`;
      return res.redirect(301, `${origin}${path}`);
    }
  } catch {
    /* leave the request for the site shell */
  }
  return next();
}

module.exports = { sitemap, blogIndex, blogPost, marketingPage, gameRedirect };
