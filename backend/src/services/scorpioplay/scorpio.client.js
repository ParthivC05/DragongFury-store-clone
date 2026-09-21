'use strict';

const axios = require('axios');
const config = require('../../configs/app.config');
const { resolveScorpioConfig } = require('./scorpio.config');
const { createLogger } = require('../../libs/logger');

const log = createLogger('scorpio');

function httpTimeout() {
  const ms = Number(config.get('http.thirdPartyTimeoutMs'));
  return Number.isFinite(ms) && ms > 0 ? ms : 120000;
}

function snippet(data) {
  const text = typeof data === 'string' ? data : (data == null ? '' : JSON.stringify(data));
  return text.replace(/\s+/g, ' ').slice(0, 180);
}

function parsePayload(data) {
  if (data && typeof data === 'object') return data;
  if (typeof data !== 'string') return null;
  const text = data.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function isSuccess(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.success === true) return true;
  const code = String(payload.code || payload.statusCode || payload.message || '').toUpperCase();
  return code === 'OK' || code === 'SUCCESS';
}

function errorMessage(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(
    payload.message
    || payload.msg
    || payload.error
    || payload.code
    || payload.statusCode
    || ''
  ).trim();
}

function isAlreadyExists(payload) {
  const msg = errorMessage(payload).toLowerCase();
  return msg.includes('already') || msg.includes('exist') || String(payload.code || '').toUpperCase().includes('ALREADY');
}

async function request(method, path, { body, params } = {}) {
  const { apiBaseUrl, apiToken } = resolveScorpioConfig();
  if (!apiBaseUrl || !apiToken) {
    const err = new Error('Scorpio Play API is not configured');
    err.statusCode = 503;
    throw err;
  }

  const url = `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await axios({
    method,
    url,
    data: body,
    params,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    timeout: httpTimeout(),
    validateStatus: () => true
  });

  const payload = parsePayload(res.data);
  if (!payload) {
    const err = new Error(
      `Scorpio Play returned an invalid response (${res.status}) from ${url}. ${snippet(res.data) || 'Empty body'}`
    );
    err.statusCode = res.status === 404 ? 404 : 502;
    err.httpStatus = res.status;
    throw err;
  }
  payload.httpStatus = res.status;
  return payload;
}

async function listProviders() {
  return request('GET', '/v1/provider/list');
}

async function listGames(providerId) {
  return request('GET', `/v1/game/list/${encodeURIComponent(providerId)}`);
}

async function createPlayer(playerExternalId) {
  return request('POST', '/v1/player/create', {
    body: { playerExternalId: String(playerExternalId) }
  });
}

async function getPlayerInfo(playerExternalId) {
  return request('GET', '/v1/player/info', {
    params: { playerExternalId: String(playerExternalId) }
  });
}

async function launchGame(fields) {
  return request('POST', '/v1/game/launch', { body: fields });
}

module.exports = {
  isSuccess,
  isAlreadyExists,
  errorMessage,
  listProviders,
  listGames,
  createPlayer,
  getPlayerInfo,
  launchGame,
  log
};
