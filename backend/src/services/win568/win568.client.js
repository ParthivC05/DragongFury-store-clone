'use strict';

const axios = require('axios');
const config = require('../../configs/app.config');
const { resolveWin568Config, normalizeWin568Currency } = require('./win568.config');

const GAME_LIST_PATHS = [
  '/web-root/restricted/information/get-game-list.aspx',
  '/web-root/restricted/seamlessgameprovider/get-seamlessgameprovider-game-list.aspx'
];

function httpTimeout() {
  const ms = Number(config.get('http.thirdPartyTimeoutMs'));
  return Number.isFinite(ms) && ms > 0 ? ms : 120000;
}

function apiError(payload) {
  return payload && (payload.error || payload.Error) ? (payload.error || payload.Error) : null;
}

function errorId(payload) {
  const err = apiError(payload);
  if (!err || typeof err !== 'object') return null;
  const id = err.id ?? err.Id ?? err.ID;
  if (id == null || id === '') return null;
  const num = Number(id);
  return Number.isFinite(num) ? num : null;
}

function errorMsg(payload) {
  const err = apiError(payload);
  if (!err) return '';
  if (typeof err === 'string') return err;
  return String(err.msg || err.Msg || err.message || '').trim();
}

function isNoError(payload) {
  const id = errorId(payload);
  if (id === 0) return true;
  const msg = errorMsg(payload).toLowerCase().replace(/\s+/g, '');
  return msg === 'noerror' || msg === 'no error';
}

function isAlreadyExists(payload) {
  const id = errorId(payload);
  if (id === 4103) return true;
  const msg = errorMsg(payload).toLowerCase();
  return msg.includes('user exists') || msg.includes('already exist');
}

function normalizeApiBaseUrl(raw) {
  let base = String(raw || '').trim().replace(/\/+$/, '');
  const webRootAt = base.toLowerCase().indexOf('/web-root');
  if (webRootAt > 0) base = base.slice(0, webRootAt).replace(/\/+$/, '');
  return base;
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

function snippet(data) {
  const text = typeof data === 'string' ? data : (data == null ? '' : JSON.stringify(data));
  return text.replace(/\s+/g, ' ').slice(0, 180);
}

async function postOperator(path, fields, { json = false } = {}) {
  const { apiBaseUrl, companyKey, serverId } = resolveWin568Config();
  const base = normalizeApiBaseUrl(apiBaseUrl);
  if (!base || !companyKey) {
    const err = new Error('568Win operator API is not configured');
    err.statusCode = 503;
    throw err;
  }

  const body = {
    CompanyKey: companyKey,
    ServerId: String(serverId || 'dragonfury').slice(0, 15),
    ...(fields || {})
  };
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await axios.post(
    url,
    json ? body : new URLSearchParams({ param: JSON.stringify(body) }).toString(),
    {
      headers: json
        ? { 'Content-Type': 'application/json; charset=UTF-8' }
        : { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      timeout: httpTimeout(),
      validateStatus: () => true
    }
  );

  const payload = parsePayload(res.data);
  if (!payload) {
    const err = new Error(
      `568Win returned an invalid response (${res.status}) from ${url}. ${snippet(res.data) || 'Empty body'}`
    );
    err.statusCode = res.status === 404 ? 404 : 502;
    err.httpStatus = res.status;
    throw err;
  }
  return payload;
}

async function postOperatorPreferJson(path, fields) {
  const jsonPayload = await postOperator(path, fields, { json: true });
  if (isNoError(jsonPayload) || isAlreadyExists(jsonPayload)) return jsonPayload;
  const id = errorId(jsonPayload);
  if (id !== 2 && id !== 8) return jsonPayload;
  return postOperator(path, fields, { json: false });
}

async function registerPlayer({ username, agent, currency }) {
  const { currency: configuredCurrency } = resolveWin568Config();
  return postOperatorPreferJson('/web-root/restricted/player/register-player.aspx', {
    Username: username,
    Agent: agent,
    UserGroup: 'a',
    Currency: normalizeWin568Currency(currency || configuredCurrency || 'USD')
  });
}

function isSeamlessLoginPortfolio(portfolio) {
  return portfolio === 'SeamlessGame' || portfolio === 'ThirdPartySportsBook';
}

/**
 * 3.2.1 New Login first (all portfolios). Falls back to 3.2 if v2 is missing.
 * GpId/GameId belong on SeamlessGame / ThirdPartySportsBook only (3.8).
 * 3.2.1 New Login. SBO Slot: GpId 14 + GameId 0 (support TCP-121331).
 */
async function loginPlayer({ username, portfolio, lang, device, oddStyle, gpid, gameid }) {
  const fields = {
    Username: username,
    Portfolio: portfolio || 'SeamlessGame',
    Lang: lang || 'en',
    Device: device || 'd',
    OddStyle: oddStyle || 'EU',
    IsWapSports: false
  };
  if (isSeamlessLoginPortfolio(fields.Portfolio)) {
    const gp = Number(gpid);
    const gid = Number(gameid);
    fields.GpId = Number.isFinite(gp) && gp >= 0 ? gp : 0;
    fields.GameId = Number.isFinite(gid) && gid >= 0 ? gid : 0;
  }

  try {
    return await postOperatorPreferJson('/web-root/restricted/player/v2/login.aspx', fields);
  } catch (err) {
    if (err.httpStatus !== 404) throw err;
  }

  return postOperatorPreferJson('/web-root/restricted/player/login.aspx', {
    Username: username,
    Portfolio: fields.Portfolio,
    IsWapSports: false,
    ...(fields.GpId != null ? { GpId: fields.GpId, GameId: fields.GameId } : {})
  });
}

async function getSeamlessGameList({ gpid = 1, isGetAll = true } = {}) {
  const fields = {
    GpId: String(gpid),
    IsGetAll: isGetAll ? 'true' : 'false'
  };
  let lastErr = null;
  for (const path of GAME_LIST_PATHS) {
    try {
      const payload = await postOperatorPreferJson(path, fields);
      return payload;
    } catch (err) {
      lastErr = err;
      if (err.httpStatus !== 404) throw err;
    }
  }
  throw lastErr;
}

module.exports = {
  postOperator,
  registerPlayer,
  loginPlayer,
  getSeamlessGameList,
  isNoError,
  isAlreadyExists,
  errorId,
  errorMsg
};
