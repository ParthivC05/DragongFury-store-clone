'use strict';

const crypto = require('crypto');

function shortenFloats(v) {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shortenFloats(x)]));
  }
  if (typeof v === 'number' && Number.isFinite(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce((acc, k) => {
        acc[k] = sortKeys(v[k]);
        return acc;
      }, {});
  }
  return v;
}

function verifyDiditWebhookSignature(rawBody, signatureV2, timestamp, secret) {
  if (!secret || !signatureV2 || timestamp == null || rawBody == null) return false;
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(String(timestamp), 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;

  let parsed;
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    parsed = JSON.parse(text);
  } catch {
    return false;
  }

  const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));
  const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signatureV2), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { shortenFloats, sortKeys, verifyDiditWebhookSignature };
