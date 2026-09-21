'use strict';

const crypto = require('crypto');

function buildSignString(params, apiKey) {
  const entries = Object.entries(params || {})
    .filter(([k, v]) => k !== 'sign' && v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => [String(k), String(v)]);
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return `${entries.map(([k, v]) => `${k}=${v}`).join('&')}&key=${apiKey}`;
}

function signParams(params, apiKey) {
  return crypto.createHash('md5').update(buildSignString(params, apiKey), 'utf8').digest('hex').toUpperCase();
}

function verifySign(params, apiKey) {
  const incoming = String(params?.sign || '').trim().toUpperCase();
  if (!incoming || !apiKey) return false;
  const rest = { ...(params || {}) };
  delete rest.sign;
  return signParams(rest, apiKey) === incoming;
}

module.exports = { buildSignString, signParams, verifySign };
