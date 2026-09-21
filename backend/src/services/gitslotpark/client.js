'use strict';

const axios = require('axios');
const { resolveGitslotparkConfig } = require('./gitslotpark.config');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');

/**
 * GitSlotPark low-level HTTP client.
 */
async function request(req, method, path, options = {}) {
  const { baseUrl, authToken } = resolveGitslotparkConfig(req);
  const url = path.startsWith('http') ? path : `${baseUrl}/${path.replace(/^\//, '')}`;
  const headers = {
    Accept: 'application/json',
    ...options.headers
  };

  if (options.body != null) {
    headers['Content-Type'] = 'application/json';
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const axiosConfig = {
    method,
    url,
    headers,
    timeout: THIRD_PARTY_HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    ...(options.body != null && { data: options.body })
  };

  try {
    const res = await axios(axiosConfig);
    if (res.status >= 400) {
      const data = res.data;
      const wrapped = new Error(
        (data && (data.message || data.error)) || `GitSlotPark API error: ${res.status}`
      );
      wrapped.statusCode = res.status;
      wrapped.response = data;
      throw wrapped;
    }
    return res.data;
  } catch (err) {
    if (err.response || err.statusCode) throw err;
    const wrapped = new Error(err.message || 'GitSlotPark API request failed');
    wrapped.statusCode = 502;
    throw wrapped;
  }
}

module.exports = { request };
