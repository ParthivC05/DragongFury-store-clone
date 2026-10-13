'use strict';

const express = require('express');
const blogSeoController = require('../controllers/blogSeo.controller');
const { MARKETING_SEO_PATHS } = require('../../services/blog/blogPublicHtml.service');

const router = express.Router();

function publicOrigin(req) {
  const host = String(req.get('x-forwarded-host') || req.get('host') || '')
    .split(',')[0]
    .trim();
  const proto = String(req.get('x-forwarded-proto') || 'https')
    .split(',')[0]
    .trim() || 'https';
  return host ? `${proto}://${host}` : '';
}

router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const p = req.path || '';
  if (/^\/(api|assets|socket\.io|optimized|internal)\b/i.test(p)) return next();
  if (p === p.toLowerCase()) return next();
  const rest = String(req.originalUrl || '').slice(p.length);
  const loc = `${publicOrigin(req)}${p.toLowerCase()}${rest}` || `${p.toLowerCase()}${rest}`;
  return res.redirect(301, loc);
});

router.get('/sitemap.xml', blogSeoController.sitemap);
router.get('/api/sitemap.xml', blogSeoController.sitemap);
router.get('/blog', blogSeoController.blogIndex);
router.get('/blog/:slug', blogSeoController.blogPost);
router.get('/games/:slug', blogSeoController.gameCategoryPage);

for (const path of MARKETING_SEO_PATHS) {
  router.get(path, blogSeoController.marketingPage);
}
router.get('/casino', blogSeoController.marketingPage);
router.get('/bonus', blogSeoController.marketingPage);

const RESERVED_CMS_SLUGS = new Set(['api', 'socket.io', 'assets', 'optimized', 'maintenance', 'internal']);
router.get('/:slug', (req, res, next) => {
  if (RESERVED_CMS_SLUGS.has(String(req.params.slug || '').toLowerCase())) return next();
  return blogSeoController.cmsPage(req, res);
});

module.exports = router;
