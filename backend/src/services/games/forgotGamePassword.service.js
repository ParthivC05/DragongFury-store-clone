'use strict';

const axios = require('axios');
const crypto = require('crypto');
const db = require('../../db/models');
const { Op } = require('sequelize');
const { withBotRetry, isBotApiFailure, captureBotApiResponse } = require('../../utils/botApiHelper');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const { recordBotAutomationFailure } = require('./recordBotAutomationFailure.service');
const { refreshGameBotApiKey } = require('./addGame.service');
const {
  isOrionStarsTerminalGame,
  isOrionStarsBotAutomationGame,
  isFirekirinTerminalGame,
  isFirekirinBotAutomationGame,
  isMilkywayTerminalGame,
  isMilkywayBotAutomationGame,
  isGameroomAgentGame,
  isGameroomBotAutomationGame,
  isCashmachineAgentGame,
  isCashmachineBotAutomationGame,
  isMafiaAgentGame,
  isVegasXCashierGame,
  getStoreGameDisplayName,
} = require('../../utils/gameIntegration.helpers');
const {
  generateOrionStarsPassword,
  changeOrionStarsUserPasswordWithAgentLogin,
} = require('./orionstars.helpers');
const {
  generateFirekirinPassword,
  changeFirekirinUserPasswordWithAgentLogin,
} = require('./firekirin.helpers');
const {
  generateMilkywayPassword,
  changeMilkywayUserPasswordWithAgentLogin,
} = require('./milkyway.helpers');
const {
  generateVegasXPassword,
  callVegasXCashierUpdatePassword,
  withVegasXCashierTokenRetry,
} = require('./vegasx.helpers');
const {
  isAgentApiGame,
  generateGameVaultPassword,
  callGameVaultResetPassword,
  withGameVaultProviderUserIdRetry,
} = require('./gamevault.helpers');
const { GAME_PASSWORD_PENDING } = require('../../constants/gameUserFacingMessages');

const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const MIN_NEW_GAME_PASSWORD_LENGTH = 8;
/** VegasX bot (Pydantic): "String should have at least 6 characters". */
const VEGASX_PASSWORD_MIN = 6;
const VEGASX_PASSWORD_MAX = 16;
/**
 * Forgot-password rules: length plus upper, lower, digit, and special (name key → label and bounds).
 * CashMachine777 / Gameroom / VegasX: align with provider (includes at least one number; bot policy errors return 400, not 502).
 */
const STRICT_FORGOT_PASSWORD_GAMES = {
  /** Bot: 6–12 chars with upper, lower, digit, and special (@ not allowed). */
  cashmachine777: {
    label: 'CashMachine777',
    minLen: 6,
    maxLen: 12,
    forbidAtInPassword: true,
    alphanumericOnly: false,
  },
  gameroom: {
    label: 'Gameroom',
    minLen: 8,
    maxLen: 12,
    forbidAtInPassword: false,
    alphanumericOnly: false,
  },
  /** Bot: min 6 chars; letters and numbers (upper, lower, digit). */
  vegasx: {
    label: 'VegasX',
    minLen: VEGASX_PASSWORD_MIN,
    maxLen: VEGASX_PASSWORD_MAX,
    forbidAtInPassword: false,
    alphanumericOnly: true,
  },
};

/** Game names that use third-party fast/user/updatePasswd API (VBLink / UltraPanda / Egame99). */
const VBLINK_ULTRAPANDA_NAMES = ['Vblink', 'UltraPanda', 'Egame99'];

function isVblinkOrUltrapanda(gameName) {
  const name = String(gameName || '').trim();
  return VBLINK_ULTRAPANDA_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

function isVegasXGame(gameName) {
  return normalizeGameNameKey(gameName) === 'vegasx';
}

function randomLengthInRange(minLen, maxLen) {
  const safeMin = Math.max(1, Number(minLen) || 1);
  const safeMax = Math.max(safeMin, Number(maxLen) || safeMin);
  return safeMin + crypto.randomInt(0, safeMax - safeMin + 1);
}

function getForgotPasswordMinLength(gameName) {
  const cfg = strictForgotPasswordGameConfig(gameName);
  if (cfg) return cfg.minLen;
  if (isVegasXGame(gameName)) return VEGASX_PASSWORD_MIN;
  if (isVblinkOrUltrapanda(gameName)) return VBLINK_PASSWORD_MIN;
  return MIN_NEW_GAME_PASSWORD_LENGTH;
}

function resolveForgotPasswordUsername(userGameAccount, gameUsername) {
  const stored = String(userGameAccount?.botUsername || '').trim();
  const requested = String(gameUsername || '').trim();
  return stored || requested;
}

/**
 * Final guard before calling the bot: never send empty or too-short passwords.
 * @param {string} gameName
 * @param {string} password
 * @returns {string}
 */
function prepareForgotPasswordForBot(gameName, password) {
  const trimmed = String(password || '').trim();
  const minLen = getForgotPasswordMinLength(gameName);
  if (trimmed.length < minLen) {
    throw validationError(
      `Generated password must be at least ${minLen} characters before calling the game provider.`
    );
  }
  assertValidNewGamePassword(gameName, trimmed);
  return trimmed;
}

const GAME_ATTRS = ['id', 'name', 'gameKey', 'gameTemplateId', 'botApiUrl', 'botApiKey', 'streamlitToken', 'botUsername', 'botPassword', 'agentId', 'apiSecretKey', 'isActive', 'botOffline', 'appId', 'appSecret', 'addedByStoreCode'];
const MAX_RESET_PASSWORD_ATTEMPTS = 15;

/** Normalize game name for rule lookup (e.g. "Cash Machine 777" → "cashmachine777"). */
function normalizeGameNameKey(gameName) {
  const key = String(gameName || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (key.startsWith('gameroom')) return 'gameroom';
  if (key.startsWith('cashmachine777') || key === 'cashmachineagent' || key.startsWith('cashmachineagent')) {
    return 'cashmachine777';
  }
  return key;
}

function usesStrictForgotPasswordGame(gameName) {
  const key = normalizeGameNameKey(gameName);
  return Object.prototype.hasOwnProperty.call(STRICT_FORGOT_PASSWORD_GAMES, key);
}

function strictForgotPasswordGameConfig(gameName) {
  const key = normalizeGameNameKey(gameName);
  return STRICT_FORGOT_PASSWORD_GAMES[key] || null;
}

function strictForgotPasswordGameLabel(gameName) {
  return strictForgotPasswordGameConfig(gameName)?.label || 'This game';
}

/**
 * Enforce per-game rules before DB or provider calls.
 * @param {string} gameName
 * @param {string} trimmedNewPassword - already trimmed
 */
function validationError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.internalValidation = true;
  return err;
}

function assertValidNewGamePassword(gameName, trimmedNewPassword) {
  if (usesStrictForgotPasswordGame(gameName)) {
    const label = strictForgotPasswordGameLabel(gameName);
    const cfg = strictForgotPasswordGameConfig(gameName);
    const { minLen, maxLen } = cfg;
    const len = trimmedNewPassword.length;
    if (len < minLen || len > maxLen) {
      throw validationError(
        `For ${label}, password must be between ${minLen} and ${maxLen} characters.`
      );
    }
    if (cfg.forbidAtInPassword && trimmedNewPassword.includes('@')) {
      throw validationError(
        `For ${label}, the @ character cannot be used in the password. Use another symbol (for example ! # $ % & *).`
      );
    }
    if (!/[A-Z]/.test(trimmedNewPassword)) {
      throw validationError(`For ${label}, password must include at least one uppercase letter.`);
    }
    if (!/[a-z]/.test(trimmedNewPassword)) {
      throw validationError(`For ${label}, password must include at least one lowercase letter.`);
    }
    if (cfg.alphanumericOnly) {
      if (!/^[A-Za-z0-9]+$/.test(trimmedNewPassword)) {
        throw validationError(`For ${label}, password can only contain letters and numbers.`);
      }
    } else if (!/[^A-Za-z0-9]/.test(trimmedNewPassword)) {
      throw validationError(
        `For ${label}, password must include at least one special character (for example ! # $ % & *).`
      );
    }
    if (!/\d/.test(trimmedNewPassword)) {
      throw validationError(`For ${label}, password must include at least one number.`);
    }
    return;
  }

  if (isVblinkOrUltrapanda(gameName)) {
    const len = trimmedNewPassword.length;
    if (len < VBLINK_PASSWORD_MIN || len > VBLINK_PASSWORD_MAX) {
      throw validationError(
        `New game password must be between ${VBLINK_PASSWORD_MIN} and ${VBLINK_PASSWORD_MAX} characters.`
      );
    }
    if (!/^[A-Za-z0-9!@#$()%^\/.,]+$/.test(trimmedNewPassword)) {
      throw validationError(
        'New game password contains invalid characters. Allowed symbols: !@#$()%^/.,'
      );
    }
    if (!/[A-Za-z]/.test(trimmedNewPassword)) {
      throw validationError('New game password must include at least one letter.');
    }
    if (!/\d/.test(trimmedNewPassword)) {
      throw validationError('New game password must include at least one number.');
    }
    return;
  }

  if (trimmedNewPassword.length < MIN_NEW_GAME_PASSWORD_LENGTH) {
    throw validationError(
      `New game password must be at least ${MIN_NEW_GAME_PASSWORD_LENGTH} characters.`
    );
  }
}

/** VBLink / UltraPanda / Egame99: 6–16 chars, letters and numbers required; symbols !@#$()%^/., */
const VBLINK_PASSWORD_MIN = 6;
const VBLINK_PASSWORD_MAX = 16;
const VBLINK_ALLOWED_SYMBOLS = '!@#$()%^/.,';
const DEFAULT_PASSWORD_MAX_LEN = 16;

function pickRandomChar(charset) {
  return charset[crypto.randomInt(0, charset.length)];
}

function shuffleString(value) {
  const chars = value.split('');
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function buildVblinkStylePassword() {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = VBLINK_ALLOWED_SYMBOLS;
  const len = randomLengthInRange(VBLINK_PASSWORD_MIN, VBLINK_PASSWORD_MAX);
  let pass = pickRandomChar(letters) + pickRandomChar(numbers);
  const pools = [letters, numbers, symbols];
  while (pass.length < len) {
    const pool = pools[crypto.randomInt(0, pools.length)];
    pass += pickRandomChar(pool);
  }
  return shuffleString(pass);
}

function buildStrictForgotPassword(cfg) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const len = randomLengthInRange(cfg.minLen, cfg.maxLen);

  if (cfg.alphanumericOnly) {
    let pass = pickRandomChar(upper) + pickRandomChar(lower) + pickRandomChar(digits);
    const pools = [upper, lower, digits];
    while (pass.length < len) {
      pass += pickRandomChar(pools[crypto.randomInt(0, pools.length)]);
    }
    return shuffleString(pass);
  }

  const symbols = cfg.forbidAtInPassword ? '!#$%&*' : '!#$%&*@';
  let pass =
    pickRandomChar(upper) +
    pickRandomChar(lower) +
    pickRandomChar(digits) +
    pickRandomChar(symbols);
  const pools = [upper, lower, digits, symbols];
  while (pass.length < len) {
    pass += pickRandomChar(pools[crypto.randomInt(0, pools.length)]);
  }
  return shuffleString(pass);
}

function buildAlphanumericForgotPassword(minLen, maxLen) {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const len = randomLengthInRange(minLen, maxLen);
  let pass = pickRandomChar(letters) + pickRandomChar(numbers);
  const pools = [letters, numbers];
  while (pass.length < len) {
    pass += pickRandomChar(pools[crypto.randomInt(0, pools.length)]);
  }
  return shuffleString(pass);
}

function buildDefaultForgotPassword() {
  return buildAlphanumericForgotPassword(MIN_NEW_GAME_PASSWORD_LENGTH, DEFAULT_PASSWORD_MAX_LEN);
}

/**
 * Generate a password that satisfies per-game forgot-password rules.
 * @param {string} gameName
 * @returns {string}
 */
function generateNewGamePassword(gameName) {
  for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
    let candidate;
    if (isVblinkOrUltrapanda(gameName)) {
      candidate = buildVblinkStylePassword();
    } else {
      const cfg =
        strictForgotPasswordGameConfig(gameName) ||
        (isVegasXGame(gameName) ? STRICT_FORGOT_PASSWORD_GAMES.vegasx : null);
      candidate = cfg ? buildStrictForgotPassword(cfg) : buildDefaultForgotPassword();
    }
    try {
      return prepareForgotPasswordForBot(gameName, candidate);
    } catch (err) {
      if (err.internalValidation && attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1) {
        continue;
      }
      throw err;
    }
  }
  const cfg =
    strictForgotPasswordGameConfig(gameName) ||
    (isVegasXGame(gameName) ? STRICT_FORGOT_PASSWORD_GAMES.vegasx : null);
  const fallback = cfg ? buildStrictForgotPassword(cfg) : buildDefaultForgotPassword();
  return prepareForgotPasswordForBot(gameName, fallback);
}

function buildForgotPasswordBotRequestBody(gameName, username, newPassword) {
  const trimmedUsername = String(username || '').trim();
  const trimmedPassword = String(newPassword || '').trim();
  if (isVegasXGame(gameName)) {
    return {
      username: trimmedUsername,
      new_password: trimmedPassword,
      password: trimmedPassword,
    };
  }
  return {
    username: trimmedUsername,
    new_password: trimmedPassword,
  };
}

/**
 * Bot rejected password format/length — safe to regenerate and retry (matches register flow).
 */
function isBotPasswordValidationError(err) {
  if (!err) return false;
  const message = String(err.message || '').toLowerCase();
  const external =
    err.externalResponse && typeof err.externalResponse === 'object'
      ? String(
          err.externalResponse.message ||
            err.externalResponse.detail ||
            err.externalResponse.error ||
            JSON.stringify(err.externalResponse)
        ).toLowerCase()
      : '';
  const combined = `${message} ${external}`;
  return (
    combined.includes('password can only be letters and numbers') ||
    (combined.includes('password') && combined.includes('6 and 12 characters')) ||
    (combined.includes('password') && combined.includes('8 and 12 characters')) ||
    (combined.includes('password') && combined.includes('letters and numbers') && combined.includes('between')) ||
    (combined.includes('password') && combined.includes('uppercase') && combined.includes('lowercase')) ||
    (combined.includes('password') && combined.includes('special')) ||
    combined.includes('password length error') ||
    combined.includes('password format error') ||
    combined.includes('string should have at least 6 characters') ||
    combined.includes('string should have at least 8 characters') ||
    (combined.includes('string should have at least') && combined.includes('characters'))
  );
}

/** Regenerate password and call provider again (do not surface to user). */
function isForgotPasswordRetryableError(err) {
  if (!err) return false;
  if (err.internalValidation === true) return false;
  if (err.retryable === true) return true;
  return isBotPasswordValidationError(err);
}

async function switchForgotPasswordToManualMode(game, gameUsername, userGameAccount, err, userId, storeCode) {
  await recordBotAutomationFailure({
    gameId: game.id,
    platformUserId: userId,
    storeCode: storeCode || game.addedByStoreCode,
    gameName: game.name,
    error: err,
    gameUsername: userGameAccount?.botUsername || gameUsername,
    operationType: 'forgot_password'
  }).catch(() => { });
  return {
    success: true,
    message: 'Password updated successfully.',
    status: 200,
    data: { username: userGameAccount?.botUsername || gameUsername },
  };
}

function isVblinkPasswordProviderError(err) {
  if (!err?.externalResponse || typeof err.externalResponse !== 'object') return false;
  const code = err.externalResponse.code ?? err.externalResponse.Code;
  return code === 8 || code === 9;
}

/** Generate sign for VBLink/UltraPanda: MD5(sorted key=value string + appSecret). */
function generateVblinkSign(data, appSecret) {
  const sortedKeys = Object.keys(data).sort();
  const queryString = sortedKeys.map((key) => `${key}=${data[key]}`).join('&');
  const finalString = queryString + appSecret;
  return crypto.createHash('md5').update(finalString, 'utf8').digest('hex');
}

/**
 * Find candidate games for a forgot-password request (case-insensitive, optional store scope).
 *
 * The store frontend receives the display name from getStoreGameDisplayName() (e.g. the stored
 * "GameVault2" is shown as "Game Vault", "Juwa 2.0 (Agent)" as "Juwa 2.0"), then sends that
 * display name back here. So an exact name match can miss agent games. We first try the exact
 * (indexed) match, then fall back to matching by store display name. Multiple stored games can
 * map to the same display name, so this returns every candidate and lets the caller pick the one
 * the user is actually registered on.
 *
 * @param {string} gameName - name as sent by the frontend (raw or display name)
 * @param {string|null} storeCode - when set, restrict to that store (uses added_by_store_code index)
 * @returns {Promise<Model[]>}
 */
async function findGameCandidates(gameName, storeCode) {
  const name = gameName.trim();
  if (!name) return [];
  const target = name.toLowerCase();
  const hasStore = storeCode != null && storeCode !== '';

  const exactWhere = {
    [Op.and]: [
      db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.col('name')),
        Op.eq,
        target
      )
    ]
  };
  if (hasStore) {
    exactWhere.addedByStoreCode = storeCode;
  }
  const exact = await db.Game.findAll({
    where: exactWhere,
    attributes: GAME_ATTRS
  });
  if (exact.length > 0) return exact;

  // Fallback: the frontend sent the store display name, which differs from the stored name for
  // agent games (e.g. "Game Vault" -> "GameVault2"). Scan the (store-scoped) games and match by
  // their display name. Without a store we only scan active games to keep this bounded.
  const scopeWhere = hasStore ? { addedByStoreCode: storeCode } : { isActive: true };
  const scoped = await db.Game.findAll({
    where: scopeWhere,
    attributes: GAME_ATTRS
  });
  return scoped.filter(
    (g) => getStoreGameDisplayName(g.name, g.gameKey).trim().toLowerCase() === target
  );
}

/**
 * Best-effort user-facing message from bot forgot-password JSON (various shapes).
 * @param {object|null|undefined} data
 * @returns {string}
 */
function extractForgotPasswordBotMessage(data) {
  if (!data || typeof data !== 'object') return '';
  const candidates = [
    data.message,
    data.detail,
    data.error,
    data.msg,
    data.description,
    data.reason,
    typeof data.data === 'object' && data.data != null ? data.data.message : null,
    typeof data.data === 'object' && data.data != null ? data.data.detail : null
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 500);
  }
  if (Array.isArray(data.errors)) {
    const joined = data.errors
      .map((e) => (typeof e === 'string' ? e : e && typeof e === 'object' ? e.message || e.msg || '' : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (joined) return joined.slice(0, 500);
  }
  return '';
}

/**
 * HTTP layer indicates upstream / proxy outage (manual-mode path). 2xx/3xx/4xx are not this.
 * @param {number} httpStatus
 * @returns {boolean}
 */
function isForgotPasswordHttpInfrastructureFailure(httpStatus) {
  const n = typeof httpStatus === 'number' && !Number.isNaN(httpStatus) ? httpStatus : 502;
  return n >= 500;
}

/**
 * Call the game bot's forgot-password API.
 * @param {string} baseUrl   - game.botApiUrl
 * @param {string} apiKey    - game.botApiKey
 * @param {string} gameName  - used for VegasX-specific request body
 * @param {string} username  - game username
 * @param {string} newPassword - new password to set
 */
async function callBotForgotPassword(baseUrl, apiKey, gameName, username, newPassword) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/forgot-password`;
  const preparedPassword = prepareForgotPasswordForBot(gameName, newPassword);

  const res = await axios.post(
    url,
    buildForgotPasswordBotRequestBody(gameName, username, preparedPassword),
    {
      headers: {
        accept: 'application/json',
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true
    }
  );

  console.log('response data', res.data);
  const data = res.data;

  if (res.status !== 200 || !data || data.success !== true) {
    const httpStatus = res.status;
    const infrastructureFailure = isForgotPasswordHttpInfrastructureFailure(httpStatus);
    const rawMsg = extractForgotPasswordBotMessage(data);
    const err = new Error(rawMsg || 'BOT_FORGOT_PASSWORD_FAILED');
    err.statusCode = infrastructureFailure ? 502 : 400;
    err.retryable = !infrastructureFailure;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  return data.message || 'Password reset successfully';
}

/**
 * Call VBLink/UltraPanda third-party API: POST {baseUrl}/fast/user/updatePasswd
 * Body: application/x-www-form-urlencoded with requestid, appid, timestamp, sign, account, passwd, new_passwd.
 * requestid = "UPD" + Date.now(); sign = MD5(sorted key=value string + appSecret).
 */
async function callVblinkUltrapandaUpdatePasswd(baseUrl, appId, appSecret, account, passwd, new_passwd) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/fast/user/updatePasswd`;
  const requestid = `UPD${Date.now()}`;
  const timestamp = Date.now().toString();

  const data = {
    requestid,
    appid: appId,
    timestamp,
    account,
    passwd,
    new_passwd
  };
  data.sign = generateVblinkSign(data, appSecret);

  const body = new URLSearchParams(data).toString();

  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log('response data', res.data);
  const response = res.data;
  const code = response && (response.code ?? response.Code);

  if (res.status !== 200) {
    const err = new Error('Password update failed. Please try again later.');
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = response;
    throw err;
  }

  if (code === 200) {
    return;
  }

  const codeMessages = {
    1: 'New user is created',
    2: 'User does not exist',
    3: 'Parameter error',
    4: 'Invalid signature',
    5: 'Agent ban',
    6: 'Account length error',
    7: 'Account format error',
    8: 'Password length error',
    9: 'Password format error',
    10: 'Request ID already used',
    11: 'Unknown database error',
    12: 'User already exist',
    13: 'Top up fail',
    14: 'Insufficient credit',
    15: 'Withdrawal failed',
    16: 'Get balance failed',
    17: 'Operations not allowed in the game',
    18: 'System under maintenance',
    19: 'Requested address does not exist',
    20: 'Password error',
    21: 'Agent name or password error',
    22: 'Platform not configured'
  };
  const message = codeMessages[code] || `Provider error (code ${code})`;
  const err = new Error(`Password update failed: ${message}`);
  err.statusCode = 502;
  err.externalResponse = response;
  throw err;
}

/**
 * Reset a game account password.
 *  1. Look up the game by name (and store when available) to get botApiUrl and botApiKey.
 *  2. Call the bot's /forgot-password endpoint.
 *  3. On success, update botPassword in user_game_accounts.
 *
 * @param {number} userId         - from JWT
 * @param {string} gameName       - game to target
 * @param {string} gameUsername   - username on the game platform
 * @param {string|null} storeCode - optional; when set, resolves game by name + store for scalable single-row lookups
 */
async function forgotGamePassword(userId, gameName, gameUsername, storeCode = null) {
  let game;
  let userGameAccount;

  // Resolve by name (or store display name) + store, then match the user's account among the
  // candidates. This tolerates the display-name transform applied when listing games to the store.
  const candidateGames = await findGameCandidates(gameName, storeCode);
  if (!candidateGames || candidateGames.length === 0) {
    const err = new Error('Game not found.');
    err.statusCode = 404;
    throw err;
  }
  const candidateIds = candidateGames.map((g) => g.id);
  userGameAccount = await db.UserGameAccount.findOne({
    where: { userId, gameId: { [Op.in]: candidateIds } }
  });
  if (!userGameAccount) {
    const err = new Error('You do not have a registered account for this game.');
    err.statusCode = 404;
    throw err;
  }
  game = candidateGames.find((g) => g.id === userGameAccount.gameId);

  if (!game.isActive) {
    const err = new Error('This game is currently inactive.');
    err.statusCode = 400;
    throw err;
  }

  const isVblinkUltrapanda = isVblinkOrUltrapanda(game.name);
  const isOrionStars = isOrionStarsTerminalGame(game) && !isOrionStarsBotAutomationGame(game);
  const isFirekirinAgent = isFirekirinTerminalGame(game) && !isFirekirinBotAutomationGame(game);
  const isMilkywayAgent = isMilkywayTerminalGame(game) && !isMilkywayBotAutomationGame(game);
  const isGameroomAgent = isGameroomAgentGame(game) && !isGameroomBotAutomationGame(game);
  const isCashmachineAgent = isCashmachineAgentGame(game) && !isCashmachineBotAutomationGame(game);
  const isMafiaAgent = isMafiaAgentGame(game);
  const isVegasXCashier = isVegasXCashierGame(game);
  // Terminal agent keys (e.g. "orionstarsagent", "firekirinagent", "gameroomagent") also end in "agent"; exclude them and
  // VegasX so only true agent-credential games (GameVault2, Juwa 2.0 Agent) take this path.
  const isAgentApi = isAgentApiGame(game) && !isOrionStars && !isFirekirinAgent && !isMilkywayAgent && !isVegasXCashier && !isGameroomAgent && !isCashmachineAgent && !isMafiaAgent;
  if (isAgentApi) {
    // Agent-credential games (GameVault2, Juwa 2.0 Agent) reset the player password via the
    // signed external API (POST /api/external/resetPassword). Needs agent credentials plus the
    // player's provider user id (resolved from the game username when missing).
    if (!game.agentId || !game.apiSecretKey) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
    if (!userGameAccount.providerUserId && !userGameAccount.botUsername) {
      const err = new Error('Your game account is missing provider ID. Please register the game account again.');
      err.statusCode = 400;
      throw err;
    }
  } else if (isOrionStars || isFirekirinAgent || isMilkywayAgent) {
    // Terminal agent games change the player password via the signed agent API
    // (agentLogin + action=changePasswd), which needs the store agent credentials and the
    // player's current password (sent as MD5).
    if (!game.botUsername || !game.botPassword) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
    if (!userGameAccount.botUsername || !userGameAccount.botPassword) {
      const err = new Error('Your game account does not have stored credentials. Please contact support.');
      err.statusCode = 400;
      throw err;
    }
  } else if (isVegasXCashier) {
    // VegasX cashier games reset the player password via the cashier API
    // (POST /cashier/user/update/{providerUserId}/password), which needs the store cashier
    // login credentials plus the player's provider user id.
    if (!game.botUsername || !game.botPassword) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
    if (!userGameAccount.providerUserId) {
      const err = new Error('Your game account is missing provider ID. Please register the game account again.');
      err.statusCode = 400;
      throw err;
    }
  } else if (isGameroomAgent) {
    // Official Gameroom Agent API has no player password-reset endpoint.
    const err = new Error('Password reset is not available for Gameroom Agent. Please contact your store admin.');
    err.statusCode = 400;
    throw err;
  } else if (isCashmachineAgent) {
    // Official Cashmachine Agent API has no player password-reset endpoint.
    const err = new Error('Password reset is not available for CashMachine777 Agent. Please contact your store admin.');
    err.statusCode = 400;
    throw err;
  } else if (isMafiaAgent) {
    // Official Mafia Agent API has no player password-reset endpoint.
    const err = new Error('Password reset is not available for Mafia Agent. Please contact your store admin.');
    err.statusCode = 400;
    throw err;
  } else if (isVblinkUltrapanda) {
    if (!game.botApiUrl || !game.appId || !game.appSecret) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
    if (!userGameAccount.botPassword) {
      const err = new Error('Your game account does not have a stored password. Please contact support.');
      err.statusCode = 400;
      throw err;
    }
  } else {
    if (!game.botApiUrl || !game.botApiKey) {
      const err = new Error('Game is not configured. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  }

  if (game.botOffline) {
    return {
      success: true,
      message: GAME_PASSWORD_PENDING,
      status: 200,
      data: { username: gameUsername }
    };
  }

  try {
    let message;
    let trimmedNewPassword;
    const passwordGameName = game.name || gameName;
    const botUsername = resolveForgotPasswordUsername(userGameAccount, gameUsername);
    const passwordLogContext = buildBotLogContext({
      game,
      operation: 'password_reset',
      storeCode,
      gameUsername: botUsername,
      apiEndpoint: isAgentApi
        ? '/api/external/resetPassword'
        : ((isOrionStars || isFirekirinAgent || isMilkywayAgent)
          ? '/ws/service.ashx?action=changePasswd'
          : (isVegasXCashier
            ? '/cashier/user/update/{id}/password'
            : (isVblinkUltrapanda ? '/fast/user/update_passwd' : '/forgot-password')))
    });

    if (isAgentApi) {
      const agentId = String(game.agentId || '').trim();
      const apiSecretKey = String(game.apiSecretKey || '').trim();
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
        trimmedNewPassword = generateGameVaultPassword();
        try {
          await withBotRetry(
            () => withGameVaultProviderUserIdRetry({
              game,
              userGameAccount,
              agentId,
              apiSecretKey,
              transaction: undefined,
              operation: (providerUserId) => callGameVaultResetPassword(
                game,
                agentId,
                apiSecretKey,
                providerUserId,
                trimmedNewPassword
              )
            }),
            { logContext: passwordLogContext }
          );
          message = 'Password updated successfully.';
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (
            attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 &&
            (err.isPasswordValidationError || isForgotPasswordRetryableError(err) || isBotApiFailure(err))
          ) {
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        return switchForgotPasswordToManualMode(
          game,
          gameUsername,
          userGameAccount,
          lastErr,
          userId,
          storeCode
        );
      }
    } else if (isOrionStars) {
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
        trimmedNewPassword = generateOrionStarsPassword();
        try {
          await withBotRetry(
            () => changeOrionStarsUserPasswordWithAgentLogin(
              game,
              userGameAccount.botUsername,
              userGameAccount.botPassword,
              trimmedNewPassword
            ),
            { logContext: passwordLogContext }
          );
          message = 'Password updated successfully.';
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (
            attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 &&
            (isForgotPasswordRetryableError(err) || isBotApiFailure(err))
          ) {
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        return switchForgotPasswordToManualMode(
          game,
          gameUsername,
          userGameAccount,
          lastErr,
          userId,
          storeCode
        );
      }
    } else if (isFirekirinAgent) {
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
        trimmedNewPassword = generateFirekirinPassword();
        try {
          await withBotRetry(
            () => changeFirekirinUserPasswordWithAgentLogin(
              game,
              userGameAccount.botUsername,
              userGameAccount.botPassword,
              trimmedNewPassword
            ),
            { logContext: passwordLogContext }
          );
          message = 'Password updated successfully.';
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (
            attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 &&
            (isForgotPasswordRetryableError(err) || isBotApiFailure(err))
          ) {
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        return switchForgotPasswordToManualMode(
          game,
          gameUsername,
          userGameAccount,
          lastErr,
          userId,
          storeCode
        );
      }
    } else if (isMilkywayAgent) {
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
        trimmedNewPassword = generateMilkywayPassword();
        try {
          await withBotRetry(
            () => changeMilkywayUserPasswordWithAgentLogin(
              game,
              userGameAccount.botUsername,
              userGameAccount.botPassword,
              trimmedNewPassword
            ),
            { logContext: passwordLogContext }
          );
          message = 'Password updated successfully.';
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (
            attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 &&
            (isForgotPasswordRetryableError(err) || isBotApiFailure(err))
          ) {
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        return switchForgotPasswordToManualMode(
          game,
          gameUsername,
          userGameAccount,
          lastErr,
          userId,
          storeCode
        );
      }
    } else if (isVegasXCashier) {
      const providerUserId = userGameAccount.providerUserId != null
        ? String(userGameAccount.providerUserId).trim()
        : '';
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
        trimmedNewPassword = generateVegasXPassword();
        try {
          await withBotRetry(
            () => withVegasXCashierTokenRetry(game, (token) =>
              callVegasXCashierUpdatePassword(game, token, providerUserId, trimmedNewPassword)
            ),
            { logContext: passwordLogContext }
          );
          message = 'Password updated successfully.';
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (
            attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 &&
            (err.isPasswordValidationError || isForgotPasswordRetryableError(err) || isBotApiFailure(err))
          ) {
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        return switchForgotPasswordToManualMode(
          game,
          gameUsername,
          userGameAccount,
          lastErr,
          userId,
          storeCode
        );
      }
    } else if (isVblinkUltrapanda) {
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
        trimmedNewPassword = generateNewGamePassword(passwordGameName);
        try {
          await withBotRetry(
            () => callVblinkUltrapandaUpdatePasswd(
              game.botApiUrl,
              game.appId,
              game.appSecret,
              userGameAccount.botUsername,
              userGameAccount.botPassword,
              trimmedNewPassword
            ),
            { logContext: passwordLogContext }
          );
          message = 'Password updated successfully.';
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (
            attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 &&
            (isVblinkPasswordProviderError(err) || isForgotPasswordRetryableError(err))
          ) {
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        return switchForgotPasswordToManualMode(
          game,
          gameUsername,
          userGameAccount,
          lastErr,
          userId,
          storeCode
        );
      }
    } else {
      const onInvalidApiKey = async () => {
        const r = await refreshGameBotApiKey(game.id);
        game.botApiKey = r.api_key;
      };
      let lastErr = null;
      for (let attempt = 0; attempt < MAX_RESET_PASSWORD_ATTEMPTS; attempt += 1) {
        trimmedNewPassword = generateNewGamePassword(passwordGameName);
        try {
          message = await withBotRetry(
            () =>
              callBotForgotPassword(
                game.botApiUrl,
                game.botApiKey,
                passwordGameName,
                botUsername,
                trimmedNewPassword
              ),
            { onInvalidApiKey, logContext: passwordLogContext }
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 && isForgotPasswordRetryableError(err)) {
            continue;
          }
          if (attempt < MAX_RESET_PASSWORD_ATTEMPTS - 1 && isBotApiFailure(err)) {
            continue;
          }
          break;
        }
      }
      if (lastErr) {
        if (isBotPasswordValidationError(lastErr)) {
          throw lastErr;
        }
        if (isBotApiFailure(lastErr) || isForgotPasswordRetryableError(lastErr)) {
          return switchForgotPasswordToManualMode(
            game,
            gameUsername,
            userGameAccount,
            lastErr,
            userId,
            storeCode
          );
        }
        throw lastErr;
      }
    }

    await userGameAccount.update({ botPassword: trimmedNewPassword });

    return {
      success: true,
      message,
      status: 200,
      data: {
        username: userGameAccount.botUsername,
        new_password: trimmedNewPassword
      }
    };
  } catch (err) {
    if (err.internalValidation) {
      throw err;
    }
    if (isBotApiFailure(err) || isForgotPasswordRetryableError(err)) {
      return switchForgotPasswordToManualMode(
        game,
        gameUsername,
        userGameAccount,
        err,
        userId,
        storeCode
      );
    }
    throw err;
  }
}

module.exports = {
  forgotGamePassword,
  MIN_NEW_GAME_PASSWORD_LENGTH,
  assertValidNewGamePassword,
  generateNewGamePassword,
};
