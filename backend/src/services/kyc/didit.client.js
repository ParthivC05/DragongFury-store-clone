'use strict';

const axios = require('axios');
const config = require('../../configs/app.config');

function getDiditConfig() {
  const apiBaseUrl = String(config.get('didit.apiBaseUrl') || 'https://verification.didit.me').replace(/\/+$/, '');
  const apiKey = String(config.get('didit.apiKey') || '').trim();
  const workflowId = String(config.get('didit.workflowId') || '').trim();
  const webhookSecret = String(config.get('didit.webhookSecret') || '').trim();
  return { apiBaseUrl, apiKey, workflowId, webhookSecret };
}

function assertConfigured() {
  const cfg = getDiditConfig();
  if (!cfg.apiKey || !cfg.workflowId) {
    const err = new Error('Didit KYC is not configured. Set DIDIT_API_KEY and DIDIT_WORKFLOW_ID.');
    err.statusCode = 503;
    throw err;
  }
  return cfg;
}

/** Phone OTP only needs the API key (standalone send/check). */
function assertApiKeyConfigured() {
  const cfg = getDiditConfig();
  if (!cfg.apiKey) {
    const err = new Error('Didit is not configured. Set DIDIT_API_KEY.');
    err.statusCode = 503;
    throw err;
  }
  return cfg;
}

function diditError(err, fallback) {
  const status = err.response?.status || 502;
  const detail =
    err.response?.data?.detail ||
    err.response?.data?.message ||
    (err.response?.data?.phone_number && Array.isArray(err.response.data.phone_number)
      ? err.response.data.phone_number[0]
      : null) ||
    err.message ||
    fallback;
  const e = new Error(typeof detail === 'string' ? detail : fallback);
  e.statusCode = status >= 400 && status < 500 ? status : 502;
  e.data = err.response?.data || null;
  return e;
}

/**
 * Standalone phone OTP send.
 * @param {{ phoneNumber: string, vendorData?: string, preferredChannel?: string, locale?: string }} opts
 */
async function sendPhoneCode(opts = {}) {
  const cfg = assertApiKeyConfigured();
  const phoneNumber = String(opts.phoneNumber || '').trim();
  if (!phoneNumber) {
    const err = new Error('Phone number is required.');
    err.statusCode = 400;
    throw err;
  }
  const body = {
    phone_number: phoneNumber,
    options: {
      preferred_channel: opts.preferredChannel || 'sms',
      locale: opts.locale || 'en-US'
    }
  };
  if (opts.vendorData) body.vendor_data = String(opts.vendorData);

  try {
    const res = await axios.post(`${cfg.apiBaseUrl}/v3/phone/send/`, body, {
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
      timeout: 30000
    });
    return res.data;
  } catch (err) {
    throw diditError(err, 'Could not send verification code.');
  }
}

/**
 * Standalone phone OTP check.
 * @param {{ phoneNumber: string, code: string, vendorData?: string }} opts
 */
async function checkPhoneCode(opts = {}) {
  const cfg = assertApiKeyConfigured();
  const phoneNumber = String(opts.phoneNumber || '').trim();
  const code = String(opts.code || '').trim();
  if (!phoneNumber || !code) {
    const err = new Error('Phone number and code are required.');
    err.statusCode = 400;
    throw err;
  }
  const body = { phone_number: phoneNumber, code };
  if (opts.vendorData) body.vendor_data = String(opts.vendorData);

  try {
    const res = await axios.post(`${cfg.apiBaseUrl}/v3/phone/check/`, body, {
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
      timeout: 30000
    });
    return res.data;
  } catch (err) {
    throw diditError(err, 'Could not verify code.');
  }
}

async function createSession(opts = {}) {
  const cfg = assertConfigured();
  const body = {
    workflow_id: cfg.workflowId,
    vendor_data: String(opts.vendorData || '')
  };
  if (opts.callback) body.callback = opts.callback;
  if (opts.metadata && typeof opts.metadata === 'object') body.metadata = opts.metadata;

  try {
    const res = await axios.post(`${cfg.apiBaseUrl}/v3/session/`, body, {
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
      timeout: 30000
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status || 502;
    const detail =
      err.response?.data?.detail ||
      err.response?.data?.message ||
      err.message ||
      'Didit session create failed';
    const e = new Error(typeof detail === 'string' ? detail : 'Didit session create failed');
    e.statusCode = status >= 400 && status < 500 ? status : 502;
    throw e;
  }
}

async function retrieveSession(sessionId) {
  const cfg = assertConfigured();
  const id = encodeURIComponent(String(sessionId || '').trim());
  if (!id) {
    const err = new Error('sessionId is required');
    err.statusCode = 400;
    throw err;
  }
  try {
    const res = await axios.get(`${cfg.apiBaseUrl}/v3/session/${id}/`, {
      headers: { 'x-api-key': cfg.apiKey },
      timeout: 20000
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status || 502;
    const detail = err.response?.data?.detail || err.message || 'Didit session retrieve failed';
    const e = new Error(typeof detail === 'string' ? detail : 'Didit session retrieve failed');
    e.statusCode = status >= 400 && status < 500 ? status : 502;
    throw e;
  }
}

module.exports = {
  getDiditConfig,
  assertConfigured,
  assertApiKeyConfigured,
  createSession,
  retrieveSession,
  sendPhoneCode,
  checkPhoneCode
};
