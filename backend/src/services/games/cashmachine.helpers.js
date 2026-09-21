'use strict';

/**
 * Official Cashmachine Agent API helpers.
 * Login: POST /api/agent/login (form-data username/password) → Bearer JWT
 * Player APIs: insertPlayer, playerList, getScore, playerRecharge, playerWithdraw
 *
 * Existing CashMachine777 bot (streamlit) stays on game_key `cashmachine777`.
 * Agent path is explicit `cashmachine_agent` only.
 */
const axios = require('axios');
const https = require('https');
const db = require('../../db/models');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { captureBotApiResponse } = require('../../utils/botApiHelper');
const {
  isCashmachineAgentGame,
  resolveGameIntegrationKey
} = require('../../utils/gameIntegration.helpers');
const CASHMACHINE_CONFIG = require('./cashmachine.config');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const CASHMACHINE_PASSWORD_MIN = CASHMACHINE_CONFIG.PASSWORD_MIN_LENGTH;
const CASHMACHINE_PASSWORD_MAX = CASHMACHINE_CONFIG.PASSWORD_MAX_LENGTH;
/** BT/nginx on this host resets keep-alive HTTPS; disable it. */
const cashmachineHttpsAgent = new https.Agent({
  keepAlive: false,
  rejectUnauthorized: false
});

function normalizeCashmachineApiBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/$/, '');
}

async function resolveCashmachineBotBaseUrl(game) {
  let fromTemplate = '';

  if (game?.gameTemplateId) {
    const linkedTemplate = await db.GameTemplate.findByPk(game.gameTemplateId, {
      attributes: ['botBaseUrl', 'gameKey']
    });
    fromTemplate = normalizeCashmachineApiBaseUrl(linkedTemplate?.botBaseUrl);
  }

  if (!fromTemplate) {
    const gameKey = resolveGameIntegrationKey(game);
    const templates = await db.GameTemplate.findAll({
      where: { isActive: true },
      attributes: ['name', 'gameKey', 'botBaseUrl'],
      order: [['updated_at', 'DESC']]
    });
    const template = templates.find(
      (t) => isCashmachineAgentGame(t) && resolveGameIntegrationKey(t) === gameKey
    );
    fromTemplate = normalizeCashmachineApiBaseUrl(template?.botBaseUrl);
  }

  const fromGame = normalizeCashmachineApiBaseUrl(game?.botApiUrl);
  const resolved = fromTemplate || fromGame || CASHMACHINE_CONFIG.DEFAULT_BASE_URL;

  if (fromTemplate && game?.id && fromTemplate !== fromGame) {
    await db.Game.update(
      { botApiUrl: fromTemplate.slice(0, 512) },
      { where: { id: game.id } }
    );
    game.botApiUrl = fromTemplate;
  }

  return resolved;
}

function getCashmachineErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.msg === 'string' && data.msg.trim()) return data.msg.trim();
  return fallback;
}

function readCashmachineStatusCode(data, httpStatus) {
  const raw = data && data.status_code != null ? data.status_code : httpStatus;
  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum : raw;
}

function isCashmachineSuccess(data, httpStatus) {
  const code = readCashmachineStatusCode(data, httpStatus);
  return CASHMACHINE_CONFIG.SUCCESS_STATUS_CODES.has(code) || CASHMACHINE_CONFIG.SUCCESS_STATUS_CODES.has(String(code));
}

function isCashmachineTokenExpiredResponse(res, data) {
  if (res.status === 401) return true;
  const code = readCashmachineStatusCode(data, res.status);
  if (code === 401) return true;
  const msg = getCashmachineErrorMessage(data, '').toLowerCase();
  return (
    msg.includes('unauthenticated')
    || msg.includes('unauthorized')
    || msg.includes('token') && (msg.includes('expired') || msg.includes('invalid'))
  );
}

function isCashmachinePlayerInGameMessage(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('still in the game') || msg.includes('return to the game lobby');
}

function isCashmachineUserAlreadyExistsMessage(message) {
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

function isCashmachineTransportError(err) {
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

function throwCashmachineTransportError(err) {
  const wrapped = new Error(
    'Cashmachine Agent API closed the HTTPS connection. This server IP or country is likely blocked. Add the game from your US/production backend, or ask Cashmachine to whitelist this server.'
  );
  wrapped.statusCode = 502;
  wrapped.cause = err;
  throw wrapped;
}

function buildCashmachineAuthHeaders(bearerToken) {
  const headers = {
    accept: 'application/json',
    'user-agent': 'Mozilla/5.0'
  };
  const token = normalizeBearerToken(bearerToken);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function axiosCashmachinePost(url, data, headers) {
  try {
    return await axios.post(url, data, {
      headers,
      timeout: HTTP_TIMEOUT_MS,
      httpsAgent: cashmachineHttpsAgent,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true
    });
  } catch (err) {
    if (isCashmachineTransportError(err)) throwCashmachineTransportError(err);
    throw err;
  }
}

async function postCashmachineForm(url, fields, bearerToken) {
  const authHeaders = buildCashmachineAuthHeaders(bearerToken);
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
  const res = await axiosCashmachinePost(url, buffer, multipartHeaders);
  const msg = getCashmachineErrorMessage(res.data, '');
  const shouldRetryUrlencoded = res.status === 415
    || res.status === 422
    || (res.status === 400 && /content.?type|unsupported media/i.test(msg));
  if (!shouldRetryUrlencoded) return res;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields || {})) {
    if (value == null) continue;
    body.append(key, String(value));
  }
  return axiosCashmachinePost(url, body.toString(), {
    ...authHeaders,
    'content-type': 'application/x-www-form-urlencoded'
  });
}

async function callCashmachineAgentLogin(baseUrl, username, password) {
  const root = normalizeCashmachineApiBaseUrl(baseUrl);
  if (!root) {
    const err = new Error('Game is missing provider configuration (API URL).');
    err.statusCode = 400;
    throw err;
  }
  const url = `${root}${CASHMACHINE_CONFIG.PATHS.LOGIN}`;
  const res = await postCashmachineForm(url, {
    username: String(username || '').trim(),
    password: String(password || '')
  });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isCashmachineSuccess(data, res.status)) {
    const msg = getCashmachineErrorMessage(data, 'Agent login failed');
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

const cashmachineTokenRefreshByGameId = new Map();

function isCashmachineAgentTokenRetryableError(err, preferStoredToken) {
  if (!err) return false;
  if (err.isTokenExpired || err.statusCode === 401 || err.statusCode === 403) return true;
  if (!preferStoredToken) return false;
  if (err.internalValidation) return false;
  if (err.statusCode === 404 || err.isSearchUserNotFound) return false;
  if (err.isUserAlreadyExists) return false;
  if (err.statusCode === 400) return false;
  const code = err.statusCode;
  if (code === 502 || code === 503 || code === 504) return true;
  return isCashmachineTransportError(err);
}

async function refreshCashmachineAgentToken(game) {
  const gameId = game?.id;
  if (gameId != null) {
    const inFlight = cashmachineTokenRefreshByGameId.get(gameId);
    if (inFlight) return inFlight;
  }
  const work = refreshCashmachineAgentTokenImpl(game).finally(() => {
    if (gameId != null) cashmachineTokenRefreshByGameId.delete(gameId);
  });
  if (gameId != null) cashmachineTokenRefreshByGameId.set(gameId, work);
  return work;
}

async function refreshCashmachineAgentTokenImpl(game) {
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
  const baseUrl = await resolveCashmachineBotBaseUrl(game);
  const storeUsername = String(game.botUsername || '').trim();
  const storePassword = String(game.botPassword || '');
  if (!baseUrl || !storeUsername || !storePassword) {
    const err = new Error('Game is missing agent login credentials.');
    err.statusCode = 503;
    throw err;
  }
  const loginResult = await callCashmachineAgentLogin(baseUrl, storeUsername, storePassword);
  const token = loginResult.token;
  await db.Game.update({ streamlitToken: token.slice(0, 512) }, { where: { id: game.id } });
  game.streamlitToken = token;
  game.botApiUrl = baseUrl;
  return token;
}

async function ensureCashmachineAgentToken(game) {
  const token = normalizeBearerToken(game.streamlitToken);
  if (token) return token;
  return refreshCashmachineAgentToken(game);
}

/**
 * Run a Cashmachine agent API call with Bearer auth; refresh JWT once on expiry.
 * @template T
 * @param {object} game
 * @param {(token: string) => Promise<T>} requestFn
 * @param {{ preferStoredToken?: boolean }} [options]
 */
async function withCashmachineAgentTokenRetry(game, requestFn, options = {}) {
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
    ? await ensureCashmachineAgentToken(game)
    : await refreshCashmachineAgentToken(game);
  let usedFreshLogin = !preferStoredToken;
  try {
    return await requestFn(token);
  } catch (err) {
    if (usedFreshLogin || !isCashmachineAgentTokenRetryableError(err, preferStoredToken)) throw err;
    token = await refreshCashmachineAgentToken(game);
    usedFreshLogin = true;
    return requestFn(token);
  }
}

function throwFromCashmachineResponse(res, data, fallback, extra = {}) {
  if (isCashmachineTokenExpiredResponse(res, data)) {
    const err = new Error('Agent session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
  const msg = getCashmachineErrorMessage(data, fallback);
  const playerInGame = extra.allowPlayerInGame !== false && isCashmachinePlayerInGameMessage(msg);
  const userAlreadyExists = isCashmachineUserAlreadyExistsMessage(msg);
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

async function getCashmachineJson(url, bearerToken, params) {
  try {
    return await axios.get(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0',
        Authorization: `Bearer ${normalizeBearerToken(bearerToken)}`
      },
      params,
      timeout: HTTP_TIMEOUT_MS,
      httpsAgent: cashmachineHttpsAgent,
      validateStatus: () => true
    });
  } catch (err) {
    if (isCashmachineTransportError(err)) throwCashmachineTransportError(err);
    throw err;
  }
}

async function callCashmachinePlayerList(game, bearerToken, { page = 1, limit = CASHMACHINE_CONFIG.PLAYER_LIST_PAGE_SIZE } = {}) {
  const baseUrl = await resolveCashmachineBotBaseUrl(game);
  const url = `${baseUrl}${CASHMACHINE_CONFIG.PATHS.PLAYER_LIST}`;
  const res = await getCashmachineJson(url, bearerToken, { page, limit });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isCashmachineSuccess(data, res.status)) {
    throwFromCashmachineResponse(res, data, 'Could not load Cashmachine players.');
  }
  const rows = Array.isArray(data.data) ? data.data : [];
  return {
    count: Number(data.count) || rows.length,
    players: rows.map(normalizePlayerRow).filter(Boolean)
  };
}

async function findCashmachinePlayerByUsername(game, bearerToken, username) {
  const needle = String(username || '').trim().toLowerCase();
  if (!needle) return null;
  for (let page = 1; page <= CASHMACHINE_CONFIG.PLAYER_LIST_MAX_PAGES; page += 1) {
    const { players } = await callCashmachinePlayerList(game, bearerToken, {
      page,
      limit: CASHMACHINE_CONFIG.PLAYER_LIST_PAGE_SIZE
    });
    if (!players.length) break;
    const match = players.find((p) => String(p.account || '').trim().toLowerCase() === needle);
    if (match && match.id) return match;
    if (players.length < CASHMACHINE_CONFIG.PLAYER_LIST_PAGE_SIZE) break;
  }
  return null;
}

async function callCashmachineInsertPlayer(game, bearerToken, { username, nickname, password, money = 0 }) {
  const baseUrl = await resolveCashmachineBotBaseUrl(game);
  const url = `${baseUrl}${CASHMACHINE_CONFIG.PATHS.INSERT_PLAYER}`;
  const body = {
    username: String(username || '').trim(),
    nickname: String(nickname || username || '').trim() || String(username || '').trim(),
    password: String(password || ''),
    money: String(money == null ? 0 : money)
  };
  const res = await postCashmachineForm(url, body, bearerToken);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isCashmachineSuccess(data, res.status)) {
    throwFromCashmachineResponse(res, data, 'Could not create your game account. Please try again later.');
  }
  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  const accountName = String(payload.account || payload.username || body.username).trim();
  let providerUserId = extractPlayerId(payload);
  if (!providerUserId) {
    const found = await findCashmachinePlayerByUsername(game, bearerToken, accountName);
    providerUserId = found?.id || '';
  }
  return {
    account_name: accountName || body.username,
    password: String(payload.password || body.password),
    provider_user_id: providerUserId || null,
    balance: payload.balance
  };
}

async function registerCashmachineUser(game, username, password, nickname) {
  return withCashmachineAgentTokenRetry(game, (token) =>
    callCashmachineInsertPlayer(game, token, { username, nickname, password, money: 0 })
  );
}

async function callCashmachineGetScore(game, bearerToken, providerUserId) {
  const id = String(providerUserId || '').trim();
  if (!id) {
    const err = new Error('Your Cashmachine account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }
  const baseUrl = await resolveCashmachineBotBaseUrl(game);
  const url = `${baseUrl}${CASHMACHINE_CONFIG.PATHS.GET_SCORE}`;
  const res = await getCashmachineJson(url, bearerToken, { id });
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isCashmachineSuccess(data, res.status)) {
    throwFromCashmachineResponse(res, data, 'Could not load Cashmachine balance.');
  }
  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  const balanceRaw = payload.balance != null ? payload.balance : payload.score;
  if (balanceRaw == null) {
    const err = new Error('Cashmachine balance response did not include a score.');
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

async function queryCashmachineUserBalance(game, providerUserId) {
  return withCashmachineAgentTokenRetry(
    game,
    (token) => callCashmachineGetScore(game, token, providerUserId),
    { preferStoredToken: true }
  );
}

async function callCashmachineCreditsAction(game, bearerToken, providerUserId, amount, { withdraw = false, remark = 'platform' } = {}) {
  const id = String(providerUserId || '').trim();
  if (!id) {
    const err = new Error('Your Cashmachine account is missing provider ID. Please register the game account again.');
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
  const baseUrl = await resolveCashmachineBotBaseUrl(game);
  const path = withdraw ? CASHMACHINE_CONFIG.PATHS.WITHDRAW : CASHMACHINE_CONFIG.PATHS.RECHARGE;
  const url = `${baseUrl}${path}`;
  const res = await postCashmachineForm(url, {
    id,
    balance: String(n),
    remark: String(remark || 'platform').slice(0, 128)
  }, bearerToken);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (!isCashmachineSuccess(data, res.status)) {
    throwFromCashmachineResponse(
      res,
      data,
      withdraw ? 'Could not withdraw from Cashmachine.' : 'Could not deposit to Cashmachine.'
    );
  }
  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  return {
    username: payload.username != null ? String(payload.username) : '',
    balance: payload.balance != null ? Number(payload.balance) : null,
    game_id: extractPlayerId(payload) || id
  };
}

async function rechargeCashmachineUser(game, providerUserId, amount, remark) {
  return withCashmachineAgentTokenRetry(game, (token) =>
    callCashmachineCreditsAction(game, token, providerUserId, amount, { withdraw: false, remark })
  );
}

async function redeemCashmachineUser(game, providerUserId, amount, remark) {
  return withCashmachineAgentTokenRetry(game, (token) =>
    callCashmachineCreditsAction(game, token, providerUserId, amount, { withdraw: true, remark })
  );
}

async function persistCashmachineProviderUserId(userGameAccount, providerUserId, transaction) {
  const id = String(providerUserId || '').trim();
  if (!id || !userGameAccount) return '';
  await userGameAccount.update({ providerUserId: id.slice(0, 64) }, { transaction });
  userGameAccount.providerUserId = id.slice(0, 64);
  return userGameAccount.providerUserId;
}

async function fetchAndPersistCashmachineProviderUserId(game, userGameAccount, transaction) {
  const accountName = String(userGameAccount?.botUsername || '').trim();
  if (!accountName) return '';
  const found = await withCashmachineAgentTokenRetry(
    game,
    (token) => findCashmachinePlayerByUsername(game, token, accountName),
    { preferStoredToken: true }
  );
  if (!found?.id) return '';
  return persistCashmachineProviderUserId(userGameAccount, found.id, transaction);
}

async function ensureCashmachineProviderUserId(game, userGameAccount, transaction) {
  const existing = String(userGameAccount?.providerUserId || '').trim();
  if (existing) return existing;
  return fetchAndPersistCashmachineProviderUserId(game, userGameAccount, transaction);
}

async function withCashmachineProviderUserIdRetry({ game, userGameAccount, transaction = null, operation }) {
  let providerUserId = await ensureCashmachineProviderUserId(game, userGameAccount, transaction);
  if (!providerUserId) {
    const err = new Error('Your Cashmachine account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }
  try {
    return await operation(providerUserId);
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    const maybeStaleId = err?.statusCode === 404 || msg.includes('not found') || msg.includes('does not exist');
    if (!maybeStaleId) throw err;
    providerUserId = await fetchAndPersistCashmachineProviderUserId(game, userGameAccount, transaction);
    if (!providerUserId) throw err;
    return operation(providerUserId);
  }
}

function generateCashmachinePassword() {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = '!#$%';
  const len = CASHMACHINE_PASSWORD_MIN
    + Math.floor(Math.random() * (CASHMACHINE_PASSWORD_MAX - CASHMACHINE_PASSWORD_MIN + 1));
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
  CASHMACHINE_CONFIG,
  isCashmachineAgentGame,
  normalizeCashmachineApiBaseUrl,
  resolveCashmachineBotBaseUrl,
  callCashmachineAgentLogin,
  refreshCashmachineAgentToken,
  ensureCashmachineAgentToken,
  withCashmachineAgentTokenRetry,
  callCashmachineInsertPlayer,
  registerCashmachineUser,
  findCashmachinePlayerByUsername,
  callCashmachineGetScore,
  queryCashmachineUserBalance,
  rechargeCashmachineUser,
  redeemCashmachineUser,
  persistCashmachineProviderUserId,
  ensureCashmachineProviderUserId,
  withCashmachineProviderUserIdRetry,
  generateCashmachinePassword,
  CASHMACHINE_PASSWORD_MIN,
  CASHMACHINE_PASSWORD_MAX
};
