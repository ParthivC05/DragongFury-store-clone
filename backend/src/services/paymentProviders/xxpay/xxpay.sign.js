'use strict';

const crypto = require('crypto');

function sortValueRecursively(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortValueRecursively(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, k) => {
        const v = value[k];
        if (v === null || v === undefined || v === '') return acc;
        acc[k] = sortValueRecursively(v);
        return acc;
      }, {});
  }
  return value;
}

function getSignStr(params, key) {
  const sorted = sortValueRecursively({ ...params });
  delete sorted.sign;
  const queryString = Object.keys(sorted)
    .sort((a, b) => a.localeCompare(b))
    .filter((k) => {
      const v = sorted[k];
      return v !== null && v !== undefined && v !== '';
    })
    .map((k) => {
      const v = sorted[k];
      return `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`;
    })
    .join('&');
  return `${queryString}&key=${key}`;
}

function hashSign(signStr, signType) {
  const type = String(signType || 'MD5').toUpperCase();
  let hash;
  if (type === 'SHA1') hash = crypto.createHash('sha1').update(signStr).digest('hex');
  else if (type === 'SHA256') hash = crypto.createHash('sha256').update(signStr).digest('hex');
  else hash = crypto.createHash('md5').update(signStr).digest('hex');
  return hash.toUpperCase();
}

function signParams(params, key, signType = 'MD5') {
  const next = { ...params, signType: signType || params.signType || 'MD5' };
  delete next.sign;
  next.sign = hashSign(getSignStr(next, key), next.signType);
  return next;
}

function verifySign(params, key) {
  if (!params?.sign || !params?.signType) return false;
  const provided = String(params.sign).toUpperCase();
  const copy = { ...params };
  delete copy.sign;
  const expected = hashSign(getSignStr(copy, key), params.signType);
  return provided === expected;
}

module.exports = { signParams, verifySign, getSignStr, hashSign, sortValueRecursively };
