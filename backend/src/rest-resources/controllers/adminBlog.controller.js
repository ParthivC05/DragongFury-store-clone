'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const blogPosts = require('../../services/blog/blogPosts.service');
const { uploadImageBuffer } = require('../../utils/s3Upload');

function hasBlogAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.MASTER_ADMIN) return canAdmin(req, ADMIN_FEATURE_KEYS.BLOG_POSTS);
  if (req.role === ROLES.STORE_ADMIN) return can(req, STORE_FEATURE_KEYS.BLOG_POSTS);
  return false;
}

async function list(req, res) {
  try {
    if (!hasBlogAccess(req)) {
      return sendError(res, 'You don\'t have access to Blog posts. Please contact your administrator if you need access.', 403);
    }
    const data = await blogPosts.listAdmin(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to list blog posts.', err.statusCode || 500);
  }
}

async function getOne(req, res) {
  try {
    if (!hasBlogAccess(req)) {
      return sendError(res, 'You don\'t have access to Blog posts. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const blog_post = await blogPosts.getAdminById(req, id);
    return sendSuccess(res, { blog_post });
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function create(req, res) {
  try {
    if (!hasBlogAccess(req)) {
      return sendError(res, 'You don\'t have access to Blog posts. Please contact your administrator if you need access.', 403);
    }
    const blog_post = await blogPosts.createAdmin(req, req.body || {});
    return sendSuccess(res, { blog_post }, 201);
  } catch (err) {
    return sendError(res, err.message || 'Create failed.', err.statusCode || 500);
  }
}

async function update(req, res) {
  try {
    if (!hasBlogAccess(req)) {
      return sendError(res, 'You don\'t have access to Blog posts. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const blog_post = await blogPosts.updateAdmin(req, id, req.body || {});
    return sendSuccess(res, { blog_post });
  } catch (err) {
    return sendError(res, err.message || 'Update failed.', err.statusCode || 500);
  }
}

async function toggle(req, res) {
  try {
    if (!hasBlogAccess(req)) {
      return sendError(res, 'You don\'t have access to Blog posts. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const status = req.body?.status ?? req.body?.isActive;
    const blog_post = await blogPosts.toggleAdmin(req, id, status);
    return sendSuccess(res, { blog_post });
  } catch (err) {
    return sendError(res, err.message || 'Toggle failed.', err.statusCode || 500);
  }
}

async function remove(req, res) {
  try {
    if (!hasBlogAccess(req)) {
      return sendError(res, 'You don\'t have access to Blog posts. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await blogPosts.deleteAdmin(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Delete failed.', err.statusCode || 500);
  }
}

/** POST /admin/blog/upload-image — upload blog cover/content image to S3 */
async function uploadImage(req, res) {
  try {
    if (!hasBlogAccess(req)) {
      return sendError(res, 'You don\'t have access to Blog posts. Please contact your administrator if you need access.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    const url = await uploadImageBuffer(file.buffer, {
      contentType: file.mimetype,
      keyPrefix: 'blog'
    });
    return sendSuccess(res, { url });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  toggle,
  remove,
  uploadImage
};
