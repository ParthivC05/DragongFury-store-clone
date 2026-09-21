'use strict';

const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../configs/app.config');

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const ALLOWED_IMAGE_MIMES = new Set(Object.keys(EXT_BY_MIME));

let cachedClient = null;
let cachedAllowedHosts = null;

function isS3Configured() {
  return Boolean(
    config.get('s3.bucket') &&
      config.get('s3.accessKeyId') &&
      config.get('s3.secretAccessKey')
  );
}

function getClient() {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: config.get('s3.region'),
    credentials: {
      accessKeyId: config.get('s3.accessKeyId'),
      secretAccessKey: config.get('s3.secretAccessKey')
    }
  });
  return cachedClient;
}

function buildPublicUrl(key) {
  const base = config.get('s3.publicBaseUrl');
  if (base) return `${base.replace(/\/$/, '')}/${key}`;
  const bucket = config.get('s3.bucket');
  const region = config.get('s3.region');
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function getAllowedUploadHosts() {
  if (cachedAllowedHosts) return cachedAllowedHosts;
  const hosts = new Set();
  const base = String(config.get('s3.publicBaseUrl') || '').trim();
  if (base) {
    try {
      hosts.add(new URL(base).host.toLowerCase());
    } catch (_) {
      /* ignore invalid base */
    }
  }
  const bucket = String(config.get('s3.bucket') || '').trim();
  const region = String(config.get('s3.region') || '').trim() || 'us-east-1';
  if (bucket) {
    hosts.add(`${bucket}.s3.${region}.amazonaws.com`.toLowerCase());
    hosts.add(`${bucket}.s3.amazonaws.com`.toLowerCase());
  }
  cachedAllowedHosts = hosts;
  return hosts;
}

/**
 * True when URL is https and hosted on our configured S3 / CDN hosts.
 */
function isAllowedUploadPublicUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol !== 'https:') return false;
    const hosts = getAllowedUploadHosts();
    if (!hosts.size) return false;
    return hosts.has(parsed.host.toLowerCase());
  } catch (_) {
    return false;
  }
}

/**
 * Detect image MIME from magic bytes (do not trust client Content-Type alone).
 * @param {Buffer} buffer
 * @returns {string|null}
 */
function detectImageContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }
  // RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Upload an image buffer to S3 and return its public URL.
 * @param {Buffer} buffer
 * @param {{ contentType: string, keyPrefix?: string }} opts
 * @returns {Promise<string>} public URL
 */
async function uploadImageBuffer(buffer, { contentType, keyPrefix = 'uploads' } = {}) {
  if (!isS3Configured()) {
    const err = new Error('File uploads are not configured. Please contact support.');
    err.statusCode = 503;
    throw err;
  }
  const detected = detectImageContentType(buffer);
  const normalizedDeclared = String(contentType || '').toLowerCase();
  if (!detected) {
    const err = new Error('Unsupported image type. Use PNG, JPG, WEBP, or GIF.');
    err.statusCode = 400;
    throw err;
  }
  if (
    normalizedDeclared &&
    ALLOWED_IMAGE_MIMES.has(normalizedDeclared) &&
    !(
      detected === normalizedDeclared ||
      (detected === 'image/jpeg' && (normalizedDeclared === 'image/jpeg' || normalizedDeclared === 'image/jpg'))
    )
  ) {
    const err = new Error('Uploaded file content does not match the declared image type.');
    err.statusCode = 400;
    throw err;
  }
  const ext = EXT_BY_MIME[detected];
  const key = `${keyPrefix.replace(/\/$/, '')}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: config.get('s3.bucket'),
      Key: key,
      Body: buffer,
      ContentType: detected,
      CacheControl: 'public, max-age=31536000, immutable'
    })
  );
  return buildPublicUrl(key);
}

module.exports = {
  uploadImageBuffer,
  isS3Configured,
  isAllowedUploadPublicUrl,
  detectImageContentType
};
