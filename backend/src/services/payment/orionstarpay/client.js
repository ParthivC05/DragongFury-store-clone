'use strict';

const axios = require('axios');
const { getPaymentConfig, isPaymentLogEnabled, isPaymentErrorLogEnabled } = require('../payment.config');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');

function sanitizeBodyForLog(path, body) {
  const isSensitive = path.includes('auth/login') || path.includes('auth/signup') || path.includes('password-reset');
  if (!isSensitive || !body || typeof body !== 'object') return body;
  return {
    ...body,
    ...(body.password ? { password: '***' } : {}),
    ...(body.newPassword ? { newPassword: '***' } : {})
  };
}

/**
 * OrionStarPay low-level HTTP client.
 * Keeps request/response logging behavior consistent with existing payment flows.
 */
async function request(method, path, options = {}) {
  const { baseUrl } = getPaymentConfig();
  const url = path.startsWith('http') ? path : `${baseUrl}/${path.replace(/^\//, '')}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  const axiosConfig = {
    method,
    url,
    headers,
    ...(options.body != null && { data: options.body })
  };

  if (isPaymentLogEnabled()) {
    paymentLog('--- Payment API REQUEST ---');
    paymentLog('method:', method, 'url:', url);
    if (options.body != null) {
      paymentLog('request body:', sanitizeBodyForLog(path, options.body));
    }
  }

  try {
    const res = await axios(axiosConfig);
    if (isPaymentLogEnabled()) {
      paymentLog('--- Payment API RESPONSE ---');
      paymentLog('status:', res.status, 'url:', url);
      paymentLog('response body:', res.data);
    }
    return res.data;
  } catch (err) {
    if (isPaymentErrorLogEnabled()) {
      paymentErrorLog('--- Payment API request failed ---');
      paymentErrorLog('method:', method, 'url:', url);
      if (options.body != null) paymentErrorLog('request body:', sanitizeBodyForLog(path, options.body));
      paymentErrorLog('HTTP status:', err.response?.status ?? 'none (network/connection)');
      if (err.response?.data) paymentErrorLog('response body:', err.response.data);
      paymentErrorLog('message:', err.message);
      if (err.code) paymentErrorLog('code:', err.code);
      if (err.stack) paymentErrorLog('stack:', err.stack);
    }

    if (isPaymentLogEnabled()) {
      paymentLog('--- Payment API ERROR RESPONSE ---');
      paymentLog('status:', err.response?.status ?? 'network', 'url:', url);
      if (err.response?.data) paymentLog('error response body:', err.response.data);
      if (err.message) paymentLog('message:', err.message);
    }

    if (err.response) {
      const data = err.response.data;
      const wrapped = new Error((data && (data.message || data.error)) || `Payment API error: ${err.response.status}`);
      wrapped.statusCode = err.response.status;
      wrapped.response = data;
      throw wrapped;
    }
    throw err;
  }
}

module.exports = { request };
