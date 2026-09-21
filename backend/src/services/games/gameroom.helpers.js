'use strict';

/**
 * Official Gameroom Agent API helpers.
 * Login: POST /api/agent/login (form-data username/password) → Bearer JWT
 * Player APIs: insertPlayer, playerList, getScore, playerRecharge, playerWithdraw
 *
 * Existing Gameroom bot (streamlit) stays on game_key `gameroom`.
 * Agent path is explicit `gameroom_agent` only.
 */
const axios = require('axios');
const https = require('https');
const db = require('../../db/models');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { captureBotApiResponse } = require('../../utils/botApiHelper');
const {
  isGameroomAgentGame,
  resolveGameIntegrationKey
} = require('../../utils/gameIntegration.helpers');
const GAMEROOM_CONFIG = require('./gameroom.config');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const GAMEROOM_PASSWORD_MIN = GAMEROOM_CONFIG.PASSWORD_MIN_LENGTH;
const GAMEROOM_PASSWORD_MAX = GAMEROOM_CONFIG.PASSWORD_MAX_LENGTH;
/** BT/nginx on this host resets keep-alive HTTPS; disable it. */
const gameroomHttpsAgent = new https.Agent({
  keepAlive: false,
  rejectUnauthorized: false
});

function normalizeGameroomApiBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/$/, '');
}

async function resolveGameroomBotBaseUrl(game) {
  let fromTemplate = '';

  if (game?.gameTemplateId) {
    const linkedTemplate = await db.GameTemplate.findByPk(game.gameTemplateId, {
      attributes: ['botBaseUrl', 'gameKey']
    });
    fromTemplate = normalizeGameroomApiBaseUrl(linkedTemplate?.botBaseUrl);
  }

  if (!fromTemplate) {
    const gameKey = resolveGameIntegrationKey(game);
    const templates = await db.GameTemplate.findAll({
      where: { isActive: true },
      attributes: ['name', 'gameKey', 'botBaseUrl'],
      order: [['updated_at', 'DESC']]
    });
    const template = templates.find(
      (t) => isGameroomAgentGame(t) && resolveGameIntegrationKey(t) === gameKey
    );
    fromTemplate = normalizeGameroomApiBaseUrl(template?.botBaseUrl);
  }

  const fromGame = normalizeGameroomApiBaseUrl(game?.botApiUrl);
  const resolved = fromTemplate || fromGame || GAMEROOM_CONFIG.DEFAULT_BASE_URL;

  if (fromTemplate && game?.id && fromTemplate !== fromGame) {
    await db.Game.update(
      { botApiUrl: fromTemplate.slice(0, 512) },
      { where: { id: game.id } }
    );
    game.botApiUrl = fromTemplate;
  }

  return resolved;
}

function getGameroomErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.msg === 'string' && data.msg.trim()) return data.msg.trim();
  return fallback;
}

function readGameroomStatusCode(data, httpStatus) {
  const raw = data && data.status_code != null ? data.status_code : httpStatus;
  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum : raw;
}

function isGameroomSuccess(data, httpStatus) {
  const code = readGameroomStatusCode(data, httpStatus);
  return GAMEROOM_CONFIG.SUCCESS_STATUS_CODES.has(code) || GAMEROOM_CONFIG.SUCCESS_STATUS_CODES.has(String(code));
}

function isGameroomTokenExpiredResponse(res, data) {
  if (res.status === 401) return true;
  const code = readGameroomStatusCode(data, res.status);
  if (code === 401) return true;
  const msg = getGameroomErrorMessage(data, '').toLowerCase();
  return (
    msg.includes('unauthenticated')
    || msg.includes('unauthorized')
    || msg.includes('token') && (msg.includes('expired') || msg.includes('invalid'))
  );
}

function isGameroomPlayerInGameMessage(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('still in the game') || msg.includes('return to the game lobby');
}

function isGameroomUserAlreadyExistsMessage(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('already exists')
    || msg.includes('already in use')
    || msg.includes('already taken')
    || msg.includes('duplicate')
    || msg.includes('unique')
  );
}

function normalizeBearerToken(raw) {
  return String(raw || '').trim().replace(/^Bearer\s+/i, '');
}

function isGameroomTransportError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === 'ECONNRESET'
    || code === 'ECONNABORTED'
    || code === 'ETIMEDOUT'
    || code === 'EPIPE'
    || msg.includes('socket hang up')
    || msg.includes('empty reply')
    || msg.includes('timeout')
  );
}

function throwGameroomTransportError(err) {
  const wrapped = new Error(
    'Gameroom Agent API closed the HTTPS connection. This server IP or country is likely blocked. Add the game from your US/production backend, or ask Gameroom to whitelist this server.'
  );
  wrapped.statusCode = 502;
  wrapped.cause = err;
  throw wrapped;
}

function buildGameroomAuthHeaders(bearerToken) {
  const headers = {
    accept: 'application/json',
    'user-agent': 'Mozilla/5.0'
  };
  const token = normalizeBearerToken(bearerToken);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function axiosGameroomPost(url, data, headers) {
  try {
    return await axios.post(url, data, {
      headers,
      timeout: HTTP_TIMEOUT_MS,
      httpsAgent: gameroomHttpsAgent,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true
    });
  } catch (err) {
    if (isGameroomTransportError(err)) throwGameroomTransportError(err);
    throw err;
  }
}

async function postGameroomForm(url, fields, bearerToken) {
  const authHeaders = buildGameroomAuthHeaders(bearerToken);
  const FormData = require('form-data');
  const form = new FormData();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value == null) continue;
    form.append(key, String(value));
  }
  const buffer = form.getBuffer();
  const multipartHeaders = {
    ...authHeaders,
    ...form.getHeaders(),
    'Content-Length': buffer.length
  };
  const res = await axiosGameroomPost(url, buffer, multipartHeaders);
  const msg = getGameroomErrorMessage(res.data, '');
  const shouldRetryUrlencoded = res.status === 415
    || res.status === 422
    || (res.status === 400 && /content.?type|unsupported media/i.test(msg));
  if (!shouldRetryUrlencoded) return res;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value == null) continue;
    body.append(key, String(value));
  }
  return axiosGameroomPost(url, body.toString(), {
    ...authHeaders,
    'content-type': 'application/x-www-form-urlencoded'
  });
}

async function callGameroomAgentLogin(baseUrl, username, password) {
  const root = normalizeGameroomApiBaseUrl(baseUrl);
  if (!root) {
    const err = new Error('Game is missing provider configuration (API URL).');
    err.statusCode = 400;
    throw err;
  }
  const url = `${root}${GAMEROOM_CONFIG.PATHS.LOGIN}`;
  const res = await postGameroomForm(url, {
    username: String(username || '').trim(),
    password: String(password || '')
  });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isGameroomSuccess(data, res.status)) {
    const msg = getGameroomErrorMessage(data, 'Agent login failed');
    const err = new Error(msg);
    const isAuthFailure = res.status === 401
      || /wrong username or password/i.test(msg)
      || /login failed/i.test(msg);
    err.statusCode = isAuthFailure ? 401 : (res.status >= 400 ? res.status : 502);
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  const token = normalizeBearerToken(payload.token);
  if (!token) {
    const err = new Error('Agent login did not return a token.');
    err.statusCode = 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
  return {
    success: true,
    token,
    expiresTime: payload.expires_time != null ? Number(payload.expires_time) : null,
    money: payload.money,
    userName: payload.userName
  };
}

const gameroomTokenRefreshByGameId = new Map();

function isGameroomAgentTokenRetryableError(err, preferStoredToken) {
  if (!err) return false;
  if (err.isTokenExpired || err.statusCode === 401 || err.statusCode === 403) return true;
  if (!preferStoredToken) return false;
  if (err.internalValidation) return false;
  if (err.statusCode === 404 || err.isSearchUserNotFound) return false;
  if (err.isUserAlreadyExists) return false;
  if (err.statusCode === 400) return false;
  const code = err.statusCode;
  if (code === 502 || code === 503 || code === 504) return true;
  return isGameroomTransportError(err);
}

async function refreshGameroomAgentToken(game) {
  const gameId = game?.id;
  if (gameId != null) {
    const inFlight = gameroomTokenRefreshByGameId.get(gameId);
    if (inFlight) return inFlight;
  }
  const work = refreshGameroomAgentTokenImpl(game).finally(() => {
    if (gameId != null) gameroomTokenRefreshByGameId.delete(gameId);
  });
  if (gameId != null) gameroomTokenRefreshByGameId.set(gameId, work);
  return work;
}

async function refreshGameroomAgentTokenImpl(game) {
  if (game?.id) {
    const fresh = await db.Game.findByPk(game.id, {
      attributes: ['id', 'botApiUrl', 'botUsername', 'botPassword', 'gameTemplateId', 'gameKey', 'name']
    });
    if (fresh) {
      game.botApiUrl = fresh.botApiUrl;
      game.botUsername = fresh.botUsername;
      game.botPassword = fresh.botPassword;
      game.gameTemplateId = fresh.gameTemplateId;
      game.gameKey = fresh.gameKey;
      game.name = fresh.name;
    }
  }
  const baseUrl = await resolveGameroomBotBaseUrl(game);
  const storeUsername = String(game.botUsername || '').trim();
  const storePassword = String(game.botPassword || '');
  if (!baseUrl || !storeUsername || !storePassword) {
    const err = new Error('Game is missing agent login credentials.');
    err.statusCode = 503;
    throw err;
  }
  const loginResult = await callGameroomAgentLogin(baseUrl, storeUsername, storePassword);
  const token = loginResult.token;
  await db.Game.update({ streamlitToken: token.slice(0, 512) }, { where: { id: game.id } });
  game.streamlitToken = token;
  game.botApiUrl = baseUrl;
  return token;
}

async function ensureGameroomAgentToken(game) {
  const token = normalizeBearerToken(game.streamlitToken);
  if (token) return token;
  return refreshGameroomAgentToken(game);
}

/**
 * Run a Gameroom agent API call with Bearer auth; refresh JWT once on expiry.
 * @template T
 * @param {object} game
 * @param {(token: string) => Promise<T>} requestFn
 * @param {{ preferStoredToken?: boolean }} [options]
 */
async function withGameroomAgentTokenRetry(game, requestFn, options = {}) {
  const preferStoredToken = options.preferStoredToken === true;
  if (preferStoredToken && game?.id) {
    const fresh = await db.Game.findByPk(game.id, {
      attributes: ['streamlitToken', 'botUsername', 'botPassword', 'botApiUrl', 'gameTemplateId', 'gameKey', 'name']
    });
    if (fresh) {
      game.streamlitToken = fresh.streamlitToken;
      game.botUsername = fresh.botUsername;
      game.botPassword = fresh.botPassword;
      game.botApiUrl = fresh.botApiUrl;
      game.gameTemplateId = fresh.gameTemplateId;
      game.gameKey = fresh.gameKey;
      game.name = fresh.name;
    }
  }

  let token = preferStoredToken
    ? await ensureGameroomAgentToken(game)
    : await refreshGameroomAgentToken(game);
  let usedFreshLogin = !preferStoredToken;
  try {
    return await requestFn(token);
  } catch (err) {
    if (usedFreshLogin || !isGameroomAgentTokenRetryableError(err, preferStoredToken)) throw err;
    token = await refreshGameroomAgentToken(game);
    usedFreshLogin = true;
    return requestFn(token);
  }
}

function throwFromGameroomResponse(res, data, fallback, extra = {}) {
  if (isGameroomTokenExpiredResponse(res, data)) {
    const err = new Error('Agent session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
  const msg = getGameroomErrorMessage(data, fallback);
  const playerInGame = extra.allowPlayerInGame !== false && isGameroomPlayerInGameMessage(msg);
  const userAlreadyExists = isGameroomUserAlreadyExistsMessage(msg);
  const err = new Error(playerInGame
    ? 'The player is still in the game. Please return to the game lobby and try again.'
    : msg);
  err.statusCode = playerInGame ? 400 : (userAlreadyExists ? 409 : (res.status >= 400 ? res.status : 502));
  err.internalValidation = playerInGame;
  err.isUserAlreadyExists = userAlreadyExists;
  err.externalResponse = captureBotApiResponse(data, res.status);
  throw err;
}

function extractPlayerId(payload) {
  if (payload == null) return '';
  if (typeof payload !== 'object') {
    const asStr = String(payload).trim();
    return asStr || '';
  }
  const candidates = [
    payload.id,
    payload.game_id,
    payload.gameId,
    payload.player_id,
    payload.playerId
  ];
  for (const value of candidates) {
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function normalizePlayerRow(row) {
  if (!row || typeof row !== 'object') return null;
  const account = String(row.Account || row.account || row.username || row.userName || '').trim();
  const id = extractPlayerId(row);
  if (!account && !id) return null;
  return {
    id,
    account,
    nickname: String(row.nickname || row.Nickname || '').trim(),
    score: row.score != null ? Number(row.score) : null
  };
}

async function getGameroomJson(url, bearerToken, params) {
  try {
    return await axios.get(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0',
        Authorization: `Bearer ${normalizeBearerToken(bearerToken)}`
      },
      params,
      timeout: HTTP_TIMEOUT_MS,
      httpsAgent: gameroomHttpsAgent,
      validateStatus: () => true
    });
  } catch (err) {
    if (isGameroomTransportError(err)) throwGameroomTransportError(err);
    throw err;
  }
}

async function callGameroomPlayerList(game, bearerToken, { page = 1, limit = GAMEROOM_CONFIG.PLAYER_LIST_PAGE_SIZE } = {}) {
  const baseUrl = await resolveGameroomBotBaseUrl(game);
  const url = `${baseUrl}${GAMEROOM_CONFIG.PATHS.PLAYER_LIST}`;
  const res = await getGameroomJson(url, bearerToken, { page, limit });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isGameroomSuccess(data, res.status)) {
    throwFromGameroomResponse(res, data, 'Could not load Gameroom players.');
  }
  const rows = Array.isArray(data.data) ? data.data : [];
  return {
    count: Number(data.count) || rows.length,
    players: rows.map(normalizePlayerRow).filter(Boolean)
  };
}

async function findGameroomPlayerByUsername(game, bearerToken, username) {
  const needle = String(username || '').trim().toLowerCase();
  if (!needle) return null;
  for (let page = 1; page <= GAMEROOM_CONFIG.PLAYER_LIST_MAX_PAGES; page += 1) {
    const { players } = await callGameroomPlayerList(game, bearerToken, {
      page,
      limit: GAMEROOM_CONFIG.PLAYER_LIST_PAGE_SIZE
    });
    if (!players.length) break;
    const match = players.find((p) => String(p.account || '').trim().toLowerCase() === needle);
    if (match && match.id) return match;
    if (players.length < GAMEROOM_CONFIG.PLAYER_LIST_PAGE_SIZE) break;
  }
  return null;
}

async function callGameroomInsertPlayer(game, bearerToken, { username, nickname, password, money = 0 }) {
  const baseUrl = await resolveGameroomBotBaseUrl(game);
  const url = `${baseUrl}${GAMEROOM_CONFIG.PATHS.INSERT_PLAYER}`;
  const body = {
    username: String(username || '').trim(),
    nickname: String(nickname || username || '').trim() || String(username || '').trim(),
    password: String(password || ''),
    money: String(money == null ? 0 : money)
  };
  const res = await postGameroomForm(url, body, bearerToken);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isGameroomSuccess(data, res.status)) {
    throwFromGameroomResponse(res, data, 'Could not create your game account. Please try again later.');
  }
  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  const accountName = String(payload.account || payload.username || body.username).trim();
  let providerUserId = extractPlayerId(payload);
  if (!providerUserId) {
    const found = await findGameroomPlayerByUsername(game, bearerToken, accountName);
    providerUserId = found?.id || '';
  }
  return {
    account_name: accountName || body.username,
    password: String(payload.password || body.password),
    provider_user_id: providerUserId || null,
    balance: payload.balance
  };
}

async function registerGameroomUser(game, username, password, nickname) {
  return withGameroomAgentTokenRetry(game, (token) =>
    callGameroomInsertPlayer(game, token, { username, nickname, password, money: 0 })
  );
}

async function callGameroomGetScore(game, bearerToken, providerUserId) {
  const id = String(providerUserId || '').trim();
  if (!id) {
    const err = new Error('Your Gameroom account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }
  const baseUrl = await resolveGameroomBotBaseUrl(game);
  const url = `${baseUrl}${GAMEROOM_CONFIG.PATHS.GET_SCORE}`;
  const res = await getGameroomJson(url, bearerToken, { id });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isGameroomSuccess(data, res.status)) {
    throwFromGameroomResponse(res, data, 'Could not load Gameroom balance.');
  }
  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  const balanceRaw = payload.balance != null ? payload.balance : payload.score;
  if (balanceRaw == null) {
    const err = new Error('Gameroom balance response did not include a score.');
    err.statusCode = 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
  const balance = Number(balanceRaw);
  return {
    username: payload.username != null ? String(payload.username) : '',
    balance: Number.isFinite(balance) ? balance : 0,
    isGame: payload.is_game === true
  };
}

async function queryGameroomUserBalance(game, providerUserId) {
  return withGameroomAgentTokenRetry(
    game,
    (token) => callGameroomGetScore(game, token, providerUserId),
    { preferStoredToken: true }
  );
}

async function callGameroomCreditsAction(game, bearerToken, providerUserId, amount, { withdraw = false, remark = 'platform' } = {}) {
  const id = String(providerUserId || '').trim();
  if (!id) {
    const err = new Error('Your Gameroom account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error('Please enter at least 1 SC as a full amount.');
    err.statusCode = 400;
    err.internalValidation = true;
    throw err;
  }
  const baseUrl = await resolveGameroomBotBaseUrl(game);
  const path = withdraw ? GAMEROOM_CONFIG.PATHS.WITHDRAW : GAMEROOM_CONFIG.PATHS.RECHARGE;
  const url = `${baseUrl}${path}`;
  const res = await postGameroomForm(url, {
    id,
    balance: String(n),
    remark: String(remark || 'platform').slice(0, 128)
  }, bearerToken);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isGameroomSuccess(data, res.status)) {
    throwFromGameroomResponse(
      res,
      data,
      withdraw ? 'Could not withdraw from Gameroom.' : 'Could not deposit to Gameroom.'
    );
  }
  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  return {
    username: payload.username != null ? String(payload.username) : '',
    balance: payload.balance != null ? Number(payload.balance) : null,
    game_id: extractPlayerId(payload) || id
  };
}

async function rechargeGameroomUser(game, providerUserId, amount, remark) {
  return withGameroomAgentTokenRetry(game, (token) =>
    callGameroomCreditsAction(game, token, providerUserId, amount, { withdraw: false, remark })
  );
}

async function redeemGameroomUser(game, providerUserId, amount, remark) {
  return withGameroomAgentTokenRetry(game, (token) =>
    callGameroomCreditsAction(game, token, providerUserId, amount, { withdraw: true, remark })
  );
}

async function persistGameroomProviderUserId(userGameAccount, providerUserId, transaction) {
  const id = String(providerUserId || '').trim();
  if (!id || !userGameAccount) return '';
  await userGameAccount.update({ providerUserId: id.slice(0, 64) }, { transaction });
  userGameAccount.providerUserId = id.slice(0, 64);
  return userGameAccount.providerUserId;
}

async function fetchAndPersistGameroomProviderUserId(game, userGameAccount, transaction) {
  const accountName = String(userGameAccount?.botUsername || '').trim();
  if (!accountName) return '';
  const found = await withGameroomAgentTokenRetry(
    game,
    (token) => findGameroomPlayerByUsername(game, token, accountName),
    { preferStoredToken: true }
  );
  if (!found?.id) return '';
  return persistGameroomProviderUserId(userGameAccount, found.id, transaction);
}

async function ensureGameroomProviderUserId(game, userGameAccount, transaction) {
  const existing = String(userGameAccount?.providerUserId || '').trim();
  if (existing) return existing;
  return fetchAndPersistGameroomProviderUserId(game, userGameAccount, transaction);
}

async function withGameroomProviderUserIdRetry({ game, userGameAccount, transaction = null, operation }) {
  let providerUserId = await ensureGameroomProviderUserId(game, userGameAccount, transaction);
  if (!providerUserId) {
    const err = new Error('Your Gameroom account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }
  try {
    return await operation(providerUserId);
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    const maybeStaleId = err?.statusCode === 404 || msg.includes('not found') || msg.includes('does not exist');
    if (!maybeStaleId) throw err;
    providerUserId = await fetchAndPersistGameroomProviderUserId(game, userGameAccount, transaction);
    if (!providerUserId) throw err;
    return operation(providerUserId);
  }
}

function generateGameroomPassword() {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!@#$%';
  const len = GAMEROOM_PASSWORD_MIN
    + Math.floor(Math.random() * (GAMEROOM_PASSWORD_MAX - GAMEROOM_PASSWORD_MIN + 1));
  let pass = '';
  pass += lower[Math.floor(Math.random() * lower.length)];
  pass += upper[Math.floor(Math.random() * upper.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  pass += symbols[Math.floor(Math.random() * symbols.length)];
  const all = lower + upper + numbers + symbols;
  for (let i = pass.length; i < len; i++) {
    pass += all[Math.floor(Math.random() * all.length)];
  }
  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

module.exports = {
  GAMEROOM_CONFIG,
  isGameroomAgentGame,
  normalizeGameroomApiBaseUrl,
  resolveGameroomBotBaseUrl,
  callGameroomAgentLogin,
  refreshGameroomAgentToken,
  ensureGameroomAgentToken,
  withGameroomAgentTokenRetry,
  callGameroomInsertPlayer,
  registerGameroomUser,
  findGameroomPlayerByUsername,
  callGameroomGetScore,
  queryGameroomUserBalance,
  rechargeGameroomUser,
  redeemGameroomUser,
  persistGameroomProviderUserId,
  ensureGameroomProviderUserId,
  withGameroomProviderUserIdRetry,
  generateGameroomPassword,
  GAMEROOM_PASSWORD_MIN,
  GAMEROOM_PASSWORD_MAX
};
