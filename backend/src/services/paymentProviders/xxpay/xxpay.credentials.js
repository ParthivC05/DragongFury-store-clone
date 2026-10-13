'use strict';

const { readStoreEnv, resolveStoreCodeFromReq } = require('../../../utils/storeEnv.helpers');

function credentialsFromEnv(storeCode) {
  const mchNo = readStoreEnv('XXPAY_MCH_NO', storeCode);
  const apiKey = readStoreEnv('XXPAY_API_KEY', storeCode);
  const baseUrl = readStoreEnv('XXPAY_BASE_URL', storeCode).replace(/\/+$/, '');
  if (!mchNo || !apiKey) return null;
  return { mchNo, apiKey, baseUrl: baseUrl || null };
}

function getXxpayCredentialsFromRequest(req) {
  const storeCode = resolveStoreCodeFromReq(req);
  return credentialsFromEnv(storeCode);
}

function requireXxpayCredentials(req) {
  const creds = getXxpayCredentialsFromRequest(req);
  if (!creds) {
    const err = new Error(
      'XXPay credentials missing. Set XXPAY_MCH_NO_DRAGONFURY and XXPAY_API_KEY_DRAGONFURY on the backend.'
    );
    err.statusCode = 400;
    throw err;
  }
  return creds;
}

module.exports = { getXxpayCredentialsFromRequest, requireXxpayCredentials };
