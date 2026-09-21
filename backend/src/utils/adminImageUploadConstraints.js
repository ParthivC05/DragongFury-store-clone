'use strict';

const MOBILE_MAX_BYTES = 100 * 1024;
const DESKTOP_MAX_BYTES = 150 * 1024;

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

function isWebpBuffer(buffer) {
  if (!buffer || buffer.length < 12) return false;
  return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

function isWebpFileMeta(file = {}) {
  const mimeOk = /^image\/webp$/i.test(String(file.mimetype || ''));
  const nameOk = /\.webp$/i.test(String(file.originalname || file.name || ''));
  return mimeOk || nameOk;
}

function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Reject non-WEBP files and oversized images.
 * @param {{ buffer?: Buffer, mimetype?: string, originalname?: string, size?: number }} file
 * @param {{ maxBytes: number, label?: string }} options
 */
function assertWebpUpload(file, { maxBytes, label = 'Image' } = {}) {
  if (!file || !file.buffer) {
    throw createError('No image file provided.');
  }
  if (!isWebpBuffer(file.buffer)) {
    throw createError('Only WEBP images are allowed.');
  }
  const size = file.buffer.length || file.size || 0;
  if (size > maxBytes) {
    throw createError(
      `${label} must be ${formatKb(maxBytes)} or smaller (got ${formatKb(size)}).`
    );
  }
}

function webpMulterFilter(_req, file, cb) {
  if (isWebpFileMeta(file)) return cb(null, true);
  return cb(new Error('Only WEBP images are allowed.'));
}

function multerLimitMessage(maxBytes) {
  return `Image must be ${formatKb(maxBytes)} or smaller. Only WEBP is allowed.`;
}

module.exports = {
  MOBILE_MAX_BYTES,
  DESKTOP_MAX_BYTES,
  formatKb,
  isWebpBuffer,
  isWebpFileMeta,
  assertWebpUpload,
  webpMulterFilter,
  multerLimitMessage
};
