'use strict';

const crypto = require('crypto');
const { resolveScorpioConfig } = require('./scorpio.config');

function signatureValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildSignaturePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const keys = Object.keys(body).sort();
  return keys.map((key) => signatureValue(body[key])).join(',');
}

function hmacBase64(payload, apiToken) {
  return crypto.createHmac('sha512', apiToken).update(payload, 'utf8').digest('base64');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyRequestSignature(body, headerValue) {
  const { apiToken } = resolveScorpioConfig();
  const incoming = String(headerValue || '').trim();
  if (!apiToken || !incoming) return false;
  const expected = hmacBase64(buildSignaturePayload(body), apiToken);
  return safeEqual(expected, incoming);
}

module.exports = {
  buildSignaturePayload,
  verifyRequestSignature
};
