'use strict';

const { readStoreEnv, resolveStoreCodeFromReq } = require('../../../utils/storeEnv.helpers');

function credentialsFromEnv(storeCode) {
  const merchantId = readStoreEnv('DOLLARPAY_MERCHANT_ID', storeCode);
  const apiKey = readStoreEnv('DOLLARPAY_KEY', storeCode) || readStoreEnv('DOLLARPAY_API_KEY', storeCode);
  if (!merchantId || !apiKey) return null;
  return { merchantId, apiKey };
}

function getDollarpayCredentialsFromRequest(req) {
  const storeCode = resolveStoreCodeFromReq(req);
  return credentialsFromEnv(storeCode);
}

function requireDollarpayCredentials(req) {
  const creds = getDollarpayCredentialsFromRequest(req);
  if (!creds) {
    const err = new Error(
      'DollarPay credentials missing. Set DOLLARPAY_MERCHANT_ID_DRAGONFURY and DOLLARPAY_KEY_DRAGONFURY on the backend.'
    );
    err.statusCode = 400;
    throw err;
  }
  return creds;
}

module.exports = { getDollarpayCredentialsFromRequest, requireDollarpayCredentials };
