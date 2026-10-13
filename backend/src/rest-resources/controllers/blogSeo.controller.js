'use strict';

const homeSchema = require('../../services/seo/homeSchema.service');
const pageSeo = require('../../services/seo/pageSeo.service');

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
  originPath,
  MARKETING_SEO_PATHS
} = require('../../services/blog/blogPublicHtml.service');
const footer = require('../../services/footer/footer.service');
const { absoluteTarget } = require('../../services/cms/contentLifecycle');
const legalPages = require('../../services/legal/legalPages.service');
const gameSeoPages = require('../../services/seo/gameSeoPages.service');
const { resolvePublicStoreContext } = require('../../services/store/publicHostStore.service');
const { buildSpaHtml } = require('../../services/seo/spaShell.service');

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

async function sendStoreHtml(res, storeCode, path, html, status = 200) {
  let next = html;
  if (status === 200) {
    try {
      next = pageSeo.overlayHtml(html, await pageSeo.getPublic(storeCode, path));
    } catch {
      next = html;
    }
  }
  return (typeof sendPublicHtml === 'function' ? sendPublicHtml : sendHtml)(res, next, status);
}


/** Same full HTML for people and crawlers (prerender into the SPA shell). */
function sendPublicHtml(res, fullHtml, status = 200) {
  if (status !== 200) return sendHtml(res, fullHtml, status);
  const title = (fullHtml.match(/<title>([^<]*)/i) || [])[1] || '';
  const description = (fullHtml.match(/name=["']description["'] content=["']([^"']*)/i) || [])[1] || '';
  const canonical = (fullHtml.match(/rel=["']canonical["'] href=["']([^"']*)/i) || [])[1] || '';
  const robots = (fullHtml.match(/name=["']robots["'] content=["']([^"']*)/i) || [])[1] || 'index, follow';
  const extraHead = (fullHtml.match(/<script type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi) || []).join('\n');
  const keywords = (fullHtml.match(/name=["']keywords["'] content=["']([^"']*)/i) || [])[1] || '';
  const body = (fullHtml.match(/<div class="seo-wrap">([\s\S]*)<\/div>\s*<\/body>/i) || [])[1] || '';
  const spa = buildSpaHtml({
    title,
    description,
    canonical,
    robots,
    keywords,
    extraHead,
    prerenderHtml: body
  });
  return sendHtml(res, spa || fullHtml, status);
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
    let gamePages = [];
    try {
      const listed = await gameSeoPages.listPublic(storeCode);
      gamePages = (listed.game_pages || []).filter((page) => page && page.slug);
    } catch {
      gamePages = [];
    }
    return sendXml(res, buildSitemapXml({ origin, posts, gamePages }));
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
    return sendPublicHtml(
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
    return sendPublicHtml(res, buildBlogPostHtml({ origin, storeLabel, post }));
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
      const savedHome = await homeSchema.getHome(storeCode, { origin, storeLabel });
      const pageSchema = savedHome.schema || null;
      return sendStoreHtml(res, storeCode, path, buildHomeHtml({ origin, storeLabel, posts, pageSchema }));
    }

    const legalPage = await tryLegalPage(storeCode, path);
    if (legalPage) {
      return sendStoreHtml(res, storeCode, path, buildFooterPageHtml({ origin, storeLabel, path, page: legalPage }));
    }

    const footerPage = await tryFooterPage(storeCode, path);
    if (footerPage?.redirect) {
      return res.redirect(301, absoluteTarget(origin, footerPage.redirect));
    }
    if (footerPage) {
      return sendStoreHtml(res, storeCode, path, buildFooterPageHtml({ origin, storeLabel, path, page: footerPage }));
    }

    return sendStoreHtml(res, storeCode, path, buildMarketingFallbackHtml({ origin, storeLabel, path }));
  } catch (err) {
    const status = err.statusCode || 500;
    return sendHtml(
      res,
      buildNotFoundHtml({ origin, storeLabel: storeLabelFromOrigin(origin, storeCode) }),
      status === 404 ? 404 : status
    );
  }
}

async function gameCategoryPage(req, res) {
  let origin = '';
  let storeCode = '';
  try {
    const ctx = await resolvePublicStoreContext(req, req.query.store_code || req.query.storeCode);
    origin = ctx.origin || '';
    storeCode = ctx.storeCode || 'dragonfury';
    const storeLabel = storeLabelFromOrigin(origin, storeCode);
    const data = await gameSeoPages.getPublic(storeCode, req.params.slug);
    if (data?.redirect) {
      const dest = String(data.redirect || '').trim();
      if (/^https?:\/\//i.test(dest)) return res.redirect(301, dest);
      const path = dest.startsWith('/') ? dest : `/${dest}`;
      return res.redirect(301, `${String(origin || '').replace(/\/$/, '')}${path}`);
    }
    const page = data?.game_page;
    if (!page || data?.hidden) {
      return sendHtml(res, buildNotFoundHtml({ origin, storeLabel, kind: 'page' }), 404);
    }
    const slug = String(page.slug || req.params.slug || '').trim();
    const html = buildFooterPageHtml({
      origin,
      storeLabel,
      path: `/games/${slug}`,
      page: {
        title: page.title || page.name || slug,
        metaTitle: page.metaTitle || page.title || page.name,
        metaDescription: page.metaDescription || page.description || '',
        content: page.content || (page.description ? `<p>${page.description}</p>` : '')
      }
    });
    return sendPublicHtml(res, html);
  } catch (err) {
    return sendHtml(
      res,
      buildNotFoundHtml({ origin, storeLabel: storeLabelFromOrigin(origin, storeCode), kind: 'page' }),
      err.statusCode === 404 ? 404 : 500
    );
  }
}

async function cmsPage(req, res) {
  let origin = '';
  let storeCode = '';
  const slug = slugFromPath(req.params.slug || req.path);
  try {
    const ctx = await resolvePublicStoreContext(req, req.query.store_code || req.query.storeCode);
    origin = ctx.origin || '';
    storeCode = ctx.storeCode || '';
    const storeLabel = storeLabelFromOrigin(origin, storeCode);
    const path = `/${slug}`;
    if (MARKETING_SEO_PATHS.includes(path) || path === '/casino' || path === '/slots') {
      req.url = path;
      req.path = path;
      return marketingPage(req, res);
    }
    const legalPage = await tryLegalPage(storeCode, path);
    if (legalPage) {
      return sendStoreHtml(res, storeCode, path, buildFooterPageHtml({ origin, storeLabel, path, page: legalPage }));
    }
    const footerPage = await tryFooterPage(storeCode, path);
    if (footerPage?.redirect) {
      return res.redirect(301, absoluteTarget(origin, footerPage.redirect));
    }
    if (footerPage) {
      return sendStoreHtml(res, storeCode, path, buildFooterPageHtml({ origin, storeLabel, path, page: footerPage }));
    }
    return sendHtml(res, buildNotFoundHtml({ origin, storeLabel, kind: 'page' }), 404);
  } catch (err) {
    return sendHtml(
      res,
      buildNotFoundHtml({ origin, storeLabel: storeLabelFromOrigin(origin, storeCode), kind: 'page' }),
      err.statusCode === 404 ? 404 : 500
    );
  }
}

module.exports = { sitemap, blogIndex, blogPost, marketingPage, gameCategoryPage, cmsPage };
