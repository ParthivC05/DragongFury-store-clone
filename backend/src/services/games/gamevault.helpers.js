'use strict';

const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const db = require('../../db/models');
const {
  isAgentCredentialGame,
  resolveGameIntegrationKey
} = require('../../utils/gameIntegration.helpers');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { captureBotApiResponse } = require('../../utils/botApiHelper');
const { stripAlphanumericUsername } = require('../../utils/gameUsernameValidation.helpers');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;

/** Normalize bot_api_url / bot_base_url from games or game_templates table. */
function normalizeGameVaultApiBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

/**
 * GameVault API base URL: prefer game_templates.bot_base_url (master config),
 * then games.bot_api_url (store copy). Syncs games.bot_api_url when template is newer.
 */
async function resolveGameVaultBotBaseUrl(game) {
  const gameKey = resolveGameIntegrationKey(game);
  const templates = await db.GameTemplate.findAll({
    where: { isActive: true },
    attributes: ['name', 'gameKey', 'botBaseUrl'],
    order: [['updated_at', 'DESC']]
  });
  const template = gameKey
    ? templates.find((t) => resolveGameIntegrationKey(t) === gameKey)
    : templates.find((t) => isAgentCredentialGame(t));
  const fromTemplate = normalizeGameVaultApiBaseUrl(template?.botBaseUrl);
  const fromGame = normalizeGameVaultApiBaseUrl(game?.botApiUrl);
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

const GAMEVAULT_PASSWORD_MIN = 6;
const GAMEVAULT_PASSWORD_MAX = 32;
const GAMEVAULT_INVALID_USER_ID_CODE = 8;

const GAMEVAULT_ERROR_MESSAGES = {
  1: 'Invalid agent configuration. Please contact support.',
  2: 'Invalid request. Please check your username and try again.',
  3: 'Game agent credentials are invalid. Please contact support.',
  4: 'Request expired. Please try again.',
  5: 'Access denied from this server. Please contact support.',
  6: 'Insufficient agent balance. Please contact support.',
  7: 'Insufficient user balance.',
  8: 'Invalid user ID.',
  9: 'User account is frozen.',
  10: 'User is currently in a game.',
  11: 'Invalid amount.',
  12: 'Recharge failed. Please try again later.',
  13: 'Recharge permission denied.',
  14: 'Withdrawal failed. Please try again later.',
  15: 'Withdrawal amount exceeds the daily limit.',
  16: 'Withdrawal is under review.',
  17: 'Withdrawal permission denied.',
  18: 'Username can only contain letters, numbers, and underscores.',
  19: 'Agent does not have permission to register users.',
  20: 'This username is already taken. Please choose another.',
  21: 'System error. Please try again later.',
  22: 'Too many registrations from this location. Please try again later.',
  23: 'Could not set password. Please try again.',
  400: 'Invalid request parameters. Please try again.'
};

/** True for games using the external agent API (GameVault2, Juwa 2.0 Agent API, etc.). */
function isAgentApiGame(gameOrName) {
  if (gameOrName && typeof gameOrName === 'object') {
    return isAgentCredentialGame(gameOrName);
  }
  return isAgentCredentialGame({ name: gameOrName });
}

/** @deprecated Use isAgentApiGame */
function isGameVaultGame(gameOrName) {
  return isAgentApiGame(gameOrName);
}

/**
 * MD5(agent_id:timestamp:secret_key) — lowercase 32-character hex string.
 */
function generateGameVaultToken(agentId, timestamp, secretKey) {
  const agent = String(agentId || '').trim();
  const ts = String(timestamp || '').trim();
  const secret = String(secretKey || '').trim();
  const raw = `${agent}:${ts}:${secret}`;
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex');
}

function normalizeGameVaultCredentials(agentId, apiSecretKey) {
  return {
    agentId: String(agentId || '').trim(),
    apiSecretKey: String(apiSecretKey || '').trim()
  };
}

async function callGameVaultAgentBalanceCheck(botBaseUrl, agentId, apiSecretKey) {
  const root = normalizeGameVaultApiBaseUrl(botBaseUrl);
  if (!root) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 400;
    throw err;
  }
  const { agentId: resolvedAgentId, apiSecretKey: resolvedSecret } = normalizeGameVaultCredentials(agentId, apiSecretKey);
  if (!resolvedAgentId || !resolvedSecret) {
    const err = new Error('Agent ID and API secret key are required.');
    err.statusCode = 400;
    throw err;
  }

  const url = `${root}/api/external/agentBalance`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = generateGameVaultToken(resolvedAgentId, timestamp, resolvedSecret);

  const form = new FormData();
  form.append('agent_id', resolvedAgentId);
  form.append('timestamp', timestamp);
  form.append('token', token);

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const providerMsg = response && (response.msg ?? response.message);

  if (res.status === 400 || code === 400) {
    const err = new Error(resolveGameVaultErrorMessage(400, providerMsg, 'Invalid GameVault agent credentials.'));
    err.statusCode = 400;
    err.gameVaultCode = 400;
    throw err;
  }

  if (res.status !== 200 || code !== 0) {
    const err = new Error(
      code === 1 || code === 3
        ? 'GameVault agent credentials are invalid. Check Agent ID and API Secret Key from your GameVault agent dashboard.'
        : resolveGameVaultErrorMessage(code, providerMsg, 'Could not verify GameVault agent credentials.')
    );
    err.statusCode = 400;
    err.gameVaultCode = code;
    throw err;
  }

  return true;
}

/**
 * Verify store-level GameVault2 credentials before saving a game.
 */
async function validateGameVaultAgentCredentials(botBaseUrl, agentId, apiSecretKey) {
  return callGameVaultAgentBalanceCheck(botBaseUrl, agentId, apiSecretKey);
}

/**
 * Password: letters, underscore, and numbers; 6–32 characters.
 */
function generateGameVaultPassword() {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const underscore = '_';
  const pool = letters + numbers + underscore;
  const len = GAMEVAULT_PASSWORD_MIN + Math.floor(Math.random() * (12 - GAMEVAULT_PASSWORD_MIN + 1));
  let pass = '';
  pass += letters[Math.floor(Math.random() * letters.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  pass += underscore;
  while (pass.length < len) {
    pass += pool[Math.floor(Math.random() * pool.length)];
  }
  return pass
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

function resolveGameVaultErrorMessage(code, fallbackMsg, fallbackDefault) {
  if (code != null && GAMEVAULT_ERROR_MESSAGES[code] != null) {
    return GAMEVAULT_ERROR_MESSAGES[code];
  }
  const msg = fallbackMsg != null ? String(fallbackMsg).trim() : '';
  if (msg) return msg;
  return fallbackDefault || 'Could not complete the request. Please try again later.';
}

/** Preserve upstream gateway/timeout HTTP status so callers can route to manual. */
function resolveGameVaultTransportStatus(httpStatus, fallback = 502) {
  const status = Number(httpStatus);
  if (status === 502 || status === 503 || status === 504) return status;
  return fallback;
}

function generateGameVaultOrderId() {
  return `GV${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
}

function isGameVaultInvalidUserIdError(err) {
  return Boolean(err && err.gameVaultCode === GAMEVAULT_INVALID_USER_ID_CODE);
}

/**
 * POST {baseUrl}/api/external/getUserId (multipart/form-data).
 * @returns {Promise<string>} Provider user_id
 */
async function callGameVaultGetUserId(game, agentId, apiSecretKey, accountName) {
  const root = typeof game === 'string'
    ? normalizeGameVaultApiBaseUrl(game)
    : await resolveGameVaultBotBaseUrl(game);
  if (!root) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  const url = `${root}/api/external/getUserId`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = generateGameVaultToken(agentId, timestamp, apiSecretKey);

  const form = new FormData();
  form.append('agent_id', String(agentId));
  form.append('timestamp', timestamp);
  form.append('token', token);
  form.append('account_name', stripAlphanumericUsername(accountName) || String(accountName));

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  console.log('gamevault res', res.data);
  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const responseData = response && (response.data || response.Data);
  const providerMsg = response && (response.msg ?? response.message);

  if (res.status === 400 || code === 400) {
    const err = new Error(resolveGameVaultErrorMessage(400, providerMsg, 'Could not resolve game user ID. Please try again.'));
    err.statusCode = 400;
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = 400;
    throw err;
  }

  if (res.status !== 200 || code !== 0) {
    const err = new Error(resolveGameVaultErrorMessage(code, providerMsg, 'Could not resolve game user ID. Please try again later.'));
    err.statusCode = resolveGameVaultTransportStatus(res.status, 502);
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = code;
    if (code === GAMEVAULT_INVALID_USER_ID_CODE) {
      err.isInvalidUserId = true;
    }
    throw err;
  }

  const userId = responseData && (responseData.user_id ?? responseData.userId);
  if (userId == null || String(userId).trim() === '') {
    const err = new Error('Game provider did not return a user ID.');
    err.statusCode = 502;
    err.externalResponse = captureBotApiResponse(response, res.status);
    throw err;
  }

  return String(userId).trim();
}

async function persistGameVaultProviderUserId(userGameAccount, providerUserId, transaction) {
  const id = String(providerUserId || '').trim();
  if (!id) return null;
  const stored = id.slice(0, 64);
  await userGameAccount.update({ providerUserId: stored }, { transaction });
  userGameAccount.providerUserId = stored;
  return stored;
}

async function fetchGameVaultProviderUserId(game, agentId, apiSecretKey, accountName) {
  return callGameVaultGetUserId(game, agentId, apiSecretKey, accountName);
}

async function fetchAndPersistGameVaultProviderUserId(game, userGameAccount, agentId, apiSecretKey, transaction) {
  const accountName = String(userGameAccount.botUsername || '').trim();
  if (!accountName) {
    const err = new Error('Your game account is missing bot username.');
    err.statusCode = 400;
    throw err;
  }
  const userId = await fetchGameVaultProviderUserId(game, agentId, apiSecretKey, accountName);
  return persistGameVaultProviderUserId(userGameAccount, userId, transaction);
}

async function ensureGameVaultProviderUserId(game, userGameAccount, agentId, apiSecretKey, transaction) {
  const existing = String(userGameAccount.providerUserId || '').trim();
  if (existing) return existing;
  return fetchAndPersistGameVaultProviderUserId(game, userGameAccount, agentId, apiSecretKey, transaction);
}

async function withGameVaultProviderUserIdRetry({
  game,
  userGameAccount,
  agentId,
  apiSecretKey,
  transaction,
  operation
}) {
  let providerUserId = await ensureGameVaultProviderUserId(
    game,
    userGameAccount,
    agentId,
    apiSecretKey,
    transaction
  );
  try {
    return await operation(providerUserId);
  } catch (err) {
    if (!isGameVaultInvalidUserIdError(err)) throw err;
    providerUserId = await fetchAndPersistGameVaultProviderUserId(
      game,
      userGameAccount,
      agentId,
      apiSecretKey,
      transaction
    );
    return operation(providerUserId);
  }
}

/**
 * POST {baseUrl}/api/external/recharge (multipart/form-data).
 * @returns {Promise<object>} Provider data payload on success
 */
async function callGameVaultRecharge(game, agentId, apiSecretKey, providerUserId, amount, orderId) {
  const root = typeof game === 'string'
    ? normalizeGameVaultApiBaseUrl(game)
    : await resolveGameVaultBotBaseUrl(game);
  if (!root) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  const url = `${root}/api/external/recharge`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = generateGameVaultToken(agentId, timestamp, apiSecretKey);
  const resolvedOrderId = orderId || generateGameVaultOrderId();

  const form = new FormData();
  form.append('agent_id', String(agentId));
  form.append('timestamp', timestamp);
  form.append('token', token);
  form.append('user_id', String(providerUserId));
  form.append('amount', String(amount));
  form.append('order_id', String(resolvedOrderId));

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  console.log('gamevault res', res);
  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const responseData = response && (response.data || response.Data);
  const providerMsg = response && (response.msg ?? response.message);

  if (res.status === 400 || code === 400) {
    const err = new Error(resolveGameVaultErrorMessage(400, providerMsg, 'Deposit could not be processed. Please try again.'));
    err.statusCode = 400;
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = 400;
    throw err;
  }

  if (res.status !== 200 || code !== 0) {
    const err = new Error(resolveGameVaultErrorMessage(code, providerMsg, 'Deposit could not be processed. Please try again later.'));
    err.statusCode = code === 10 ? 400 : resolveGameVaultTransportStatus(res.status, 502);
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = code;
    err.isUserInGame = code === 10;
    err.isAgentBalanceError = code === 6;
    if (code === GAMEVAULT_INVALID_USER_ID_CODE) {
      err.isInvalidUserId = true;
    }
    throw err;
  }

  return {
    order_id: resolvedOrderId,
    ...(responseData && typeof responseData === 'object' ? responseData : {})
  };
}

/**
 * POST {baseUrl}/api/external/withdraw (multipart/form-data).
 * @returns {Promise<object>} Provider data payload on success
 */
async function callGameVaultWithdraw(game, agentId, apiSecretKey, providerUserId, amount, orderId) {
  const root = typeof game === 'string'
    ? normalizeGameVaultApiBaseUrl(game)
    : await resolveGameVaultBotBaseUrl(game);
  if (!root) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  const url = `${root}/api/external/withdraw`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = generateGameVaultToken(agentId, timestamp, apiSecretKey);
  const resolvedOrderId = orderId || generateGameVaultOrderId();

  const form = new FormData();
  form.append('agent_id', String(agentId));
  form.append('timestamp', timestamp);
  form.append('token', token);
  form.append('user_id', String(providerUserId));
  form.append('amount', String(amount));
  form.append('order_id', String(resolvedOrderId));

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const responseData = response && (response.data || response.Data);
  const providerMsg = response && (response.msg ?? response.message);

  if (res.status === 400 || code === 400) {
    const err = new Error(resolveGameVaultErrorMessage(400, providerMsg, 'Withdrawal could not be processed. Please try again.'));
    err.statusCode = 400;
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = 400;
    throw err;
  }

  if (res.status !== 200 || code !== 0) {
    const err = new Error(resolveGameVaultErrorMessage(code, providerMsg, 'Withdrawal could not be processed. Please try again later.'));
    err.statusCode = code === 10 || code === 7 ? 400 : resolveGameVaultTransportStatus(res.status, 502);
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = code;
    err.isUserInGame = code === 10;
    err.isUserBalanceError = code === 7;
    if (code === GAMEVAULT_INVALID_USER_ID_CODE) {
      err.isInvalidUserId = true;
    }
    throw err;
  }

  return {
    order_id: resolvedOrderId,
    ...(responseData && typeof responseData === 'object' ? responseData : {})
  };
}

/**
 * POST {baseUrl}/api/external/agentBalance (multipart/form-data).
 * @returns {Promise<{ balance: number, agent_balance?: number }>}
 */
async function callGameVaultAgentBalance(game, agentId, apiSecretKey, providerUserId) {
  const root = typeof game === 'string'
    ? normalizeGameVaultApiBaseUrl(game)
    : await resolveGameVaultBotBaseUrl(game);
  if (!root) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  const url = `${root}/api/external/userBalance`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = generateGameVaultToken(agentId, timestamp, apiSecretKey);

  const form = new FormData();
  form.append('agent_id', String(agentId));
  form.append('timestamp', timestamp);
  form.append('token', token);
  form.append('user_id', String(providerUserId));

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  console.log('gamevault res', res);
  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const responseData = response && (response.data || response.Data);
  const providerMsg = response && (response.msg ?? response.message);

  if (res.status === 400 || code === 400) {
    const err = new Error(resolveGameVaultErrorMessage(400, providerMsg, 'Failed to fetch game balance. Please try again.'));
    err.statusCode = 400;
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = 400;
    throw err;
  }

  if (res.status !== 200 || code !== 0) {
    const err = new Error(resolveGameVaultErrorMessage(code, providerMsg, 'Failed to fetch game balance. Please try again later.'));
    err.statusCode = resolveGameVaultTransportStatus(res.status, 502);
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = code;
    if (code === GAMEVAULT_INVALID_USER_ID_CODE) {
      err.isInvalidUserId = true;
    }
    throw err;
  }

  const rawUserBalance = responseData && (
    responseData.user_balance ?? responseData.userBalance ?? responseData.balance
  );
  const balance = Number(rawUserBalance);
  if (!Number.isFinite(balance)) {
    const err = new Error('Game provider did not return a valid balance.');
    err.statusCode = 502;
    err.externalResponse = captureBotApiResponse(response, res.status);
    throw err;
  }

  const rawAgentBalance = responseData && (responseData.agent_balance ?? responseData.agentBalance);
  const agentBalance = rawAgentBalance != null ? Number(rawAgentBalance) : undefined;

  return {
    balance,
    ...(Number.isFinite(agentBalance) ? { agent_balance: agentBalance } : {})
  };
}

/**
 * POST {baseUrl}/api/external/addUser (multipart/form-data).
 * @returns {Promise<{ account_name: string, user_id?: string }>}
 */
async function callGameVaultAddUser(game, agentId, apiSecretKey, account, loginPwd) {
  const safeAccount = stripAlphanumericUsername(account) || 'user';
  const { agentId: resolvedAgentId, apiSecretKey: resolvedSecret } = normalizeGameVaultCredentials(agentId, apiSecretKey);
  const root = typeof game === 'string'
    ? normalizeGameVaultApiBaseUrl(game)
    : await resolveGameVaultBotBaseUrl(game);
  if (!root) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  const url = `${root}/api/external/addUser`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = generateGameVaultToken(resolvedAgentId, timestamp, resolvedSecret);

  const form = new FormData();
  form.append('account', safeAccount);
  form.append('login_pwd', loginPwd);
  form.append('agent_id', resolvedAgentId);
  form.append('timestamp', timestamp);
  form.append('token', token);

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  console.log('gamevault res', res);
  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const responseData = response && (response.data || response.Data);
  const providerMsg = response && (response.msg ?? response.message);

  if (res.status === 400 || code === 400) {
    const err = new Error(resolveGameVaultErrorMessage(400, providerMsg));
    err.statusCode = 400;
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = 400;
    throw err;
  }

  if (res.status !== 200 || code !== 0) {
    const err = new Error(resolveGameVaultErrorMessage(code, providerMsg));
    err.statusCode = code === 20 ? 409 : resolveGameVaultTransportStatus(res.status, 502);
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = code;
    err.isUserAlreadyExists = code === 20;
    err.isPasswordValidationError = code === 23;
    err.isAccountFormatError = code === 18;
    throw err;
  }

  const accountName = responseData && (responseData.account_name ?? responseData.accountName);
  if (!accountName) {
    const err = new Error('Game provider did not return an account name.');
    err.statusCode = 502;
    err.externalResponse = captureBotApiResponse(response, res.status);
    throw err;
  }

  return {
    account_name: String(accountName).trim(),
    user_id: responseData.user_id != null ? String(responseData.user_id) : undefined
  };
}

/**
 * POST {baseUrl}/api/external/resetPassword (multipart/form-data).
 * Resets a player's login password. Params: user_id, login_pwd (+ agent auth).
 * @returns {Promise<object>} Provider data payload on success
 */
async function callGameVaultResetPassword(game, agentId, apiSecretKey, providerUserId, loginPwd) {
  const { agentId: resolvedAgentId, apiSecretKey: resolvedSecret } = normalizeGameVaultCredentials(agentId, apiSecretKey);
  const root = typeof game === 'string'
    ? normalizeGameVaultApiBaseUrl(game)
    : await resolveGameVaultBotBaseUrl(game);
  if (!root) {
    const err = new Error('Game is not configured with an API base URL.');
    err.statusCode = 503;
    throw err;
  }
  const userId = String(providerUserId || '').trim();
  if (!userId) {
    const err = new Error('Your game account is missing provider ID. Please register the game account again.');
    err.statusCode = 400;
    throw err;
  }
  const password = String(loginPwd || '');
  if (password.length < GAMEVAULT_PASSWORD_MIN || password.length > GAMEVAULT_PASSWORD_MAX) {
    const err = new Error(`Password must be between ${GAMEVAULT_PASSWORD_MIN} and ${GAMEVAULT_PASSWORD_MAX} characters.`);
    err.statusCode = 400;
    err.isPasswordValidationError = true;
    throw err;
  }

  const url = `${root}/api/external/resetPassword`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const token = generateGameVaultToken(resolvedAgentId, timestamp, resolvedSecret);

  const form = new FormData();
  form.append('agent_id', resolvedAgentId);
  form.append('timestamp', timestamp);
  form.append('token', token);
  form.append('user_id', userId);
  form.append('login_pwd', password);

  const res = await axios.post(url, form, {
    headers: form.getHeaders(),
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
  });

  console.log('gamevault resetPassword res', res.data);
  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const responseData = response && (response.data || response.Data);
  const providerMsg = response && (response.msg ?? response.message);

  if (res.status === 400 || code === 400) {
    const err = new Error(resolveGameVaultErrorMessage(400, providerMsg, 'Could not reset the game password. Please try again.'));
    err.statusCode = 400;
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = 400;
    throw err;
  }

  if (res.status !== 200 || code !== 0) {
    const err = new Error(resolveGameVaultErrorMessage(code, providerMsg, 'Could not reset the game password. Please try again later.'));
    err.statusCode = resolveGameVaultTransportStatus(res.status, 502);
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = code;
    err.isPasswordValidationError = code === 23;
    if (code === GAMEVAULT_INVALID_USER_ID_CODE) {
      err.isInvalidUserId = true;
    }
    throw err;
  }

  // The provider can return HTTP 200 + code 0 but an error message (e.g. "unKnownErrorCode")
  // with null data, meaning the reset did not actually apply. A genuine success returns
  // msg "Success", so treat unknown-error / failure messages as a provider failure (→ manual mode)
  // instead of reporting a false success to the user.
  const normalizedMsg = String(providerMsg || '').replace(/[^a-z]/gi, '').toLowerCase();
  const providerReportedFailure =
    normalizedMsg.includes('unknownerror') ||
    normalizedMsg.includes('unknowncode') ||
    normalizedMsg === 'unknown' ||
    normalizedMsg.includes('fail') ||
    normalizedMsg.includes('invalid');
  if (providerReportedFailure) {
    const err = new Error('Could not reset the game password. Please try again later.');
    err.statusCode = 502;
    err.externalResponse = captureBotApiResponse(response, res.status);
    err.gameVaultCode = code;
    err.providerReportedFailure = true;
    throw err;
  }

  return responseData && typeof responseData === 'object' ? responseData : {};
}

module.exports = {
  isAgentApiGame,
  isGameVaultGame,
  isGameVaultInvalidUserIdError,
  normalizeGameVaultApiBaseUrl,
  normalizeGameVaultCredentials,
  resolveGameVaultBotBaseUrl,
  generateGameVaultToken,
  generateGameVaultPassword,
  generateGameVaultOrderId,
  validateGameVaultAgentCredentials,
  callGameVaultGetUserId,
  fetchGameVaultProviderUserId,
  persistGameVaultProviderUserId,
  ensureGameVaultProviderUserId,
  withGameVaultProviderUserIdRetry,
  callGameVaultAddUser,
  callGameVaultRecharge,
  callGameVaultWithdraw,
  callGameVaultAgentBalance,
  callGameVaultResetPassword,
  GAMEVAULT_PASSWORD_MIN,
  GAMEVAULT_PASSWORD_MAX,
  GAMEVAULT_INVALID_USER_ID_CODE
};
