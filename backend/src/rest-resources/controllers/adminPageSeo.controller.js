'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const blogPosts = require('../../services/blog/blogPosts.service');
const pageSeo = require('../../services/seo/pageSeo.service');

function hasBlogAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.MASTER_ADMIN) return canAdmin(req, ADMIN_FEATURE_KEYS.BLOG_POSTS);
  if (req.role === ROLES.STORE_ADMIN) return can(req, STORE_FEATURE_KEYS.BLOG_POSTS);
  return false;
}

function resolveStore(req) {
  if (!hasBlogAccess(req)) {
    const err = new Error('You don\'t have access to page SEO. Please contact your administrator if you need access.');
    err.statusCode = 403;
    throw err;
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const storeCode = blogPosts.normalizeStoreCode(req.storeCode);
    if (!storeCode) {
      const err = new Error('Store admin must have a store code.');
      err.statusCode = 400;
      throw err;
    }
    return storeCode;
  }
  const raw = (req.query && (req.query.storeCode || req.query.store_code))
    || (req.body && (req.body.storeCode || req.body.store_code));
  const storeCode = blogPosts.normalizeStoreCode(raw);
  if (!storeCode) {
    const err = new Error('Pick a store for these SEO pages.');
    err.statusCode = 400;
    throw err;
  }
  blogPosts.assertAdminCanAccessStore(req, storeCode);
  return storeCode;
}

async function list(req, res) {
  try {
    const storeCode = resolveStore(req);
    const data = await pageSeo.listAdmin(storeCode);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Could not load page SEO.', err.statusCode || 500);
  }
}

async function getOne(req, res) {
  try {
    const storeCode = resolveStore(req);
    const data = await pageSeo.getAdmin(storeCode, req.params.pageKey);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Could not load page SEO.', err.statusCode || 500);
  }
}

async function save(req, res) {
  try {
    const storeCode = resolveStore(req);
    const data = await pageSeo.saveAdmin(storeCode, req.params.pageKey, req.body || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Could not save page SEO.', err.statusCode || 500);
  }
}

module.exports = { list, getOne, save };
