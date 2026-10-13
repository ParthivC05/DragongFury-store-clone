'use strict';

const DEFAULT_STORE_CODE = 'dragonfury';

function envSuffix(storeCode) {
  return String(storeCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}

function resolveStoreCodeFromReq(req) {
  const fromUser = req?.user?.storeCode != null ? String(req.user.storeCode).trim() : '';
  const header = req?.headers && (req.headers['x-store-code'] || req.headers['x-storecode']);
  const fromHeader = header != null ? String(header).trim() : '';
  const fromQuery = req?.query?.store_code != null ? String(req.query.store_code).trim() : '';
  return fromUser || fromHeader || fromQuery || DEFAULT_STORE_CODE;
}

/** `NAME_DRAGONFURY` (or other store suffix), then unsuffixed `NAME`. */
function readStoreEnv(baseName, storeCode) {
  const suffix = envSuffix(storeCode || DEFAULT_STORE_CODE);
  if (suffix) {
    const named = String(process.env[`${baseName}_${suffix}`] || '').trim();
    if (named) return named;
  }
  return String(process.env[baseName] || '').trim();
}

module.exports = { DEFAULT_STORE_CODE, envSuffix, resolveStoreCodeFromReq, readStoreEnv };
