'use strict';

const axios = require('axios');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const {
  isAgentCredentialGame: isAgentCredentialGameByKey,
  isVegasXCashierGame: isVegasXCashierGameByKey,
  isOrionStarsTerminalGame: isOrionStarsTerminalGameByKey,
  isFirekirinTerminalGame: isFirekirinTerminalGameByKey,
  isMilkywayTerminalGame: isMilkywayTerminalGameByKey,
  isGameroomAgentGame: isGameroomAgentGameByKey,
  isCashmachineAgentGame: isCashmachineAgentGameByKey,
  isMafiaAgentGame: isMafiaAgentGameByKey,
  resolveGameIntegrationKey,
  getStoreGameDisplayName,
  CUSTOM_MANUAL_GAME_KEY
} = require('../../utils/gameIntegration.helpers');
const {
  isGoldenDragonGame,
  GOLDEN_DRAGON_KIOSK_ID_HELP,
  resolveKioskIdForGoldenDragon: resolveGoldenDragonKioskId,
  buildGoldenDragonGenerateKeyBody
} = require('./goldenDragon.helpers');
const { isJuwaNewBotGame, findLegacyJuwaImageUrlForStore } = require('./juwa.helpers');
const {
  isPandamasterNewBotGame,
  findLegacyPandamasterImageUrlForStore
} = require('./pandamaster.helpers');

const GAME_PROVIDER_BOT_TYPE = 'external';

/** Game names that use store credentials only (no game_key, streamlit_token, no third-party API calls). */
const SIMPLE_GAME_NAMES = ['Vblink', 'UltraPanda', 'Egame99'];

/** Axios request timeout (ms) for game provider admin APIs */
const PROVIDER_HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
/** Attempts per request: initial try + this many retries on timeout only */
const PROVIDER_TIMEOUT_RETRIES = 2;

function isProviderRequestTimeout(err) {
  if (!err) return false;
  if (axios.isAxiosError && axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') return true;
  }
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('timeout');
}

/**
 * Run an axios call; on timeout only, retry up to PROVIDER_TIMEOUT_RETRIES times.
 * After all attempts time out, throws a generic error (no axios timeout wording) for clients.
 * @template T
 * @param {() => Promise<T>} requestFn
 * @returns {Promise<T>}
 */
async function withProviderTimeoutRetry(requestFn) {
  const maxAttempts = 1 + PROVIDER_TIMEOUT_RETRIES;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await requestFn();
    } catch (e) {
      if (isProviderRequestTimeout(e) && attempt < maxAttempts) {
        continue;
      }
      if (isProviderRequestTimeout(e)) {
        const err = new Error('The game provider is taking too long to respond. Please try again in a moment.');
        err.statusCode = 504;
        throw err;
      }
      throw e;
    }
  }
}

function isSimpleGame(name) {
  const n = (name || '').trim();
  return SIMPLE_GAME_NAMES.some((g) => g.toLowerCase() === n.toLowerCase());
}

/** Agent API games (GameVault2, Juwa 2.0 Agent API, etc.) use agentId + apiSecretKey. */
function isAgentCredentialGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isAgentCredentialGameByKey({ name: gameOrName });
  }
  return isAgentCredentialGameByKey(gameOrName);
}

/** VegasX agent API: POST /cashier/login with store username/password. */
function isVegasXCashierGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isVegasXCashierGameByKey({ name: gameOrName });
  }
  return isVegasXCashierGameByKey(gameOrName);
}

/** Orion Stars Terminal API: POST agentLogin with store username/password. */
function isOrionStarsTerminalGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isOrionStarsTerminalGameByKey({ name: gameOrName });
  }
  return isOrionStarsTerminalGameByKey(gameOrName);
}

/** Firekirin Terminal Agent API: POST agentLogin with store username/password. */
function isFirekirinTerminalGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isFirekirinTerminalGameByKey({ name: gameOrName });
  }
  return isFirekirinTerminalGameByKey(gameOrName);
}

/** Milkyway Terminal Agent API: POST agentLogin with store username/password. */
function isMilkywayTerminalGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isMilkywayTerminalGameByKey({ name: gameOrName });
  }
  return isMilkywayTerminalGameByKey(gameOrName);
}

/** Official Gameroom Agent API: POST /api/agent/login with store username/password. */
function isGameroomAgentGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isGameroomAgentGameByKey({ name: gameOrName });
  }
  return isGameroomAgentGameByKey(gameOrName);
}

/** Official Cashmachine Agent API: POST /api/agent/login with store username/password. */
function isCashmachineAgentGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isCashmachineAgentGameByKey({ name: gameOrName });
  }
  return isCashmachineAgentGameByKey(gameOrName);
}

/** Official Mafia Agent API: POST /api/agent/login with store username/password. */
function isMafiaAgentGame(gameOrName) {
  if (typeof gameOrName === 'string') {
    return isMafiaAgentGameByKey({ name: gameOrName });
  }
  return isMafiaAgentGameByKey(gameOrName);
}

/** Games that store credentials directly on the game row (no streamlit provider flow on add/update). */
function isDirectStoreCredentialGame(name) {
  return isSimpleGame(name) || isAgentCredentialGame(name);
}

function isGoldenDragonAdminTokenGame(name, gameKey) {
  return isGoldenDragonGame(name, gameKey);
}

function resolveKioskIdForGoldenDragon(gameName, explicitKioskId, gameKey = null) {
  return resolveGoldenDragonKioskId(gameName, gameKey, explicitKioskId);
}

function isOrionStarsProviderGame(gameName) {
  const compact = String(gameName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return compact.includes('orionstar');
}

/** Provider admin APIs use X-Admin-Token (not X-Streamlit-Token). Golden Dragon must match any template spelling (e.g. GoldenDragon, golden_dragon, goldenDragonNewBot). */
function usesGameProviderAdminToken(gameName, gameKey) {
  if (isGoldenDragonAdminTokenGame(gameName, gameKey)) return true;
  if (isJuwaNewBotGame(gameName, gameKey)) return true;
  if (isPandamasterNewBotGame(gameName, gameKey)) return true;
  const t = String(gameName || '').trim();
  if (!t) return false;
  return /^(Juwa|Firekirin|GameVault|Milkyway|Pandamaster|Riversweeps|Juwa2.0)$/i.test(t);
}

function getProviderAuthHeaders(gameName, gameKey) {
  const primary = usesGameProviderAdminToken(gameName, gameKey) ? 'X-Admin-Token' : 'X-Streamlit-Token';
  const headers = [primary];
  if (isOrionStarsProviderGame(gameName) || isOrionStarsProviderGame(gameKey)) {
    const alternate = primary === 'X-Admin-Token' ? 'X-Streamlit-Token' : 'X-Admin-Token';
    headers.push(alternate);
  }
  return headers;
}

async function getStoreDrawerMoneybox(distributorCode, storeCode) {
  const dc = String(distributorCode || '').trim();
  const sc = String(storeCode || '').trim();
  if (!dc || !sc) return null;
  const u = await db.User.findOne({
    where: {
      role: ROLES.STORE_ADMIN,
      storeRoleId: null,
      distributorCode: dc,
      storeCode: sc
    },
    attributes: ['drawer']
  });
  if (!u || u.drawer == null) return null;
  const n = Number(u.drawer);
  if (Number.isNaN(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * @param {string} gameName
 * @param {unknown} explicitMoneybox - from request body when adding/updating a game
 * @param {{ addedByStoreCode?: string|null, distributorCode?: string|null, storeCode?: string|null }} scope
 */
async function resolveMoneyboxForGoldenDragon(gameName, explicitMoneybox, scope = {}) {
  if (!isGoldenDragonGame(gameName)) return null;
  if (explicitMoneybox != null && explicitMoneybox !== '') {
    const n = Number(explicitMoneybox);
    if (!Number.isNaN(n) && Number.isInteger(n) && n >= 1) return n;
  }
  const dist = String(scope.distributorCode || '').trim();
  const store = String(scope.storeCode || scope.addedByStoreCode || '').trim();
  return getStoreDrawerMoneybox(dist, store);
}

/**
 * Extract a readable error message from game provider API response.
 * Handles common shapes: message, detail (string or array, incl. FastAPI loc/msg), error.
 * @param {object} data - res.data from axios
 * @param {string} fallback - default message if nothing found
 * @returns {string}
 */
function getProviderErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  if (data.message && typeof data.message === 'string') return data.message;
  if (data.detail) {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      const parts = data.detail.map((d) => {
        const msg = d.msg || d.message || (typeof d === 'string' ? d : '');
        const loc = Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'body').join(' → ') : '';
        return loc ? `${loc}: ${msg}` : msg;
      }).filter(Boolean);
      return parts.length ? parts.join('; ') : fallback;
    }
  }
  if (data.error && typeof data.error === 'string') return data.error;
  if (data.errors && Array.isArray(data.errors)) return data.errors.map((e) => e.message || String(e)).join('; ') || fallback;
  return fallback;
}

/**
 * VegasX agent API: POST /cashier/login
 * Validates store username/password and returns session token.
 * @param {string} baseUrl - bot base URL from game template
 * @param {string} username - store cashier username
 * @param {string} password - store cashier password
 * @returns {Promise<{ success: boolean, token: string, user?: object }>}
 */
async function cashierLogin(baseUrl, username, password) {
  const url = `${String(baseUrl || '').trim().replace(/\/$/, '')}/cashier/login`;
  const res = await withProviderTimeoutRetry(() => axios.post(
    url,
    { username, password },
    {
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: PROVIDER_HTTP_TIMEOUT_MS,
      validateStatus: () => true
    }
  ));
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  console.log("username", username);
  console.log("password", password);
  console.log("cashierLogin data", data);
  if (data.success !== true || !data.token) {
    const msg = typeof data.message === 'string' && data.message.trim()
      ? data.message.trim()
      : getProviderErrorMessage(data, 'Cashier login failed');
    const err = new Error(msg);
    const isAuthFailure = data.success === false
      || /wrong username or password/i.test(msg)
      || res.status === 401;
    err.statusCode = isAuthFailure ? 401 : (res.status >= 400 ? res.status : 502);
    throw err;
  }
  const token = String(data.token).trim();
  if (!token) {
    throw new Error('Invalid response: token not returned');
  }
  return { success: true, token, user: data.user };
}

/**
 * Call game provider admin API: GET /admin/clients
 * Returns list of client usernames if success.
 * @param {string} baseUrl - e.g. "http://18.213.73.32:8006"
 * @param {string} token - X-Streamlit-Token or X-Admin-Token
 * @param {string} gameName - name of the game
 * @param {string} [gameKey] - integration key (e.g. goldenDragonNewBot)
 * @returns {Promise<{ success: boolean, clients: string[] }>}
 */
async function getAdminClients(baseUrl, token, gameName, gameKey) {
  const url = `${baseUrl.replace(/\/$/, '')}/admin/clients`;
  let res;
  for (const candidateHeader of getProviderAuthHeaders(gameName, gameKey)) {
    res = await withProviderTimeoutRetry(() => axios.get(url, {
      headers: {
        accept: 'application/json',
        [candidateHeader]: token
      },
      timeout: PROVIDER_HTTP_TIMEOUT_MS,
      validateStatus: () => true
    }));
    if (![401, 403].includes(res.status)) break;
  }
  if (res.status !== 200) {
    const msg = getProviderErrorMessage(res.data, 'Failed to fetch clients');
    const err = new Error(msg);
    err.statusCode = res.status === 422 ? 400 : (res.status >= 400 ? res.status : 502);
    throw err;
  }
  const data = res.data;
  console.log(data);
  const clients = (data && data.data && data.data.clients) || (data && data.clients) || [];
  if (!Array.isArray(clients)) {
    throw new Error('Invalid response from game provider: clients list not found');
  }
  return { success: true, clients };
}

/**
 * Call game provider admin API: POST /admin/add-client
 * Adds a provider client using username/password after credential verification.
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} username
 * @param {string} password
 * @param {string} gameName - used to choose auth header
 * @param {number|null} [moneybox] - Golden Dragon only: sent in JSON body
 * @param {string|null} [kioskId] - Golden Dragon only: sent as `kiosk_id` in JSON body
 * @param {{ storeCode?: string|null, gameKey?: string|null }} [notifyContext] - optional context for store partner alerts
 * @returns {Promise<{ success: boolean }>}
 */
async function addClient(baseUrl, token, username, password, gameName, moneybox = null, kioskId = null, notifyContext = null) {
  const url = `${baseUrl.replace(/\/$/, '')}/admin/add-client`;
  const gameKey = notifyContext && notifyContext.gameKey != null ? notifyContext.gameKey : '';
  const golden = isGoldenDragonGame(gameName, gameKey);
  let kioskIdArg = null;
  if (golden) {
    const mb = Number(moneybox);
    if (!Number.isInteger(mb) || mb < 1) {
      const err = new Error('Golden Dragon add-client requires a valid moneybox (positive integer).');
      err.statusCode = 400;
      throw err;
    }
    kioskIdArg = resolveKioskIdForGoldenDragon(gameName, kioskId, gameKey);
    if (!kioskIdArg) {
      const err = new Error(GOLDEN_DRAGON_KIOSK_ID_HELP);
      err.statusCode = 400;
      throw err;
    }
  }
  const body = golden
    ? { username, password, moneybox: Number(moneybox), kiosk_id: String(kioskIdArg) }
    : { username, password };
  let res;
  for (const headerName of getProviderAuthHeaders(gameName, gameKey)) {
    res = await withProviderTimeoutRetry(() => axios.post(
      url,
      body,
      {
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          [headerName]: token
        },
        timeout: PROVIDER_HTTP_TIMEOUT_MS,
        validateStatus: () => true
      }
    ));
    if (![401, 403].includes(res.status)) break;
  }
  if (golden) console.log('golden dragon add-client body', body);
  console.log("addClient res.data", res.data);
  // Some providers return 200 with body.status=201 while still reporting success=true.
  // Treat any explicit success payload as success instead of forcing HTTP 201 only.
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  const bodyStatus = typeof data.status === 'number' ? data.status : null;
  const payloadIndicatesSuccess = data.success === true && (
    (bodyStatus != null && bodyStatus >= 200 && bodyStatus < 300) ||
    (res.status >= 200 && res.status < 300)
  );
  const hasExplicitSuccessFlag = Object.prototype.hasOwnProperty.call(data, 'success');
  const httpIndicatesSuccess = (res.status >= 200 && res.status < 300) && (!hasExplicitSuccessFlag || data.success === true);

  if (!(payloadIndicatesSuccess || httpIndicatesSuccess)) {
    let httpStatus = bodyStatus;
    if (httpStatus == null || httpStatus < 400 || httpStatus >= 600) {
      httpStatus = res.status;
    }
    if (httpStatus < 400 || httpStatus >= 600) {
      httpStatus = 502;
    }
    const err = new Error(getProviderErrorMessage(data, 'Add client failed'));
    err.statusCode = httpStatus;
    err.providerPassthrough = true;
    err.providerBody = data;
    const { maybeNotifyGoldenDragonDrawerError } = require('./goldenDragonDrawerAlert.service');
    maybeNotifyGoldenDragonDrawerError(err, {
      gameName,
      gameId: notifyContext?.gameId || null,
      storeCode: notifyContext?.storeCode || null,
      operation: 'add-client'
    }).catch(() => {});
    throw err;
  }
  return { success: true };
}

/**
 * Call game provider admin API: POST /admin/generate-key
 * Returns api_key on success.
 * VegasX expects body { username }; other games expect { client_username }.
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} username
 * @param {string} gameName - used to choose body format (e.g. VegasX → username)
 * @param {string} [gameKey] - integration key (e.g. goldenDragonNewBot)
 * @returns {Promise<{ success: boolean, api_key: string }>}
 */
async function generateKey(baseUrl, token, username, gameName, gameKey, kioskId = null) {
  const url = `${baseUrl.replace(/\/$/, '')}/admin/generate-key`;
  const isVegasX = /^vegasx$/i.test(String(gameName || '').trim());
  let body = isVegasX ? { username } : { client_username: username };
  if (isGoldenDragonGame(gameName, gameKey)) {
    const kiosk_id = resolveKioskIdForGoldenDragon(gameName, kioskId, gameKey);
    body = buildGoldenDragonGenerateKeyBody(username, kiosk_id);
  }
  let res;
  for (const headerName of getProviderAuthHeaders(gameName, gameKey)) {
    res = await withProviderTimeoutRetry(() => axios.post(
      url,
      body,
      {
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          [headerName]: token
        },
        timeout: PROVIDER_HTTP_TIMEOUT_MS,
        validateStatus: () => true
      }
    ));
    if (![401, 403].includes(res.status)) break;
  }
  console.log(res.data);
  if (res.status !== 200) {
    const msg = getProviderErrorMessage(res.data, 'Failed to generate API key');
    const err = new Error(msg);
    err.statusCode = res.status === 422 ? 400 : (res.status >= 400 ? res.status : 502);
    throw err;
  }
  const data = res.data;
  const apiKey = (data && data.data && data.data.api_key) || (data && data.api_key);
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Invalid response: API key not returned');
  }
  return { success: true, api_key: apiKey };
}

/**
 * Refresh the game's bot API key by calling the provider's generate-key API and updating the DB.
 * Use when the bot returns 403 Invalid or inactive API key; then retry the bot API with the new key.
 * @param {number} gameId - Game primary key
 * @returns {Promise<{ api_key: string }>}
 */
async function refreshGameBotApiKey(gameId) {
  const game = await db.Game.findByPk(gameId, {
    attributes: ['id', 'botApiUrl', 'streamlitToken', 'botUsername', 'name', 'gameKey', 'kioskId']
  });
  if (!game) {
    const err = new Error('Game not found');
    err.statusCode = 404;
    throw err;
  }
  const baseUrl = game.botApiUrl && String(game.botApiUrl).trim();
  const token = game.streamlitToken && String(game.streamlitToken).trim();
  const username = game.botUsername && String(game.botUsername).trim();
  const gameName = game.name && String(game.name).trim();
  const gameKey = game.gameKey && String(game.gameKey).trim();
  if (!baseUrl || !token || !username || !gameName) {
    const err = new Error('Game is not configured for API key refresh (missing bot URL, streamlit token, or bot username)');
    err.statusCode = 400;
    throw err;
  }
  const kioskId = game.kioskId != null ? String(game.kioskId).trim() : '';
  const keyResult = await generateKey(baseUrl, token, username, gameName, gameKey, kioskId || null);
  if (!keyResult.success || !keyResult.api_key) {
    const err = new Error('Failed to generate new API key');
    err.statusCode = 502;
    throw err;
  }
  const api_key = keyResult.api_key.slice(0, 512);
  await db.Game.update({ botApiKey: api_key }, { where: { id: gameId } });
  return { api_key };
}

/**
 * Get next display order for games.
 */
async function getNextDisplayOrder() {
  const result = await db.Game.max('displayOrder');
  const max = result != null ? Number(result) : 0;
  return max + 1;
}

/**
 * Add a new game.
 * For Vblink/UltraPanda/Egame99 (simple games): no streamlit token, no third-party API calls; store appId/appSecret on game.
 * For other games: call get admin clients; if username is missing then auto add-client; then generate-key and save.
 *
 * @param {object} payload
 * @param {string} payload.gameName
 * @param {string} payload.gameUsername
 * @param {string} payload.gamePassword
 * @param {string} payload.gameLink
 * @param {number} [payload.minWithdrawalLimit=0]
 * @param {number} [payload.maxWithdrawalLimit=500]
 * @param {string} [payload.streamlitToken]
 * @param {string} [payload.botBaseUrl]
 * @param {string} [payload.appId] - required for Vblink/UltraPanda/Egame99
 * @param {string} [payload.appSecret] - required for Vblink/UltraPanda/Egame99
 * @param {string} [payload.gameKey] - integration key from template (e.g. juwa20_agent, gamevault_agent)
 * @param {number} [payload.gameTemplateId] - source template id
 * @param {string} [payload.agentId] - required for agent API games
 * @param {string} [payload.apiSecretKey] - required for agent API games
 * @param {string} [payload.addedByStoreCode]
 * @param {string} [payload.distributorCode] - used with storeCode to resolve Golden Dragon drawer from DB
 * @param {string} [payload.storeCode] - same as addedByStoreCode when caller has both; prefer for staff users
 * @param {number} [payload.addedByUserId] - users.user_id of the admin who added the game (store flows)
 * @param {number|string} [payload.moneybox] - Golden Dragon: overrides store drawer when set
 * @param {string|number} [payload.kioskId] - Golden Dragon: sent as `kiosk_id` on add-client
 * @returns {Promise<object>} Created game
 */
async function addGame(payload) {
  const gameName = payload.gameName != null ? String(payload.gameName).trim() : '';
  const gameUsername = payload.gameUsername != null ? String(payload.gameUsername).trim() : '';
  const gamePassword = payload.gamePassword != null ? String(payload.gamePassword) : '';
  const gameLink = payload.gameLink != null ? String(payload.gameLink).trim() : '';
  const streamlitToken = payload.streamlitToken != null ? String(payload.streamlitToken).trim() : '';
  const botBaseUrl = (payload.botBaseUrl != null ? String(payload.botBaseUrl).trim() : '') || null;
  const appId = payload.appId != null ? String(payload.appId).trim() : '';
  const appSecret = payload.appSecret != null ? String(payload.appSecret) : '';
  const gameKey = payload.gameKey != null ? String(payload.gameKey).trim() : '';
  const gameTemplateId = payload.gameTemplateId != null ? Number(payload.gameTemplateId) : null;
  const agentId = payload.agentId != null ? String(payload.agentId).trim() : '';
  const apiSecretKey = payload.apiSecretKey != null ? String(payload.apiSecretKey).trim() : '';
  let minWithdrawalLimit = payload.minWithdrawalLimit;
  let maxWithdrawalLimit = payload.maxWithdrawalLimit;
  let minDepositLimit = payload.minDepositLimit;
  let maxDepositLimit = payload.maxDepositLimit;

  if (!gameName) throw Object.assign(new Error('Game name is required'), { statusCode: 400 });
  if (!gameUsername) throw Object.assign(new Error('Game username is required'), { statusCode: 400 });
  if (!gamePassword || typeof gamePassword !== 'string') throw Object.assign(new Error('Game password is required'), { statusCode: 400 });
  if (!gameLink) throw Object.assign(new Error('Game link is required'), { statusCode: 400 });

  minWithdrawalLimit = minWithdrawalLimit != null ? Number(minWithdrawalLimit) : 0;
  if (Number.isNaN(minWithdrawalLimit) || minWithdrawalLimit < 0) minWithdrawalLimit = 0;
  maxWithdrawalLimit = maxWithdrawalLimit != null ? Number(maxWithdrawalLimit) : 500;
  if (Number.isNaN(maxWithdrawalLimit) || maxWithdrawalLimit < 0) maxWithdrawalLimit = 500;
  if (minWithdrawalLimit > maxWithdrawalLimit) {
    throw Object.assign(new Error('Min withdrawal limit cannot be greater than max withdrawal limit'), { statusCode: 400 });
  }
  minDepositLimit = minDepositLimit != null ? Number(minDepositLimit) : 0;
  if (Number.isNaN(minDepositLimit) || minDepositLimit < 0) minDepositLimit = 0;
  maxDepositLimit = maxDepositLimit != null ? Number(maxDepositLimit) : 0;
  if (Number.isNaN(maxDepositLimit) || maxDepositLimit < 0) maxDepositLimit = 0;
  if (maxDepositLimit > 0 && minDepositLimit > maxDepositLimit) {
    throw Object.assign(new Error('Min deposit limit cannot be greater than max deposit limit'), { statusCode: 400 });
  }
  let depositDiscountPercent = payload.depositDiscountPercent != null ? Number(payload.depositDiscountPercent) : 0;
  if (!Number.isFinite(depositDiscountPercent) || depositDiscountPercent < 0) depositDiscountPercent = 0;
  if (depositDiscountPercent > 100) {
    throw Object.assign(new Error('Deposit discount must be between 0 and 100 percent'), { statusCode: 400 });
  }
  depositDiscountPercent = Math.round(depositDiscountPercent * 100) / 100;

  const simpleGame = isSimpleGame(gameName);
  const integrationRef = { name: gameName, gameKey: gameKey || null };
  const agentCredGame = isAgentCredentialGame(integrationRef);
  const vegasxCashierGame = isVegasXCashierGame(integrationRef);
  const orionStarsTerminalGame = isOrionStarsTerminalGame(integrationRef);
  const firekirinTerminalGame = isFirekirinTerminalGame(integrationRef);
  const milkywayTerminalGame = isMilkywayTerminalGame(integrationRef);
  const gameroomAgentGame = isGameroomAgentGame(integrationRef);
  const cashmachineAgentGame = isCashmachineAgentGame(integrationRef);
  const mafiaAgentGame = isMafiaAgentGame(integrationRef);
  const resolvedGameKey = gameKey
    || (agentCredGame || firekirinTerminalGame || milkywayTerminalGame || orionStarsTerminalGame || gameroomAgentGame || cashmachineAgentGame || mafiaAgentGame
      ? resolveGameIntegrationKey(integrationRef)
      : null);

  if (simpleGame) {
    // Vblink / UltraPanda / Egame99: no third-party API; require appId, appSecret; botBaseUrl from template (game URL base).
    if (!appId) throw Object.assign(new Error('appId is required for this game'), { statusCode: 400 });
    if (!appSecret) throw Object.assign(new Error('appSecret is required for this game'), { statusCode: 400 });
    const displayOrder = await getNextDisplayOrder();
    const game = await db.Game.create({
      name: gameName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl ? botBaseUrl.slice(0, 512) : null,
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: null,
      appId: appId.slice(0, 256),
      appSecret: appSecret.slice(0, 512),
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (agentCredGame) {
    // Agent API games: store-level agentId + apiSecretKey; no streamlit token or provider admin calls.
    if (!agentId) throw Object.assign(new Error('agentId is required for this game'), { statusCode: 400 });
    if (!apiSecretKey) throw Object.assign(new Error('apiSecretKey is required for this game'), { statusCode: 400 });
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const { validateGameVaultAgentCredentials } = require('./gamevault.helpers');
    await validateGameVaultAgentCredentials(botBaseUrl, agentId, apiSecretKey);
    const displayOrder = await getNextDisplayOrder();
    const storeDisplayName = getStoreGameDisplayName(gameName);
    const game = await db.Game.create({
      name: storeDisplayName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: null,
      agentId: agentId.slice(0, 256),
      apiSecretKey: apiSecretKey.slice(0, 512),
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (vegasxCashierGame) {
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const loginResult = await cashierLogin(botBaseUrl, gameUsername, gamePassword);
    const displayOrder = await getNextDisplayOrder();
    const game = await db.Game.create({
      name: gameName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: loginResult.token.slice(0, 512),
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (orionStarsTerminalGame) {
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const {
      callOrionStarsAgentLogin,
      setupOrionStarsLegacyBotCredentials,
      getOrionStarsLegacyBotBaseUrl
    } = require('./orionstars.helpers');
    const loginResult = await callOrionStarsAgentLogin(botBaseUrl, gameUsername, gamePassword);
    let botApiKey = null;
    let streamlitTokenStored = null;
    const legacyBotUrl = getOrionStarsLegacyBotBaseUrl();
    if (legacyBotUrl && streamlitToken) {
      const legacy = await setupOrionStarsLegacyBotCredentials({
        legacyBotBaseUrl: legacyBotUrl,
        streamlitToken,
        gameUsername,
        gamePassword,
        gameName
      });
      if (legacy) {
        botApiKey = legacy.botApiKey;
        streamlitTokenStored = legacy.streamlitToken;
      }
    }
    const displayOrder = await getNextDisplayOrder();
    const game = await db.Game.create({
      name: gameName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey,
      streamlitToken: streamlitTokenStored,
      agentId: loginResult.agentKey.slice(0, 256),
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (firekirinTerminalGame) {
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const { callFirekirinAgentLogin } = require('./firekirin.helpers');
    const loginResult = await callFirekirinAgentLogin(botBaseUrl, gameUsername, gamePassword);
    const displayOrder = await getNextDisplayOrder();
    const storeDisplayName = getStoreGameDisplayName(gameName);
    const game = await db.Game.create({
      name: storeDisplayName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: null,
      agentId: loginResult.agentKey.slice(0, 256),
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (milkywayTerminalGame) {
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const { callMilkywayAgentLogin } = require('./milkyway.helpers');
    const loginResult = await callMilkywayAgentLogin(botBaseUrl, gameUsername, gamePassword);
    const displayOrder = await getNextDisplayOrder();
    const storeDisplayName = getStoreGameDisplayName(gameName);
    const game = await db.Game.create({
      name: storeDisplayName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: null,
      agentId: loginResult.agentKey.slice(0, 256),
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (gameroomAgentGame) {
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const { callGameroomAgentLogin } = require('./gameroom.helpers');
    const loginResult = await callGameroomAgentLogin(botBaseUrl, gameUsername, gamePassword);
    const displayOrder = await getNextDisplayOrder();
    const storeDisplayName = getStoreGameDisplayName(gameName);
    const game = await db.Game.create({
      name: storeDisplayName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: loginResult.token.slice(0, 512),
      agentId: null,
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (cashmachineAgentGame) {
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const { callCashmachineAgentLogin } = require('./cashmachine.helpers');
    const loginResult = await callCashmachineAgentLogin(botBaseUrl, gameUsername, gamePassword);
    const displayOrder = await getNextDisplayOrder();
    const storeDisplayName = getStoreGameDisplayName(gameName);
    const game = await db.Game.create({
      name: storeDisplayName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: loginResult.token.slice(0, 512),
      agentId: null,
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  if (mafiaAgentGame) {
    if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });
    const { callMafiaAgentLogin } = require('./mafia.helpers');
    const loginResult = await callMafiaAgentLogin(botBaseUrl, gameUsername, gamePassword);
    const displayOrder = await getNextDisplayOrder();
    const storeDisplayName = getStoreGameDisplayName(gameName);
    const game = await db.Game.create({
      name: storeDisplayName.slice(0, 128),
      imageUrl: null,
      botType: GAME_PROVIDER_BOT_TYPE,
      botApiUrl: botBaseUrl.slice(0, 512),
      botUsername: gameUsername.slice(0, 256),
      botPassword: gamePassword.slice(0, 256),
      botApiKey: null,
      streamlitToken: loginResult.token.slice(0, 512),
      agentId: null,
      gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
      gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
      minWithdrawalLimit,
      maxWithdrawalLimit,
      minDepositLimit,
      maxDepositLimit,
      depositDiscountPercent,
      platformGameUrl: gameLink.slice(0, 512),
      addedByStoreCode: payload.addedByStoreCode || null,
      addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
      isActive: true,
      displayOrder
    });
    return game;
  }

  // Standard flow: require streamlit token and bot base URL, call provider APIs
  if (!streamlitToken) throw Object.assign(new Error('streamlit-token is required'), { statusCode: 400 });
  if (!botBaseUrl) throw Object.assign(new Error('bot-base-url is required'), { statusCode: 400 });

  const clientsResult = await getAdminClients(botBaseUrl, streamlitToken, gameName, resolvedGameKey);
  if (!clientsResult.success) {
    throw Object.assign(new Error('Admin clients check failed'), { statusCode: 502 });
  }
  let goldenKioskId = null;
  if (isGoldenDragonGame(gameName, resolvedGameKey)) {
    goldenKioskId = resolveKioskIdForGoldenDragon(gameName, payload.kioskId ?? payload.kiosk_id, resolvedGameKey);
    if (!goldenKioskId) {
      throw Object.assign(new Error(GOLDEN_DRAGON_KIOSK_ID_HELP), { statusCode: 400 });
    }
  }

  const usernameExists = (clientsResult.clients || []).some((c) => String(c).trim() === gameUsername);
  if (!usernameExists) {
    let moneyboxArg = null;
    if (isGoldenDragonGame(gameName, resolvedGameKey)) {
      moneyboxArg = await resolveMoneyboxForGoldenDragon(gameName, payload.moneybox, {
        addedByStoreCode: payload.addedByStoreCode,
        distributorCode: payload.distributorCode,
        storeCode: payload.storeCode
      });
      if (!moneyboxArg) {
        throw Object.assign(
          new Error('Golden Dragon requires a moneybox (drawer). Set it on your store (Profile or store admin settings), or pass moneybox when adding the game.'),
          { statusCode: 400 }
        );
      }
      await addClient(
        botBaseUrl,
        streamlitToken,
        gameUsername,
        gamePassword,
        gameName,
        moneyboxArg,
        goldenKioskId,
        { storeCode: payload.addedByStoreCode || payload.storeCode || null, gameKey: resolvedGameKey }
      );
    } else {
      await addClient(
        botBaseUrl,
        streamlitToken,
        gameUsername,
        gamePassword,
        gameName,
        null,
        null,
        { gameKey: resolvedGameKey }
      );
    }
  }

  const keyResult = await generateKey(
    botBaseUrl,
    streamlitToken,
    gameUsername,
    gameName,
    resolvedGameKey,
    goldenKioskId
  );
  if (!keyResult.success || !keyResult.api_key) {
    throw Object.assign(new Error('Generate key failed or no API key returned'), { statusCode: 502 });
  }

  const displayOrder = await getNextDisplayOrder();
  let inheritedImageUrl = null;
  if (isJuwaNewBotGame(gameName, resolvedGameKey)) {
    inheritedImageUrl = await findLegacyJuwaImageUrlForStore(payload.addedByStoreCode || payload.storeCode || null);
  }
  if (isPandamasterNewBotGame(gameName, resolvedGameKey)) {
    inheritedImageUrl = inheritedImageUrl
      || await findLegacyPandamasterImageUrlForStore(payload.addedByStoreCode || payload.storeCode || null);
  }
  const game = await db.Game.create({
    name: gameName.slice(0, 128),
    imageUrl: inheritedImageUrl ? String(inheritedImageUrl).slice(0, 512) : null,
    botType: GAME_PROVIDER_BOT_TYPE,
    botApiUrl: botBaseUrl.slice(0, 512),
    botUsername: gameUsername.slice(0, 256),
    botPassword: gamePassword.slice(0, 256),
    botApiKey: keyResult.api_key.slice(0, 512),
    streamlitToken: streamlitToken.slice(0, 512),
    minWithdrawalLimit,
    maxWithdrawalLimit,
    minDepositLimit,
    maxDepositLimit,
    depositDiscountPercent,
    platformGameUrl: gameLink.slice(0, 512),
    addedByStoreCode: payload.addedByStoreCode || null,
    addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
    kioskId: goldenKioskId,
    gameKey: resolvedGameKey ? resolvedGameKey.slice(0, 64) : null,
    gameTemplateId: Number.isInteger(gameTemplateId) ? gameTemplateId : null,
    isActive: true,
    displayOrder
  });
  return game;
}

/**
 * After admin updates game store username/password: ensure username exists in provider clients, generate API key, return DB fields to set.
 * @param {object} game - Sequelize model or plain row with botApiUrl, streamlitToken, name
 * @param {{ gameUsername: string, gamePassword: string }} creds
 * @param {{ moneybox?: number|string, kioskId?: string|number, kiosk_id?: string|number, distributorCode?: string|null, storeCode?: string|null }} [ctx]
 * @returns {Promise<{ botUsername: string, botPassword: string, botApiKey: string }>}
 */
async function updateGameProviderCredentials(game, { gameUsername, gamePassword }, ctx = {}) {
  const botBaseUrl = String(game.botApiUrl || '').trim();
  const streamlitToken = String(game.streamlitToken || '').trim();
  const gameName = String(game.name || '').trim();
  const gameKey = game.gameKey != null ? String(game.gameKey).trim() : '';
  const newUser = String(gameUsername || '').trim();
  const newPass = gamePassword != null ? String(gamePassword) : '';

  if (!newUser) {
    const err = new Error('Game username is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!newPass) {
    const err = new Error('Game password is required.');
    err.statusCode = 400;
    throw err;
  }

  if (isVegasXCashierGame({ name: gameName, gameKey })) {
    const { resolveVegasXBotBaseUrl } = require('./vegasx.helpers');
    const resolvedBaseUrl = await resolveVegasXBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    const loginResult = await cashierLogin(resolvedBaseUrl, newUser, newPass);
    return {
      botUsername: newUser.slice(0, 256),
      botPassword: newPass.slice(0, 256),
      streamlitToken: loginResult.token.slice(0, 512),
      botApiUrl: resolvedBaseUrl.slice(0, 512)
    };
  }

  if (isOrionStarsTerminalGame({ name: gameName, gameKey })) {
    const { resolveOrionStarsBotBaseUrl, callOrionStarsAgentLogin } = require('./orionstars.helpers');
    const resolvedBaseUrl = await resolveOrionStarsBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    const loginResult = await callOrionStarsAgentLogin(resolvedBaseUrl, newUser, newPass);
    return {
      botUsername: newUser.slice(0, 256),
      botPassword: newPass.slice(0, 256),
      agentId: loginResult.agentKey.slice(0, 256),
      botApiUrl: resolvedBaseUrl.slice(0, 512)
    };
  }

  if (isFirekirinTerminalGame({ name: gameName, gameKey })) {
    const { resolveFirekirinBotBaseUrl, callFirekirinAgentLogin } = require('./firekirin.helpers');
    const resolvedBaseUrl = await resolveFirekirinBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    const loginResult = await callFirekirinAgentLogin(resolvedBaseUrl, newUser, newPass);
    return {
      botUsername: newUser.slice(0, 256),
      botPassword: newPass.slice(0, 256),
      agentId: loginResult.agentKey.slice(0, 256),
      botApiUrl: resolvedBaseUrl.slice(0, 512)
    };
  }

  if (isMilkywayTerminalGame({ name: gameName, gameKey })) {
    const { resolveMilkywayBotBaseUrl, callMilkywayAgentLogin } = require('./milkyway.helpers');
    const resolvedBaseUrl = await resolveMilkywayBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    const loginResult = await callMilkywayAgentLogin(resolvedBaseUrl, newUser, newPass);
    return {
      botUsername: newUser.slice(0, 256),
      botPassword: newPass.slice(0, 256),
      agentId: loginResult.agentKey.slice(0, 256),
      botApiUrl: resolvedBaseUrl.slice(0, 512)
    };
  }

  if (isGameroomAgentGame({ name: gameName, gameKey })) {
    const { resolveGameroomBotBaseUrl, callGameroomAgentLogin } = require('./gameroom.helpers');
    const resolvedBaseUrl = await resolveGameroomBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    const loginResult = await callGameroomAgentLogin(resolvedBaseUrl, newUser, newPass);
    return {
      botUsername: newUser.slice(0, 256),
      botPassword: newPass.slice(0, 256),
      streamlitToken: loginResult.token.slice(0, 512),
      botApiUrl: resolvedBaseUrl.slice(0, 512)
    };
  }

  if (isCashmachineAgentGame({ name: gameName, gameKey })) {
    const { resolveCashmachineBotBaseUrl, callCashmachineAgentLogin } = require('./cashmachine.helpers');
    const resolvedBaseUrl = await resolveCashmachineBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    const loginResult = await callCashmachineAgentLogin(resolvedBaseUrl, newUser, newPass);
    return {
      botUsername: newUser.slice(0, 256),
      botPassword: newPass.slice(0, 256),
      streamlitToken: loginResult.token.slice(0, 512),
      botApiUrl: resolvedBaseUrl.slice(0, 512)
    };
  }

  if (isMafiaAgentGame({ name: gameName, gameKey })) {
    const { resolveMafiaBotBaseUrl, callMafiaAgentLogin } = require('./mafia.helpers');
    const resolvedBaseUrl = await resolveMafiaBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    const loginResult = await callMafiaAgentLogin(resolvedBaseUrl, newUser, newPass);
    return {
      botUsername: newUser.slice(0, 256),
      botPassword: newPass.slice(0, 256),
      streamlitToken: loginResult.token.slice(0, 512),
      botApiUrl: resolvedBaseUrl.slice(0, 512)
    };
  }

  if (!botBaseUrl || !streamlitToken || !gameName) {
    const err = new Error('Game is missing provider configuration (API URL or token).');
    err.statusCode = 400;
    throw err;
  }

  const clientsResult = await getAdminClients(botBaseUrl, streamlitToken, gameName, gameKey);
  if (!clientsResult.success) {
    const err = new Error('Could not load game provider clients.');
    err.statusCode = 502;
    throw err;
  }
  const exists = (clientsResult.clients || []).some((c) => String(c).trim() === newUser);
  let kioskIdArg = null;
  if (!exists) {
    let moneyboxArg = null;
    if (isGoldenDragonGame(gameName, gameKey)) {
      moneyboxArg = await resolveMoneyboxForGoldenDragon(gameName, ctx.moneybox, {
        addedByStoreCode: game.addedByStoreCode,
        distributorCode: ctx.distributorCode,
        storeCode: ctx.storeCode
      });
      if (!moneyboxArg) {
        const err = new Error('Golden Dragon requires a moneybox (drawer). Set it on your store profile / store settings, then try again.');
        err.statusCode = 400;
        throw err;
      }
      kioskIdArg = resolveKioskIdForGoldenDragon(
        gameName,
        ctx.kioskId ?? ctx.kiosk_id ?? game.kioskId,
        gameKey
      );
      if (!kioskIdArg) {
        const err = new Error(GOLDEN_DRAGON_KIOSK_ID_HELP);
        err.statusCode = 400;
        throw err;
      }
    }
    await addClient(
      botBaseUrl,
      streamlitToken,
      newUser,
      newPass,
      gameName,
      moneyboxArg,
      kioskIdArg,
      { storeCode: game.addedByStoreCode || ctx.storeCode || null, gameId: game.id, gameKey }
    );
  }

  const keyKioskId = kioskIdArg || (game.kioskId != null ? String(game.kioskId).trim() : '') || null;
  const keyResult = await generateKey(botBaseUrl, streamlitToken, newUser, gameName, gameKey, keyKioskId);
  if (!keyResult.success || !keyResult.api_key) {
    const err = new Error('Game provider did not return an API key.');
    err.statusCode = 502;
    throw err;
  }

  return {
    botUsername: newUser.slice(0, 256),
    botPassword: newPass.slice(0, 256),
    botApiKey: keyResult.api_key.slice(0, 512)
  };
}

/**
 * Add a custom manual-only game (no agent/bot APIs).
 * Register / deposit / redeem always queue as GameManualRequests (botOffline = true).
 *
 * @param {object} payload
 * @param {string} payload.gameName
 * @param {string} payload.gameLink
 * @param {string} payload.imageUrl - S3 public URL from admin upload
 * @param {number} [payload.minWithdrawalLimit=0]
 * @param {number} [payload.maxWithdrawalLimit=500]
 * @param {string} [payload.addedByStoreCode]
 * @param {number} [payload.addedByUserId]
 * @returns {Promise<object>} Created game
 */
async function addCustomManualGame(payload) {
  const gameName = payload.gameName != null ? String(payload.gameName).trim() : '';
  const gameLink = payload.gameLink != null ? String(payload.gameLink).trim() : '';
  const imageUrl = payload.imageUrl != null ? String(payload.imageUrl).trim() : '';
  let minWithdrawalLimit = payload.minWithdrawalLimit;
  let maxWithdrawalLimit = payload.maxWithdrawalLimit;
  let minDepositLimit = payload.minDepositLimit;
  let maxDepositLimit = payload.maxDepositLimit;

  if (!gameName) throw Object.assign(new Error('Game name is required'), { statusCode: 400 });
  if (!gameLink) throw Object.assign(new Error('Game link is required'), { statusCode: 400 });
  if (!imageUrl) throw Object.assign(new Error('Game image is required'), { statusCode: 400 });
  if (imageUrl.length > 512) {
    throw Object.assign(new Error('Game image URL is too long'), { statusCode: 400 });
  }

  minWithdrawalLimit = minWithdrawalLimit != null ? Number(minWithdrawalLimit) : 0;
  if (Number.isNaN(minWithdrawalLimit) || minWithdrawalLimit < 0) minWithdrawalLimit = 0;
  maxWithdrawalLimit = maxWithdrawalLimit != null ? Number(maxWithdrawalLimit) : 500;
  if (Number.isNaN(maxWithdrawalLimit) || maxWithdrawalLimit < 0) maxWithdrawalLimit = 500;
  if (minWithdrawalLimit > maxWithdrawalLimit) {
    throw Object.assign(new Error('Min withdrawal limit cannot be greater than max withdrawal limit'), { statusCode: 400 });
  }
  minDepositLimit = minDepositLimit != null ? Number(minDepositLimit) : 0;
  if (Number.isNaN(minDepositLimit) || minDepositLimit < 0) minDepositLimit = 0;
  maxDepositLimit = maxDepositLimit != null ? Number(maxDepositLimit) : 0;
  if (Number.isNaN(maxDepositLimit) || maxDepositLimit < 0) maxDepositLimit = 0;
  if (maxDepositLimit > 0 && minDepositLimit > maxDepositLimit) {
    throw Object.assign(new Error('Min deposit limit cannot be greater than max deposit limit'), { statusCode: 400 });
  }
  let depositDiscountPercent = payload.depositDiscountPercent != null ? Number(payload.depositDiscountPercent) : 0;
  if (!Number.isFinite(depositDiscountPercent) || depositDiscountPercent < 0) depositDiscountPercent = 0;
  if (depositDiscountPercent > 100) {
    throw Object.assign(new Error('Deposit discount must be between 0 and 100 percent'), { statusCode: 400 });
  }
  depositDiscountPercent = Math.round(depositDiscountPercent * 100) / 100;

  const displayOrder = await getNextDisplayOrder();
  return db.Game.create({
    name: gameName.slice(0, 128),
    imageUrl: imageUrl.slice(0, 512),
    botType: GAME_PROVIDER_BOT_TYPE,
    botApiUrl: null,
    botUsername: null,
    botPassword: null,
    botApiKey: null,
    streamlitToken: null,
    appId: null,
    appSecret: null,
    agentId: null,
    apiSecretKey: null,
    gameKey: CUSTOM_MANUAL_GAME_KEY,
    gameTemplateId: null,
    minWithdrawalLimit,
    maxWithdrawalLimit,
    minDepositLimit,
    maxDepositLimit,
    depositDiscountPercent,
    platformGameUrl: gameLink.slice(0, 512),
    addedByStoreCode: payload.addedByStoreCode || null,
    addedByUserId: payload.addedByUserId != null ? payload.addedByUserId : null,
    botOffline: true,
    manualRedeemOnly: false,
    isActive: true,
    displayOrder
  });
}

module.exports = {
  addGame,
  addCustomManualGame,
  cashierLogin,
  getAdminClients,
  addClient,
  generateKey,
  refreshGameBotApiKey,
  updateGameProviderCredentials,
  isSimpleGame,
  isAgentCredentialGame,
  isVegasXCashierGame,
  isOrionStarsTerminalGame,
  isFirekirinTerminalGame,
  isMilkywayTerminalGame,
  isGameroomAgentGame,
  isCashmachineAgentGame,
  isMafiaAgentGame,
  isDirectStoreCredentialGame,
  isGoldenDragonGame,
  usesGameProviderAdminToken,
  resolveKioskIdForGoldenDragon,
  GOLDEN_DRAGON_KIOSK_ID_HELP,
  SIMPLE_GAME_NAMES
};
