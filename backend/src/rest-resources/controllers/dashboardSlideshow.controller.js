'use strict';

const dashboardSlideshowService = require('../../services/dashboardSlideshow');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { isMasterAdmin, isStoreAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { uploadImageBuffer } = require('../../utils/s3Upload');
const { getImageDimensions } = require('../../utils/imageDimensions');
const {
  MOBILE_MAX_BYTES,
  DESKTOP_MAX_BYTES,
  assertWebpUpload
} = require('../../utils/adminImageUploadConstraints');

const settings = dashboardSlideshowService.dashboardSlideshowSettings;

/** Exact slideshow banner sizes for desktop and phone. */
const SLIDE_IMAGE_SIZES = {
  desktop: { width: 2172, height: 724, label: '2172×724' },
  mobile: { width: 1774, height: 887, label: '1774×887' }
};

function canManageDashboardSlideshow(req) {
  if (isMasterAdmin(req.role)) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW);
  }
  if (isStoreAdmin(req.role)) {
    return can(req, STORE_FEATURE_KEYS.DASHBOARD_SLIDESHOW);
  }
  return false;
}

function parseStoreScopeFromBody(body = {}) {
  const storeCode = body.store_code ?? body.storeCode;
  const distributorCode = body.distributor_code ?? body.distributorCode;
  if (storeCode == null || String(storeCode).trim() === '') return null;
  return {
    storeCode: String(storeCode).trim(),
    distributorCode:
      distributorCode != null && String(distributorCode).trim() !== ''
        ? String(distributorCode).trim()
        : null
  };
}

function parseImageKind(raw) {
  const value = String(raw || 'desktop').trim().toLowerCase();
  if (value === 'mobile' || value === 'phone') return 'mobile';
  if (value === 'desktop' || value === 'computer') return 'desktop';
  return null;
}

function assertSlideImageDimensions(buffer, kind = 'desktop') {
  const size = SLIDE_IMAGE_SIZES[kind] || SLIDE_IMAGE_SIZES.desktop;
  const dims = getImageDimensions(buffer);
  if (!dims || !dims.width || !dims.height) {
    const err = new Error('Could not read image dimensions. Use a WEBP image.');
    err.statusCode = 400;
    throw err;
  }
  const { width, height } = dims;
  if (width !== size.width || height !== size.height) {
    const kindLabel = kind === 'mobile' ? 'Phone' : 'Computer';
    const err = new Error(
      `${kindLabel} image must be exactly ${size.label} pixels (got ${width}×${height}).`
    );
    err.statusCode = 400;
    throw err;
  }
  return dims;
}

/** GET /public?store_code= — homepage slides plus optional casino slides */
async function getPublic(req, res) {
  try {
    const storeCode = req.query.store_code ?? req.query.storeCode;
    const data = await settings.getPublicSettingsForStoreCode(storeCode);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load dashboard slideshow.', err.statusCode || 500);
  }
}

/** GET /admin/stores — master: all stores; store_admin: own store only */
async function listStores(req, res) {
  try {
    if (!canManageDashboardSlideshow(req)) {
      return sendError(res, 'You do not have permission to manage dashboard slideshow settings.', 403);
    }

    if (isMasterAdmin(req.role)) {
      const data = await settings.listAllStoreSettings();
      return sendSuccess(res, data);
    }

    if (!isStoreAdmin(req.role) || req.distributorCode == null || req.storeCode == null) {
      return sendError(res, 'Store scope is required.', 403);
    }

    const data = await settings.listOwnStoreSettings({
      distributorCode: req.distributorCode,
      storeCode: req.storeCode
    });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to load dashboard slideshow settings.', err.statusCode || 500);
  }
}

/** PUT /admin/stores — update one store; store_admin pinned to own scope */
async function updateStore(req, res) {
  try {
    if (!canManageDashboardSlideshow(req)) {
      return sendError(res, 'You do not have permission to manage dashboard slideshow settings.', 403);
    }

    const body = req.body || {};
    let scope;

    if (isMasterAdmin(req.role)) {
      const rawScope = parseStoreScopeFromBody(body);
      if (!rawScope?.storeCode) {
        return sendError(res, 'storeCode is required (and distributorCode when available).', 400);
      }
      scope = await settings.resolveStoreScope(rawScope);
    } else if (isStoreAdmin(req.role)) {
      if (req.distributorCode == null || req.storeCode == null) {
        return sendError(res, 'Store scope is required.', 403);
      }
      scope = {
        distributorCode: req.distributorCode,
        storeCode: req.storeCode
      };
    } else {
      return sendError(res, 'Access denied.', 403);
    }

    const updatedBy = req.user?.username || req.user?.email || null;
    const updated = await settings.upsertStoreSettings(
      scope,
      {
        slides: body.slides,
        casinoSlides: body.casinoSlides ?? body.casino_slides
      },
      { updatedBy }
    );

    return sendSuccess(res, updated);
  } catch (err) {
    return sendError(res, err.message || 'Unable to update dashboard slideshow settings.', err.statusCode || 400);
  }
}

/** POST /admin/image-upload — upload slideshow image to S3 (dimension-checked) */
async function uploadSlideImage(req, res) {
  try {
    if (!canManageDashboardSlideshow(req)) {
      return sendError(res, 'You do not have permission to manage dashboard slideshow settings.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    const kind = parseImageKind(req.body?.kind ?? req.body?.variant ?? req.query?.kind);
    if (!kind) {
      return sendError(res, 'Image kind must be "desktop" or "mobile".', 400);
    }
    assertWebpUpload(file, {
      maxBytes: kind === 'mobile' ? MOBILE_MAX_BYTES : DESKTOP_MAX_BYTES,
      label: kind === 'mobile' ? 'Phone image' : 'Computer image'
    });
    const dims = assertSlideImageDimensions(file.buffer, kind);
    const url = await uploadImageBuffer(file.buffer, {
      contentType: 'image/webp',
      keyPrefix: `dashboard-slideshow/${kind}`
    });
    return sendSuccess(res, {
      data: { url, width: dims.width, height: dims.height, kind }
    });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

module.exports = {
  getPublic,
  listStores,
  updateStore,
  uploadSlideImage,
  SLIDE_IMAGE_SIZES
};
