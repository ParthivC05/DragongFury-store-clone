'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const blogPosts = require('../../services/blog/blogPosts.service');

/** Public: list active blog posts for a store. */
async function list(req, res) {
  try {
    const storeCode = req.query.store_code || req.query.storeCode;
    const data = await blogPosts.listPublic(storeCode, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to get blog posts', err.statusCode || 500);
  }
}

/** Public: get one active blog post by slug (path) or id (query). */
async function getOne(req, res) {
  try {
    const storeCode = req.query.store_code || req.query.storeCode;
    const slug = req.params.slug;
    const id = req.query.id || req.query.blogPostId;
    const data = await blogPosts.getPublic(storeCode, { slug, id });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to get blog post', err.statusCode || 500);
  }
}

module.exports = { list, getOne };
