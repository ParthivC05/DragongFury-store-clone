'use strict';

const axios = require('axios');
const db = require('../../db/models');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { captureBotApiResponse } = require('../../utils/botApiHelper');
const { cashierLogin } = require('./addGame.service');
const { isVegasXCashierGame, resolveGameIntegrationKey, compactGameKey } = require('../../utils/gameIntegration.helpers');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const VEGASX_PASSWORD_MIN = 6;
const VEGASX_NAME_MAX = 100;
const VEGASX_USERNAME_REGEX = /^[A-Za-z0-9_.-]+$/;
const VEGASX_SC_TO_AGENT_MULTIPLIER = 100;

function normalizeVegasXApiBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/$/, '');
}

/**
 * VegasX API base URL: prefer game_templates.bot_base_url (master config),
 * then games.bot_api_url (store copy). Syncs games.bot_api_url when template is newer.
 */
async function resolveVegasXBotBaseUrl(game) {
  let fromTemplate = '';

  if (game?.gameTemplateId) {
    const linkedTemplate = await db.GameTemplate.findByPk(game.gameTemplateId, {
      attributes: ['botBaseUrl', 'gameKey']
    });
    fromTemplate = normalizeVegasXApiBaseUrl(linkedTemplate?.botBaseUrl);
  }

  if (!fromTemplate) {
    const gameKey = resolveGameIntegrationKey(game);
    const templates = await db.GameTemplate.findAll({
      where: { isActive: true },
      attributes: ['name', 'gameKey', 'botBaseUrl'],
      order: [['updated_at', 'DESC']]
    });
    const template = templates.find(
      (t) => isVegasXCashierGame(t) && resolveGameIntegrationKey(t) === gameKey
    );
    fromTemplate = normalizeVegasXApiBaseUrl(template?.botBaseUrl);
  }

  const fromGame = normalizeVegasXApiBaseUrl(game?.botApiUrl);
  const resolved = fromTemplate || fromGame;

  if (fromTemplate && game?.id && fromTemplate !== fromGame) {
    await db.Game.update(
      { botApiUrl: fromTemplate.slice(0, 512) },
      { where: { id: game.id } }
    );
    game.botApiUrl = fromTemplate;
  }

  return resolved;
}

function isVegasXGame(gameOrName) {
  if (isVegasXCashierGame(gameOrName)) return true;
  // Fallback: some store rows may have a nonstandard gameKey; still treat by display name.
  if (gameOrName && typeof gameOrName === 'object') {
    const byName = compactGameKey(gameOrName.name);
    return byName === 'vegasx' || byName.startsWith('vegasx');
  }
  const key = compactGameKey(gameOrName);
  return key === 'vegasx' || key.startsWith('vegasx');
}

/** Convert platform SC (whole number) to VegasX agent API amount (1 SC = 100). */
function toVegasXAgentAmount(scAmount) {
  const n = Number(scAmount);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    const err = new Error('VegasX requires at least 1 SC as a full amount.');
    err.statusCode = 400;
    err.internalValidation = true;
    throw err;
  }
  return n * VEGASX_SC_TO_AGENT_MULTIPLIER;
}

function sanitizeVegasXUsername(username) {
  let result = String(username || '').trim().replace(/[^A-Za-z0-9_.-]/g, '');
  if (!result) result = 'player';
  return result.slice(0, 64);
}

function isValidVegasXUsername(username) {
  const value = String(username || '').trim();
  return value.length > 0 && VEGASX_USERNAME_REGEX.test(value);
}

function createAlternateVegasXUsername(baseUsername) {
  const safe = sanitizeVegasXUsername(baseUsername) || 'player';
  const prefix = safe.slice(0, Math.max(1, safe.length - 4));
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 4);
  return sanitizeVegasXUsername(`${prefix}${suffix}`);
}

/**
 * Generate a password for VegasX cashier/create: minimum 6 characters.
 */
function generateVegasXPassword() {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const len = VEGASX_PASSWORD_MIN + Math.floor(Math.random() * 7);
  let pass = '';
  pass += letters[Math.floor(Math.random() * letters.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  for (let i = pass.length; i < len; i++) {
    const set = i % 2 === 0 ? letters : numbers;
    pass += set[Math.floor(Math.random() * set.length)];
  }
  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Build display name from user profile (first + last), max 100 chars.
 */
async function buildVegasXDisplayName(userId) {
  const u = await db.User.findByPk(userId, {
    attributes: ['firstName', 'lastName', 'username']
  });
  if (!u) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  const first = (u.firstName || '').trim();
  const last = (u.lastName || '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  const fallback = (u.username || '').trim() || 'Player';
  const name = (combined || fallback).slice(0, VEGASX_NAME_MAX);
  return name || 'Player';
}

function getVegasXValidationErrorMessages(data) {
  if (!data || typeof data !== 'object' || !data.errors || typeof data.errors !== 'object') {
    return [];
  }
  const messages = [];
  for (const value of Object.values(data.errors)) {
    if (typeof value === 'string' && value.trim()) {
      messages.push(value.trim());
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) messages.push(item.trim());
      }
    }
  }
  return messages;
}

function getVegasXErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  if (typeof data.trans === 'string' && data.trans.trim()) return data.trans.trim();
  const validationMessages = getVegasXValidationErrorMessages(data);
  if (validationMessages.length) return validationMessages.join('; ');
  return fallback;
}

function isVegasXUserAlreadyExistsMessage(message) {
  const msg = String(message || '').toLowerCase();
  return (
    msg.includes('already exists') ||
    msg.includes('already in use') ||
    msg.includes('already taken') ||
    msg.includes('username has already been taken') ||
    msg.includes('email address is already') ||
    msg.includes('duplicate') ||
    msg.includes('unique')
  );
}

function isVegasXUserAlreadyExistsResponse(data) {
  if (!data || typeof data !== 'object') return false;
  if (isVegasXUserAlreadyExistsMessage(getVegasXErrorMessage(data, ''))) return true;
  const usernameErrors = data.errors && data.errors.username;
  if (!usernameErrors) return false;
  const list = Array.isArray(usernameErrors) ? usernameErrors : [usernameErrors];
  return list.some((item) => isVegasXUserAlreadyExistsMessage(item));
}

function isVegasXTokenExpiredResponse(res, data) {
  if (res.status === 401) return true;
  const msg = getVegasXErrorMessage(data, '').toLowerCase();
  if (res.status === 403 && (
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('unauthenticated') ||
    msg.includes('expired')
  )) {
    return true;
  }
  return data && data.success === false && (
    msg.includes('token') ||
    msg.includes('unauthorized') ||
    msg.includes('unauthenticated') ||
    msg.includes('expired')
  );
}

function normalizeBearerToken(raw) {
  return String(raw || '').trim().replace(/^Bearer\s+/i, '');
}

async function refreshVegasXCashierToken(game) {
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
  const baseUrl = await resolveVegasXBotBaseUrl(game);
  const storeUsername = String(game.botUsername || '').trim();
  const storePassword = String(game.botPassword || '');
  if (!baseUrl || !storeUsername || !storePassword) {
    const err = new Error('Game is missing cashier login credentials.');
    err.statusCode = 503;
    throw err;
  }
  const loginResult = await cashierLogin(baseUrl, storeUsername, storePassword);
  // Keep the full token for the in-flight request; DB column is VARCHAR(512).
  const token = normalizeBearerToken(loginResult.token);
  if (!token) {
    const err = new Error('Cashier login did not return a token.');
    err.statusCode = 502;
    throw err;
  }
  await db.Game.update({ streamlitToken: token.slice(0, 512) }, { where: { id: game.id } });
  game.streamlitToken = token;
  return token;
}

async function ensureVegasXCashierToken(game) {
  let token = normalizeBearerToken(game.streamlitToken);
  if (token) return token;
  return refreshVegasXCashierToken(game);
}

/**
 * POST {botApiUrl}/cashier/create
 * @param {object} game
 * @param {string} bearerToken
 * @param {{ name: string, username: string, password: string }} payload
 */
async function callVegasXCashierCreate(game, bearerToken, { name, username, password }) {
  const baseUrl = await resolveVegasXBotBaseUrl(game);
  if (!baseUrl) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  const url = `${baseUrl}/cashier/create`;
  const body = {
    name: String(name || '').trim().slice(0, VEGASX_NAME_MAX),
    username: sanitizeVegasXUsername(username),
    password: String(password || '')
  };
  if (!body.name) {
    const err = new Error('Display name is required to create your game account.');
    err.statusCode = 400;
    throw err;
  }
  if (!isValidVegasXUsername(body.username)) {
    const err = new Error('Username can only contain letters, numbers, underscores, dashes, or dots.');
    err.statusCode = 400;
    throw err;
  }
  if (body.password.length < VEGASX_PASSWORD_MIN) {
    const err = new Error(`Password must be at least ${VEGASX_PASSWORD_MIN} characters.`);
    err.statusCode = 400;
    err.isPasswordValidationError = true;
    throw err;
  }

  const res = await axios.post(url, body, {
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalizeBearerToken(bearerToken)}`
    },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log("callVegasXCashierCreate res", res.data);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (isVegasXTokenExpiredResponse(res, data)) {
    const err = new Error('Cashier session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  if (data.success !== true) {
    const msg = getVegasXErrorMessage(data, 'Could not create your game account. Please try again later.');
    const userAlreadyExists = isVegasXUserAlreadyExistsResponse(data);
    const err = new Error(msg.startsWith('Could not') ? msg : `Could not create your game account: ${msg}`);
    err.statusCode = userAlreadyExists ? 409 : (res.status >= 400 ? res.status : 502);
    err.externalResponse = captureBotApiResponse(data, res.status);
    err.isUserAlreadyExists = userAlreadyExists;
    err.isPasswordValidationError = /password/i.test(msg) && /(at least|minimum|short|length)/i.test(msg);
    throw err;
  }

  const payload = data.data && typeof data.data === 'object' ? data.data : {};
  const accountName = payload.username != null
    ? String(payload.username).trim()
    : (payload.email != null ? String(payload.email).trim() : body.username);
  return {
    account_name: accountName || body.username,
    password: body.password,
    provider_user_id: payload.id != null ? String(payload.id) : null
  };
}

/**
 * POST {botApiUrl}/cashier/user/{providerUserId}/credits-action
 * @param {object} game
 * @param {string} bearerToken
 * @param {string|number} providerUserId - user_game_accounts.provider_user_id
 * @param {number} scAmount - platform SC amount (converted: 1 SC = 100; negative when withdrawing)
 * @param {{ reset?: boolean, withdraw?: boolean }} [options]
 */
async function callVegasXCashierCreditsAction(game, bearerToken, providerUserId, scAmount, options = {}) {
  const baseUrl = await resolveVegasXBotBaseUrl(game);
  const userId = String(providerUserId || '').trim();
  if (!baseUrl) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  if (!userId) {
    const err = new Error('Your game account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }

  const withdraw = options.withdraw === true;
  const agentAmount = withdraw
    ? -toVegasXAgentAmount(scAmount)
    : toVegasXAgentAmount(scAmount);
  const url = `${baseUrl}/cashier/user/${encodeURIComponent(userId)}/credits-action`;
  const res = await axios.post(
    url,
    { amount: agentAmount, reset: options.reset === true },
    {
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizeBearerToken(bearerToken)}`
      },
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true
    }
  );

  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (isVegasXTokenExpiredResponse(res, data)) {
    const err = new Error('Cashier session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  if (data.success !== true) {
    const fallback = withdraw
      ? 'Withdrawal could not be processed at this time. Please try again later.'
      : 'Deposit could not be processed at this time. Please try again later.';
    const msg = getVegasXErrorMessage(data, fallback);
    const err = new Error(msg);
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    if (/insufficient|not enough/i.test(msg)) {
      err.isUserBalanceError = true;
    }
    throw err;
  }

  return data;
}

/**
 * Normalize VegasX cashier /cashier/users payload into a users array.
 * Supports both `{ users: [...] }` and `{ data: { users: [...] } }`.
 * @param {object} data
 * @returns {object[]|null}
 */
function extractVegasXCashierUsers(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.users)) return data.users;
  if (data.data && typeof data.data === 'object' && Array.isArray(data.data.users)) {
    return data.data.users;
  }
  if (Array.isArray(data.data)) return data.data;
  return null;
}

/**
 * Normalize a VegasX player name for comparison against `users.name`.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeVegasXPlayerName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase();
}

function pickVegasXCashierUserByExactName(users, needle) {
  if (!Array.isArray(users) || !needle) return null;
  return users.find((user) => {
    if (!user || typeof user !== 'object') return false;
    return normalizeVegasXPlayerName(user.name) === needle;
  }) || null;
}

function formatVegasXCashierUserMatch(matched, enteredName) {
  return {
    id: String(matched.id).trim(),
    name: String(matched.name || '').trim() || String(enteredName || '').trim(),
    username: matched.username != null ? String(matched.username).trim() : null,
    user: matched
  };
}

/**
 * GET {botApiUrl}/cashier/users[?search=...]
 * Agent API: Authorization Bearer <token from store-added game>
 * @param {object} game
 * @param {string} bearerToken
 * @param {{ search?: string }} [options]
 * @returns {Promise<{ users: object[], count: number|null }>}
 */
async function callVegasXCashierUsersRequest(game, bearerToken, options = {}) {
  const baseUrl = await resolveVegasXBotBaseUrl(game);
  if (!baseUrl) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }

  const token = normalizeBearerToken(bearerToken);
  if (!token) {
    const err = new Error('Cashier session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    throw err;
  }

  const search = String(options.search || '').trim();
  const url = search
    ? `${baseUrl}/cashier/users?search=${encodeURIComponent(search)}`
    : `${baseUrl}/cashier/users`;

  const res = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      accept: 'application/json',
      Authorization: `Bearer ${token}`
    },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  const data = res.data && typeof res.data === 'object' ? res.data : {};
  console.log(
    search ? '[vegasx] GET /cashier/users?search' : '[vegasx] GET /cashier/users',
    {
      baseUrl,
      search: search || undefined,
      status: res.status,
      success: data.success,
      count: data.count,
      usersLength: Array.isArray(data.users)
        ? data.users.length
        : (Array.isArray(data?.data?.users) ? data.data.users.length : null)
    }
  );

  if (isVegasXTokenExpiredResponse(res, data)) {
    const err = new Error('Cashier session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  const users = extractVegasXCashierUsers(data);
  if (data.success !== true || !users) {
    const msg = getVegasXErrorMessage(data, 'Game provider failed to fetch users.');
    const err = new Error(msg);
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  const count = Number.isFinite(Number(data.count)) ? Number(data.count) : users.length;
  return { users, count };
}

/**
 * GET {botApiUrl}/cashier/users
 * @returns {Promise<object[]>} users list from agent API
 */
async function callVegasXCashierListUsers(game, bearerToken) {
  const { users } = await callVegasXCashierUsersRequest(game, bearerToken);
  return users;
}

/**
 * GET {botApiUrl}/cashier/users?search={query}
 * @returns {Promise<object[]>}
 */
async function callVegasXCashierSearchUsers(game, bearerToken, search) {
  const { users } = await callVegasXCashierUsersRequest(game, bearerToken, { search });
  return users;
}

/**
 * Find a VegasX cashier user by `users.name` (Connect Your Account username).
 * Uses agent search first, then scans the full users list.
 * @param {object} game
 * @param {string} bearerToken
 * @param {string} name - name entered by the player when connecting
 * @returns {Promise<{ id: string, name: string, username: string|null, user: object }>}
 */
async function findVegasXCashierUserByName(game, bearerToken, name) {
  const rawName = String(name || '').trim();
  const needle = normalizeVegasXPlayerName(rawName);
  if (!needle) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    err.isSearchUserNotFound = true;
    err.code = 'GAME_USER_NOT_FOUND';
    throw err;
  }

  let matched = null;

  // Agent API supports server-side lookup via ?search=
  const searchUsers = await callVegasXCashierSearchUsers(game, bearerToken, rawName);
  matched = pickVegasXCashierUserByExactName(searchUsers, needle);

  // Fallback: scan full users list and match users.name exactly
  if (!matched) {
    const { users, count } = await callVegasXCashierUsersRequest(game, bearerToken);
    matched = pickVegasXCashierUserByExactName(users, needle);

    // If API reports more users than returned, keep scanning is not possible without
    // pagination support — search endpoint is the reliable lookup for large lists.
    if (!matched && count > users.length) {
      console.warn('[vegasx] users list may be truncated', { count, usersLength: users.length, needle });
    }
  }

  console.log(
    '[vegasx] find cashier user by name',
    {
      needle,
      matched: Boolean(matched),
      matchedId: matched?.id ?? null,
      matchedName: matched?.name ?? null
    }
  );

  if (!matched || matched.id == null || String(matched.id).trim() === '') {
    const err = new Error('User not found.');
    err.statusCode = 404;
    err.isSearchUserNotFound = true;
    err.code = 'GAME_USER_NOT_FOUND';
    throw err;
  }

  return formatVegasXCashierUserMatch(matched, rawName);
}

/**
 * GET {botApiUrl}/cashier/user/{providerUserId}
 * @returns {Promise<{ balance: number, user: object }>}
 */
async function callVegasXCashierGetUser(game, bearerToken, providerUserId) {
  const baseUrl = await resolveVegasXBotBaseUrl(game);
  const userId = String(providerUserId || '').trim();
  if (!baseUrl) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  if (!userId) {
    const err = new Error('Your game account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }

  const url = `${baseUrl}/cashier/user/${encodeURIComponent(userId)}`;
  const res = await axios.get(url, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${normalizeBearerToken(bearerToken)}`
    },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log("callVegasXCashierGetUser res", res.data);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (isVegasXTokenExpiredResponse(res, data)) {
    const err = new Error('Cashier session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  const user = data.user && typeof data.user === 'object' ? data.user : null;
  if (!user || user.error === true || user.success === false) {
    const msg = getVegasXErrorMessage(data, 'Game provider failed to fetch the balance.');
    const err = new Error(msg);
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  const creditsRaw = user.credits != null ? user.credits : user.actual_credits;
  const balance = Number(creditsRaw);
  if (!Number.isFinite(balance)) {
    const err = new Error('Game provider returned an invalid balance.');
    err.statusCode = 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  return { balance, user };
}

/**
 * POST {botApiUrl}/cashier/user/update/{providerUserId}/password
 * Resets a player's password. Body: { password }. Bearer cashier token.
 * Docs: https://proapi.gapi.lol/cashier/update-password
 * @param {object} game
 * @param {string} bearerToken
 * @param {string|number} providerUserId - user_game_accounts.provider_user_id
 * @param {string} newPassword - plain text, minimum 6 characters
 */
async function callVegasXCashierUpdatePassword(game, bearerToken, providerUserId, newPassword) {
  const baseUrl = await resolveVegasXBotBaseUrl(game);
  const userId = String(providerUserId || '').trim();
  const password = String(newPassword || '');
  if (!baseUrl) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  if (!userId) {
    const err = new Error('Your game account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }
  if (password.length < VEGASX_PASSWORD_MIN) {
    const err = new Error(`Password must be at least ${VEGASX_PASSWORD_MIN} characters.`);
    err.statusCode = 400;
    err.isPasswordValidationError = true;
    throw err;
  }

  const url = `${baseUrl}/cashier/user/update/${encodeURIComponent(userId)}/password`;
  const res = await axios.post(
    url,
    { password },
    {
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${normalizeBearerToken(bearerToken)}`
      },
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true
    }
  );

  console.log('callVegasXCashierUpdatePassword res', res.data);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  if (isVegasXTokenExpiredResponse(res, data)) {
    const err = new Error('Cashier session expired.');
    err.statusCode = 401;
    err.isTokenExpired = true;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  if (data.success !== true) {
    const msg = getVegasXErrorMessage(data, 'Could not update your game password. Please try again later.');
    const err = new Error(msg);
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    err.isPasswordValidationError = /password/i.test(msg) && /(at least|minimum|short|length)/i.test(msg);
    throw err;
  }

  return data;
}

/**
 * Run a VegasX cashier API call with cashier auth.
 * @template T
 * @param {object} game
 * @param {(token: string) => Promise<T>} requestFn
 * @param {{ preferStoredToken?: boolean }} [options]
 *   - preferStoredToken: use games.streamlit_token first (balance GET); default fresh login (mutations).
 */
async function withVegasXCashierTokenRetry(game, requestFn, options = {}) {
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
    ? await ensureVegasXCashierToken(game)
    : await refreshVegasXCashierToken(game);
  try {
    return await requestFn(token);
  } catch (err) {
    if (!err || !err.isTokenExpired) throw err;
    token = await refreshVegasXCashierToken(game);
    return requestFn(token);
  }
}

module.exports = {
  isVegasXGame,
  sanitizeVegasXUsername,
  isValidVegasXUsername,
  createAlternateVegasXUsername,
  generateVegasXPassword,
  buildVegasXDisplayName,
  refreshVegasXCashierToken,
  ensureVegasXCashierToken,
  resolveVegasXBotBaseUrl,
  callVegasXCashierCreate,
  callVegasXCashierCreditsAction,
  callVegasXCashierUpdatePassword,
  callVegasXCashierListUsers,
  callVegasXCashierSearchUsers,
  findVegasXCashierUserByName,
  callVegasXCashierGetUser,
  toVegasXAgentAmount,
  withVegasXCashierTokenRetry,
  VEGASX_USERNAME_REGEX,
  VEGASX_PASSWORD_MIN,
  VEGASX_NAME_MAX,
  VEGASX_SC_TO_AGENT_MULTIPLIER
};
