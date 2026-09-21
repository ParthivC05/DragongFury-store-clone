'use strict';

const crypto = require('crypto');

/**
 * Bona Transfer Wallet sign:
 * 1) sort keys A-Z (exclude sign)
 * 2) key=value&... then append appSecret with no separator
 * 3) MD5 hex
 */
function buildSignString(params, appSecret) {
  const sorted = Object.keys(params || {})
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && String(params[k]) !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `${sorted}${appSecret || ''}`;
}

function md5Sign(params, appSecret) {
  return crypto.createHash('md5').update(buildSignString(params, appSecret)).digest('hex');
}

function withSign(params, appSecret) {
  const body = { ...(params || {}) };
  delete body.sign;
  body.sign = md5Sign(body, appSecret);
  return body;
}

module.exports = {
  buildSignString,
  md5Sign,
  withSign
};
