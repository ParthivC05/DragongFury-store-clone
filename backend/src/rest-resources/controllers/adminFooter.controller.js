'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const footer = require('../../services/footer/footer.service');
const legalPages = require('../../services/legal/legalPages.service');
const { uploadImageBuffer } = require('../../utils/s3Upload');

function hasFooterAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return false;
  if (req.role === ROLES.MASTER_ADMIN) return canAdmin(req, ADMIN_FEATURE_KEYS.FOOTER_PAGES);
  if (req.role === ROLES.STORE_ADMIN) return can(req, STORE_FEATURE_KEYS.FOOTER_PAGES);
  return false;
}

const DENY = 'You don\'t have access to Footer pages. Please contact your administrator if you need access.';

function footerErrorMessage(err, fallback) {
  const msg = String(err?.message || '');
  if (/relation ["']?footer_(menus|pages)["']? does not exist/i.test(msg)) {
    return 'Footer database tables are missing. Run backend migrations (npm run migrate), then retry.';
  }
  return msg || fallback;
}

async function listMenus(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const data = await footer.listMenusAdmin(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, footerErrorMessage(err, 'Failed to list footer menus.'), err.statusCode || 500);
  }
}

async function getMenu(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const footer_menu = await footer.getMenuAdmin(req, id);
    return sendSuccess(res, { footer_menu });
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function createMenu(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const footer_menu = await footer.createMenuAdmin(req, req.body || {});
    return sendSuccess(res, { footer_menu }, 201);
  } catch (err) {
    return sendError(res, err.message || 'Create failed.', err.statusCode || 500);
  }
}

async function updateMenu(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const footer_menu = await footer.updateMenuAdmin(req, id, req.body || {});
    return sendSuccess(res, { footer_menu });
  } catch (err) {
    return sendError(res, err.message || 'Update failed.', err.statusCode || 500);
  }
}

async function removeMenu(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await footer.deleteMenuAdmin(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Delete failed.', err.statusCode || 500);
  }
}

async function listPages(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const data = await footer.listPagesAdmin(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, footerErrorMessage(err, 'Failed to list footer pages.'), err.statusCode || 500);
  }
}

async function getPage(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const footer_page = await footer.getPageAdmin(req, id);
    return sendSuccess(res, { footer_page });
  } catch (err) {
    return sendError(res, err.message || 'Not found.', err.statusCode || 500);
  }
}

async function createPage(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const footer_page = await footer.createPageAdmin(req, req.body || {});
    return sendSuccess(res, { footer_page }, 201);
  } catch (err) {
    return sendError(res, err.message || 'Create failed.', err.statusCode || 500, err.code || null);
  }
}

async function updatePage(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const footer_page = await footer.updatePageAdmin(req, id, req.body || {});
    return sendSuccess(res, { footer_page });
  } catch (err) {
    return sendError(res, err.message || 'Update failed.', err.statusCode || 500, err.code || null);
  }
}

async function removePage(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendError(res, 'Invalid id.', 400);
    const data = await footer.deletePageAdmin(req, id);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Delete failed.', err.statusCode || 500);
  }
}

async function getSettings(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const data = await footer.getSettingsAdmin(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load footer settings.', err.statusCode || 500);
  }
}

async function updateSettings(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const data = await footer.updateSettingsAdmin(req, req.body || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to save footer settings.', err.statusCode || 500);
  }
}

async function listLegalPages(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const data = await legalPages.listAdmin(req, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to list legal pages.', err.statusCode || 500);
  }
}

async function getLegalPage(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const data = await legalPages.getAdmin(req, req.params.pageKey, req.query || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load legal page.', err.statusCode || 500);
  }
}

async function updateLegalPage(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const data = await legalPages.upsertAdmin(req, req.params.pageKey, req.body || {});
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to save legal page.', err.statusCode || 500);
  }
}

/** POST /admin/footer/upload-image — upload footer page layout images to S3 */
async function uploadImage(req, res) {
  try {
    if (!hasFooterAccess(req)) return sendError(res, DENY, 403);
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    const url = await uploadImageBuffer(file.buffer, {
      contentType: file.mimetype,
      keyPrefix: 'footer-pages'
    });
    return sendSuccess(res, { url });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  listMenus,
  getMenu,
  createMenu,
  updateMenu,
  removeMenu,
  listPages,
  getPage,
  createPage,
  updatePage,
  removePage,
  getSettings,
  updateSettings,
  listLegalPages,
  getLegalPage,
  updateLegalPage,
  uploadImage
};
