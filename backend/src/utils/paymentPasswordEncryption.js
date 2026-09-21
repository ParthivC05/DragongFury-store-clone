'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Resolve encryption key material from env.
 * With dotenv override:true, a duplicated PAYMENT_PASSWORD_ENCRYPTION_KEY leaves only the last value active.
 * PAYMENT_PASSWORD_ENCRYPTION_KEY_FALLBACK (comma-separated) lets decrypt still read data encrypted with older keys.
 */
function getKeyMaterials() {
  const materials = [];
  const primary = process.env.PAYMENT_PASSWORD_ENCRYPTION_KEY;
  if (primary && typeof primary === 'string' && primary.trim()) {
    materials.push(primary.trim());
  }
  const fallback = process.env.PAYMENT_PASSWORD_ENCRYPTION_KEY_FALLBACK;
  if (fallback && typeof fallback === 'string') {
    for (const part of fallback.split(',')) {
      const trimmed = part.trim();
      if (trimmed && !materials.includes(trimmed)) materials.push(trimmed);
    }
  }
  return materials;
}

function deriveKey(raw) {
  return crypto.scryptSync(raw, 'payment-api-password', KEY_LENGTH);
}

function getKey() {
  const materials = getKeyMaterials();
  if (!materials.length) return null;
  return deriveKey(materials[0]);
}

function decryptWithKey(encrypted, key) {
  const buf = Buffer.from(encrypted, 'base64');
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const enc = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

/**
 * Generate a secure random password for Payment API signup (satisfies typical rules).
 */
function generatePaymentPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const pick = (str) => str[Math.floor(Math.random() * str.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(special);
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) pwd += pick(all);
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Encrypt plain text for storing Payment API password. Returns null if key not configured.
 */
function encryptPaymentPassword(plain) {
  if (plain == null || typeof plain !== 'string') return null;
  const key = getKey();
  if (!key) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypt stored Payment API password.
 * Tries primary key, then FALLBACK keys (for data encrypted before a key rotation / duplicate .env entry).
 * Returns null if not configured or no key can decrypt (does not throw on auth failure).
 */
function decryptPaymentPassword(encrypted) {
  if (encrypted == null || typeof encrypted !== 'string') return null;
  const materials = getKeyMaterials();
  if (!materials.length) return null;

  let lastErr = null;
  for (const raw of materials) {
    try {
      const plain = decryptWithKey(encrypted, deriveKey(raw));
      if (plain) return plain;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    const err = new Error('Payment password decrypt failed with all configured keys');
    err.cause = lastErr;
    throw err;
  }
  return null;
}

function isPaymentPasswordEncryptionConfigured() {
  return getKeyMaterials().length > 0;
}

module.exports = {
  generatePaymentPassword,
  encryptPaymentPassword,
  decryptPaymentPassword,
  isPaymentPasswordEncryptionConfigured
};
