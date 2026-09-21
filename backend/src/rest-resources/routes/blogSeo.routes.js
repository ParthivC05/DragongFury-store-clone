'use strict';

const express = require('express');
const blogSeoController = require('../controllers/blogSeo.controller');
const { MARKETING_SEO_PATHS } = require('../../services/blog/blogPublicHtml.service');

const router = express.Router();

router.get('/sitemap.xml', blogSeoController.sitemap);
router.get('/api/sitemap.xml', blogSeoController.sitemap);
router.get('/blog', blogSeoController.blogIndex);
router.get('/blog/:slug', blogSeoController.blogPost);

for (const path of MARKETING_SEO_PATHS) {
  router.get(path, blogSeoController.marketingPage);
}
router.get('/casino', blogSeoController.marketingPage);

module.exports = router;
