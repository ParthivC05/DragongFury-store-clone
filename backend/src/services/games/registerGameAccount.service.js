'use strict';

const axios = require('axios');
const crypto = require('crypto');
const db = require('../../db/models');
const { Op } = require('sequelize');
const { withBotRetry, isBotApiFailure, captureBotApiResponse } = require('../../utils/botApiHelper');
const { recordBotAutomationFailure } = require('./recordBotAutomationFailure.service');
const { notifyAdminsManualRequestQueued } = require('./notifyManualRequestQueued.service');
const { refreshGameBotApiKey } = require('./addGame.service');
const {
  isGoldenDragonGame,
  isGoldenDragonAutomationReady,
  generateGoldenDragonDriversLicense,
  callGoldenDragonCreateUser,
  callGoldenDragonSearchUser
} = require('./goldenDragon.helpers');
const { isJuwaNewBotAutomationReady } = require('./juwa.helpers');
const { isPandamasterFamilyGame, isPandamasterNewBotAutomationReady } = require('./pandamaster.helpers');
const {
  isGameVaultGame,
  generateGameVaultPassword,
  callGameVaultAddUser,
  fetchGameVaultProviderUserId
} = require('./gamevault.helpers');
const {
  isVegasXGame,
  sanitizeVegasXUsername,
  createAlternateVegasXUsername,
  generateVegasXPassword,
  buildVegasXDisplayName,
  callVegasXCashierCreate,
  withVegasXCashierTokenRetry
} = require('./vegasx.helpers');
const {
  isOrionStarsTerminalGame,
  generateOrionStarsPassword,
  registerOrionStarsUser
} = require('./orionstars.helpers');
const {
  isFirekirinTerminalGame,
  generateFirekirinPassword,
  registerFirekirinUser
} = require('./firekirin.helpers');
const {
  isMilkywayTerminalGame,
  generateMilkywayPassword,
  registerMilkywayUser
} = require('./milkyway.helpers');
const {
  isGameroomAgentGame,
  generateGameroomPassword,
  registerGameroomUser
} = require('./gameroom.helpers');
const {
  isCashmachineAgentGame,
  generateCashmachinePassword,
  registerCashmachineUser
} = require('./cashmachine.helpers');
const {
  isMafiaAgentGame,
  generateMafiaPassword,
  registerMafiaUser
} = require('./mafia.helpers');
const {
  isOrionStarsBotAutomationGame,
  isFirekirinBotAutomationGame,
  isMilkywayBotAutomationGame,
  isGameroomBotAutomationGame,
  isCashmachineBotAutomationGame,
  getStoreGameDisplayName
} = require('../../utils/gameIntegration.helpers');
const {
  assertGameUsernameAvailable,
  rethrowGameUsernameConflict
} = require('./assertGameUsernameAvailable.service');
const { GAME_REGISTER_PENDING } = require('../../constants/gameUserFacingMessages');

const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { buildBotLogContext } = require('../../utils/botLogContext.helpers');
const {
  isAlphanumeric5To20UsernameGame,
  isAlphanumeric6To20UsernameGame,
  isShortUnderscoreUsernameGame,
  usesStrictRegisterUsernameRules,
  isVegasXUsernameGame,
  assertValidGameUsername,
  isValidGameUsername,
  stripAlphanumericUsername,
  MIN_ALPHANUMERIC_5_20_LENGTH,
  MAX_ALPHANUMERIC_5_20_LENGTH,
  MIN_ALPHANUMERIC_6_20_LENGTH,
  MAX_ALPHANUMERIC_6_20_LENGTH,
  MAX_SHORT_UNDERSCORE_LENGTH,
  MIN_VBLINK_FAMILY_LENGTH,
  MAX_VBLINK_FAMILY_LENGTH,
} = require('../../utils/gameUsernameValidation.helpers');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const VEGASX_GAME_NAME = 'VegasX';
const MAX_RETRY_ALTERNATE_USERNAME = 5;
const MAX_RETRY_PASSWORD_VALIDATION = 5; // retry third-party create-user when bot returns password format/length error
const MAX_RETRY_ACCOUNT_NAME_LENGTH = 3;
const MIN_GAME_USERNAME_LENGTH = 6;
const MAX_GAME_USERNAME_LENGTH = 20;
/** Minimum account_name length for standard bot POST /create-user (all games using that path). */
const MIN_BOT_CREATE_USER_ACCOUNT_LENGTH = MIN_GAME_USERNAME_LENGTH;
const MIN_PANDAMASTER_NICKNAME_LENGTH = MIN_BOT_CREATE_USER_ACCOUNT_LENGTH;

/** Game names that use third-party fast/user/create API (VBLink / UltraPanda / Egame99). */
const VBLINK_ULTRAPANDA_NAMES = ['Vblink', 'UltraPanda', 'Egame99'];
const VBLINK_ACCOUNT_MIN = MIN_VBLINK_FAMILY_LENGTH;
const VBLINK_ACCOUNT_MAX = MAX_VBLINK_FAMILY_LENGTH;
const VBLINK_PASSWORD_MIN = 6;
const VBLINK_PASSWORD_MAX = 16;
const VBLINK_ALLOWED_SYMBOLS = '!@#$()%^/.,';

/**
 * Returns true if the game uses VBLink/UltraPanda third-party create-user API.
 */
function isVblinkOrUltrapanda(gameName) {
  const name = String(gameName || '').trim();
  return VBLINK_ULTRAPANDA_NAMES.some((n) => n.toLowerCase() === name.toLowerCase());
}

/**
 * Sanitize account for VBLink/UltraPanda/Egame99: 7–16 characters, letters and numbers only.
 */
function sanitizeVblinkAccount(username) {
  const base = stripAlphanumericUsername(username) || 'user';
  let result = base.length > VBLINK_ACCOUNT_MAX ? base.slice(0, VBLINK_ACCOUNT_MAX) : base;
  if (!/^[a-zA-Z]/.test(result)) {
    const fallback = String(result || '').slice(0, VBLINK_ACCOUNT_MAX - 1);
    result = `u${fallback}`;
  }
  if (result.length < VBLINK_ACCOUNT_MIN) {
    const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, VBLINK_ACCOUNT_MIN - result.length);
    result = (result + suffix).slice(0, VBLINK_ACCOUNT_MAX);
  }
  return result;
}

/**
 * Create an alternate account name for VBLink/UltraPanda (e.g. when user already exists).
 */
function createAlternateVblinkAccount(baseAccount) {
  const safe = String(baseAccount || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, VBLINK_ACCOUNT_MAX - 4) || 'user';
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 4);
  return sanitizeVblinkAccount(safe + suffix);
}

/**
 * Force a VBLink account to start with a letter.
 */
function ensureVblinkAccountStartsWithLetter(account) {
  const sanitized = sanitizeVblinkAccount(account);
  if (/^[a-zA-Z]/.test(sanitized)) return sanitized;
  const fallback = sanitized.slice(0, VBLINK_ACCOUNT_MAX - 1);
  return sanitizeVblinkAccount(`u${fallback}`);
}

/**
 * Generate a password for VBLink/UltraPanda: 6–16 chars, must include letters and numbers; allowed symbols !@#$()%^/.,
 */
function generateVblinkPassword() {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const symbols = VBLINK_ALLOWED_SYMBOLS;
  const len = VBLINK_PASSWORD_MIN + Math.floor(Math.random() * (VBLINK_PASSWORD_MAX - VBLINK_PASSWORD_MIN + 1));
  let pass = '';
  pass += letters[Math.floor(Math.random() * letters.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  for (let i = pass.length; i < len; i++) {
    const set = [letters, numbers, symbols][Math.floor(Math.random() * 3)];
    pass += set[Math.floor(Math.random() * set.length)];
  }
  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Generate unique request ID (up to 64 alphanumeric characters).
 */
function generateRequestId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate sign for VBLink/UltraPanda: MD5(sorted key=value string + appSecret).
 */
function generateVblinkSign(data, appSecret) {
  const sortedKeys = Object.keys(data).sort();
  const queryString = sortedKeys.map((key) => `${key}=${data[key]}`).join('&');
  const finalString = queryString + appSecret;
  return crypto.createHash('md5').update(finalString, 'utf8').digest('hex');
}

/**
 * Returns true if the bot's error message indicates the user/account already exists.
 */
function isUserAlreadyExistsError(message) {
  if (!message || typeof message !== 'string') return false;
  const lower = message.toLowerCase();
  return (
    lower.includes('already exists') ||
    lower.includes('user already exists') ||
    lower.includes('account already exists') ||
    lower.includes('already registered') ||
    lower.includes('login name have used')
  );
}

/**
 * Returns true if the bot's error indicates password format/length validation
 * (e.g. "Password can only be letters and numbers, and must be between 6 and 12 characters").
 * Used to retry the third-party API instead of switching to manual.
 */
function isBotPasswordValidationError(err) {
  if (!err) return false;
  const message = (err.message || '').toString();
  const external = err.externalResponse && typeof err.externalResponse === 'object'
    ? String(err.externalResponse.message || err.externalResponse.detail || err.externalResponse.error || '').toLowerCase()
    : '';
  const combined = (message + ' ' + external).toLowerCase();
  return (
    combined.includes('password can only be letters and numbers') ||
    (combined.includes('password') && combined.includes('6 and 12 characters')) ||
    (combined.includes('password') && combined.includes('letters and numbers') && combined.includes('between')) ||
    (combined.includes('password') && combined.includes('uppercase') && combined.includes('lowercase')) ||
    (combined.includes('password') && combined.includes('special')) ||
    combined.includes('string should have at least 6 characters') ||
    (combined.includes('string should have at least') && combined.includes('characters'))
  );
}

/**
 * Returns true if the game bot rejected account_name / nickname length (not only PandaMaster).
 * Example: "The length of nickname is 6-32 bits", "account length error".
 */
function isBotAccountNameLengthError(err) {
  if (!err) return false;
  const message = (err.message || '').toString().toLowerCase();
  const external = err.externalResponse && typeof err.externalResponse === 'object'
    ? String(err.externalResponse.message || err.externalResponse.detail || err.externalResponse.error || '').toLowerCase()
    : '';
  const combined = `${message} ${external}`;
  return (
    combined.includes('length of nickname is 6-32 bits') ||
    (combined.includes('nickname') && combined.includes('6-32') && combined.includes('length')) ||
    combined.includes('account length error') ||
    (
      combined.includes('length') &&
      (combined.includes('account') || combined.includes('username') || combined.includes('nickname')) &&
      (combined.includes('at least') || combined.includes('between') || combined.includes('too short'))
    )
  );
}

/**
 * Build a PandaMaster retry username by extending the current username.
 * - Keeps existing username when possible
 * - Appends random alphanumeric chars until nickname is at least 6 chars
 * - Ensures nickname is not entirely numeric
 */
function generatePandaMasterRetryUsername(baseUsername) {
  const randomPool = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = sanitizeGameUsername(baseUsername, 'pandamaster');

  if (!result) {
    result = 'u';
  }

  while (result.length < MIN_PANDAMASTER_NICKNAME_LENGTH) {
    result += randomPool[Math.floor(Math.random() * randomPool.length)];
  }

  // Provider rejects short nicknames, and all-digit nicknames are not preferred here.
  if (/^\d+$/.test(result)) {
    result = `u${result}`;
  }

  return sanitizeGameUsername(result, 'pandamaster');
}

/**
 * Generate a fresh PandaMaster retry nickname each attempt.
 */
function createAlternatePandaMasterRetryUsername(baseUsername) {
  const seed = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 3);
  return generatePandaMasterRetryUsername(`${baseUsername}${seed}`);
}

/**
 * Returns true if provider says nickname length is invalid.
 */
function isPandaMasterGame(gameName, gameKey = null) {
  return isPandamasterFamilyGame(gameName, gameKey);
}

/**
 * Normalize initial username for PandaMaster create-user.
 */
function normalizePandaMasterUsername(username) {
  let result = sanitizeGameUsername(username, 'pandamaster');
  if (result.length < MIN_PANDAMASTER_NICKNAME_LENGTH) {
    result = generatePandaMasterRetryUsername(result);
  }
  if (/^\d+$/.test(result)) {
    result = `u${result}`;
  }
  return sanitizeGameUsername(result, 'pandamaster');
}

/**
 * Final guard for standard bot /create-user: never send a short account_name (PandaMaster uses {@link normalizePandaMasterUsername}).
 */
function ensureMinLengthForBotCreateUser(accountName, gameName) {
  const s = String(accountName || '').trim();
  if (s.length >= MIN_BOT_CREATE_USER_ACCOUNT_LENGTH) {
    return ensureGameUsernameStartsWithLetter(s, gameName);
  }
  return sanitizeGameUsername(s || 'user', gameName);
}

/**
 * Returns true if provider says account must start with a letter.
 */
function isAccountMustStartWithLetterError(err) {
  if (!err) return false;
  const message = (err.message || '').toString().toLowerCase();
  const external = err.externalResponse && typeof err.externalResponse === 'object'
    ? String(err.externalResponse.message || err.externalResponse.detail || err.externalResponse.error || '').toLowerCase()
    : '';
  const combined = `${message} ${external}`;
  return (
    combined.includes('account must start with a letter') ||
    (combined.includes('start with') && combined.includes('letter'))
  );
}

/**
 * Max account_name length for standard bot /create-user (Juwa-style games use 13).
 */
function maxBotDerivedGameUsernameLength(gameName) {
  return isShortUnderscoreUsernameGame(gameName) ? MAX_SHORT_UNDERSCORE_LENGTH : MAX_GAME_USERNAME_LENGTH;
}

/**
 * Third-party create-user APIs require the account to start with a letter.
 * If the username starts with a digit or underscore, prefix "u" and trim to game max length, then pad to min if needed.
 */
function ensureGameUsernameStartsWithLetter(username, gameName) {
  let s = String(username || '').trim();
  if (!s) s = 'user';
  if (/^[a-zA-Z]/.test(s)) return s;
  const maxLen = maxBotDerivedGameUsernameLength(gameName);
  let out = (`u${s}`).slice(0, maxLen);
  const randomPool = 'abcdefghijklmnopqrstuvwxyz0123456789';
  while (out.length < MIN_BOT_CREATE_USER_ACCOUNT_LENGTH && out.length < maxLen) {
    out += randomPool[Math.floor(Math.random() * randomPool.length)];
  }
  if (out.length < MIN_BOT_CREATE_USER_ACCOUNT_LENGTH) {
    out = (out + 'x'.repeat(MIN_BOT_CREATE_USER_ACCOUNT_LENGTH)).slice(0, maxLen);
  }
  return out;
}

/**
 * Sanitize username for CashMachine777: 6–20 characters, letters and numbers only.
 */
function sanitizeAlphanumeric6To20Username(username) {
  const randomPool = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const base = stripAlphanumericUsername(username) || 'user';
  let result = base;
  while (result.length < MIN_ALPHANUMERIC_6_20_LENGTH) {
    result += randomPool[Math.floor(Math.random() * randomPool.length)];
  }
  if (result.length > MAX_ALPHANUMERIC_6_20_LENGTH) {
    result = result.slice(0, MAX_ALPHANUMERIC_6_20_LENGTH);
  }
  return result;
}

/**
 * Sanitize username for game APIs based on provider requirements.
 * @param {string} username - raw username
 * @param {string} gameName - name of the game
 * @returns {string} valid game username
 */
function sanitizeGameUsername(username, gameName) {
  if (isAlphanumeric6To20UsernameGame(gameName)) {
    return sanitizeAlphanumeric6To20Username(username);
  }
  if (isShortUnderscoreUsernameGame(gameName)) {
    const randomPool = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const base = stripAlphanumericUsername(username) || 'user';
    let result = base;
    if (result.length > MAX_SHORT_UNDERSCORE_LENGTH) {
      result = result.slice(0, MAX_SHORT_UNDERSCORE_LENGTH);
    }
    while (result.length < MIN_BOT_CREATE_USER_ACCOUNT_LENGTH && result.length < MAX_SHORT_UNDERSCORE_LENGTH) {
      result += randomPool[Math.floor(Math.random() * randomPool.length)];
    }
    if (isPandaMasterGame(gameName) && /^\d+$/.test(result)) {
      result = `u${result}`;
      result = result.length > MAX_SHORT_UNDERSCORE_LENGTH ? result.slice(0, MAX_SHORT_UNDERSCORE_LENGTH) : result;
    }
    return ensureGameUsernameStartsWithLetter(result, gameName);
  } else if (isAlphanumeric5To20UsernameGame(gameName)) {
    const base = stripAlphanumericUsername(username) || 'user';
    let result = base;
    if (result.length < MIN_ALPHANUMERIC_5_20_LENGTH) {
      const need = MIN_ALPHANUMERIC_5_20_LENGTH - result.length;
      const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, need);
      result = result + suffix;
      if (result.length < MIN_ALPHANUMERIC_5_20_LENGTH) {
        result = result + '0'.repeat(MIN_ALPHANUMERIC_5_20_LENGTH - result.length);
      }
    }
    if (result.length > MAX_ALPHANUMERIC_5_20_LENGTH) {
      result = result.slice(0, MAX_ALPHANUMERIC_5_20_LENGTH);
    }
    return ensureGameUsernameStartsWithLetter(result, gameName);
  }

  // Default fallback (6-20 alphanumeric)
  const base = stripAlphanumericUsername(username) || 'user';
  let result = base;
  if (result.length < MIN_GAME_USERNAME_LENGTH) {
    const need = MIN_GAME_USERNAME_LENGTH - result.length;
    const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, need);
    result = result + suffix;
    if (result.length < MIN_GAME_USERNAME_LENGTH) {
      result = result + '0'.repeat(MIN_GAME_USERNAME_LENGTH - result.length);
    }
  }
  if (result.length > MAX_GAME_USERNAME_LENGTH) {
    result = result.slice(0, MAX_GAME_USERNAME_LENGTH);
  }
  return ensureGameUsernameStartsWithLetter(result, gameName);
}

/** Default bot games: 6–20 chars, letters/numbers, must start with a letter. */
function isDefaultBotGameUsername(str) {
  return typeof str === 'string' && /^[a-zA-Z][a-zA-Z0-9]{5,19}$/.test(str.trim());
}

/**
 * Resolve the username sent to the provider after optional validation.
 * Strict-rule games sanitize when the platform username does not meet provider rules.
 */
function resolveRegisterUsername(trimmedUsername, gameName) {
  if (isVegasXUsernameGame(gameName)) {
    const cleaned = sanitizeVegasXUsername(trimmedUsername);
    return isValidGameUsername(cleaned, gameName) ? cleaned : sanitizeVegasXUsername(cleaned);
  }

  const cleaned = stripAlphanumericUsername(trimmedUsername) || 'user';
  if (usesStrictRegisterUsernameRules(gameName)) {
    const minAcceptedLength = isAlphanumeric6To20UsernameGame(gameName)
      ? MIN_ALPHANUMERIC_6_20_LENGTH
      : MIN_BOT_CREATE_USER_ACCOUNT_LENGTH;
    let candidate = isValidGameUsername(cleaned, gameName)
      && cleaned.length >= minAcceptedLength
      ? cleaned
      : sanitizeGameUsername(cleaned, gameName);
    if (isPandaMasterGame(gameName)) {
      candidate = normalizePandaMasterUsername(candidate);
    }
    if (!isValidGameUsername(candidate, gameName)) {
      candidate = sanitizeGameUsername(candidate, gameName);
    }
    return candidate;
  }

  const baseGameUsername = ensureGameUsernameStartsWithLetter(
    isDefaultBotGameUsername(cleaned) ? cleaned : sanitizeGameUsername(cleaned, gameName),
    gameName
  );
  return isPandaMasterGame(gameName)
    ? normalizePandaMasterUsername(baseGameUsername)
    : ensureMinLengthForBotCreateUser(baseGameUsername, gameName);
}

/**
 * Generate a short alternate username from the original based on provider requirements.
 */
function createAlternateUsername(baseUsername, gameName) {
  if (isVegasXUsernameGame(gameName)) {
    return createAlternateVegasXUsername(baseUsername);
  }

  if (isShortUnderscoreUsernameGame(gameName)) {
    const safe = stripAlphanumericUsername(baseUsername) || 'user';
    const prefix = safe.slice(0, 9);
    const suffix = Math.random().toString(36).slice(2, 6);
    return sanitizeGameUsername(prefix + suffix, gameName);
  }

  const maxPrefixLen = isAlphanumeric6To20UsernameGame(gameName)
    ? MAX_ALPHANUMERIC_6_20_LENGTH - 4
    : 16;
  const safe = stripAlphanumericUsername(baseUsername) || 'user';
  const prefix = safe.slice(0, maxPrefixLen);
  const suffix = Math.random().toString(36).slice(2, 6);
  return sanitizeGameUsername(prefix + suffix, gameName);
}

/**
 * Find a game by numeric ID or by name (case-insensitive).
 * Supports both the new RESTful routes (pass game.id) and legacy routes (pass gameName string).
 */
async function findGame(gameId) {
  const attrs = [
    'id', 'name', 'gameKey', 'gameTemplateId', 'botApiUrl', 'botApiKey', 'streamlitToken', 'botUsername', 'botPassword',
    'isActive', 'botOffline', 'appId', 'appSecret', 'agentId', 'apiSecretKey'
  ];
  if (!isNaN(gameId) && Number(gameId) > 0) {
    const game = await db.Game.findByPk(Number(gameId), { attributes: attrs });
    if (game) return game;
  }
  if (typeof gameId === 'string' && gameId.trim()) {
    return db.Game.findOne({
      where: db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.col('name')),
        Op.eq,
        gameId.trim().toLowerCase()
      ),
      attributes: attrs
    });
  }
  return null;
}

/**
 * Build Golden Dragon create-user body. Names come from the user profile; mail prefers JWT email when provided.
 */
async function buildGoldenDragonProfile(userId, authContext = {}) {
  const u = await db.User.findByPk(userId, {
    attributes: ['firstName', 'lastName', 'email', 'phone', 'dateOfBirth']
  });
  if (!u) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  const mailFromToken = authContext.email != null && String(authContext.email).trim()
    ? String(authContext.email).trim()
    : null;
  const mail = mailFromToken || (u.email || '').trim();
  let birthday = '';
  if (u.dateOfBirth) {
    const d = u.dateOfBirth instanceof Date ? u.dateOfBirth : new Date(u.dateOfBirth);
    if (!isNaN(d.getTime())) birthday = d.toISOString().slice(0, 10);
  }
  return {
    drivers_license: generateGoldenDragonDriversLicense(userId),
    first_name: (u.firstName || '').trim(),
    last_name: (u.lastName || '').trim(),
    birthday,
    gender: 1,
    phone: (u.phone || '').trim(),
    mail,
    pin_user_id: ''
  };
}

/**
 * Call the game bot's create-user API.
 * VegasX only needs { account_name }; other bots also need { money: 0 }.
 */
async function callBotCreateUser(baseUrl, apiKey, accountName, gameName) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/create-user`;
  const safeAccountName = stripAlphanumericUsername(accountName) || 'user';
  const isVegasX = String(gameName || '').trim().toLowerCase() === VEGASX_GAME_NAME.toLowerCase();
  const body = isVegasX ? { account_name: safeAccountName } : { account_name: safeAccountName, money: 0 };

  const res = await axios.post(url, body, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log('response data', res.data);
  const data = res.data;
  const isSuccessStatus = res.status >= 200 && res.status < 300;
  if (!isSuccessStatus || !data || data.success !== true) {
    const botMessage = (data?.message || data?.detail || '').toString();
    const userMessage = botMessage
      ? `Could not create your game account: ${botMessage}`
      : 'Could not create your game account at this time. Please try again later.';
    const err = new Error(userMessage);
    err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    err.isUserAlreadyExists = isUserAlreadyExistsError(botMessage);
    throw err;
  }

  const payload = (data && data.data) || data;
  if (!payload.account_name || !(payload.password || payload.account_id)) {
    const err = new Error('Failed to create game account. Please try again later.');
    err.statusCode = 502;
    throw err;
  }

  return { account_name: payload.account_name, password: payload.password || payload.account_id };
}

/**
 * Call VBLink/UltraPanda third-party API: POST {baseUrl}/fast/user/create
 * Body: application/x-www-form-urlencoded with requestid, appid, timestamp, sign, account, passwd.
 * Sign = MD5(sorted key=value string + appSecret).
 */
async function callVblinkUltrapandaCreateUser(baseUrl, appId, appSecret, account, passwd) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/fast/user/create`;
  const safeAccount = sanitizeVblinkAccount(account);
  const requestid = generateRequestId();
  const timestamp = Date.now().toString();

  const data = {
    requestid,
    appid: appId,
    timestamp,
    account: safeAccount,
    passwd
  };
  data.sign = generateVblinkSign(data, appSecret);

  const body = new URLSearchParams(data).toString();

  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  console.log('res', res);
  const response = res.data;
  const code = response && (response.code ?? response.Code);
  const responseData = response && (response.data || response.Data);

  if (res.status !== 200) {
    const err = new Error('Could not create your game account. Please try again later.');
    err.statusCode = res.status >= 400 ? res.status : 502;
    err.externalResponse = response;
    throw err;
  }

  if (code === 1) {
    const full_account = (responseData && responseData.full_account) || safeAccount;
    return { account_name: full_account, password: passwd };
  }

  if (code === 12) {
    const err = new Error('User already exists');
    err.statusCode = 409;
    err.isUserAlreadyExists = true;
    err.externalResponse = response;
    throw err;
  }

  const codeMessages = {
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
  const err = new Error(`Could not create your game account: ${message}`);
  err.statusCode = 502;
  err.externalResponse = response;
  throw err;
}

/**
 * Register a game account for a user.
 *
 * - If the game's bot is online: calls the bot API directly and saves credentials.
 * - If the game's bot is offline: creates a manual request for the store partner / admin to handle.
 *
 * @param {number} userId
 * @param {string} username - used as the bot account name
 * @param {number|string} gameId - game primary key or game name (legacy routes)
 * @param {{ email?: string }} [authContext] - JWT claims: email used for Golden Dragon create-user when set
 */
async function registerGameAccount(userId, username, gameId, authContext = {}) {
  const game = await findGame(gameId);

  if (!game) {
    const err = new Error('Game not found.');
    err.statusCode = 404;
    throw err;
  }

  username = isVegasXGame(game)
    ? sanitizeVegasXUsername(username)
    : (stripAlphanumericUsername(username) || 'user');

  if (!game.isActive) {
    const err = new Error('This game is currently unavailable. Please try again later.');
    err.statusCode = 400;
    throw err;
  }

  // Check if the user already has an account for this game
  const existing = await db.UserGameAccount.findOne({ where: { userId, gameId: game.id } });
  if (existing) {
    // If they have an active account, return their credentials
    if ((existing.status === 'active' || existing.status === 'approved') && (existing.botUsername || existing.botPassword)) {
      return {
        success: true,
        message: 'You already have an account for this game.',
        data: { account_name: existing.botUsername, password: existing.botPassword }
      };
    }
  }

  // --- BOT OFFLINE: route to manual processing (skip when bot is configured) ---
  const goldenDragonAutomation = isGoldenDragonAutomationReady(game);
  const juwaNewBotAutomation = isJuwaNewBotAutomationReady(game);
  const pandamasterNewBotAutomation = isPandamasterNewBotAutomationReady(game);
  if (goldenDragonAutomation || juwaNewBotAutomation || pandamasterNewBotAutomation) {
    await db.GameManualRequest.destroy({
      where: { userId, gameId: game.id, requestType: 'register', status: 'pending' }
    }).catch(() => {});
  }

  if (game.botOffline && !goldenDragonAutomation && !juwaNewBotAutomation && !pandamasterNewBotAutomation) {
    // Avoid creating duplicate pending requests
    const pendingRequest = await db.GameManualRequest.findOne({
      where: { userId, gameId: game.id, requestType: 'register', status: 'pending' }
    });
    if (pendingRequest) {
      return {
        success: true,
        pending: true,
        message: GAME_REGISTER_PENDING
      };
    }

    // Read user's store context so we can route the request to the right admin
    const user = await db.User.findByPk(userId, { attributes: ['storeCode', 'distributorCode'] });

    await db.GameManualRequest.create({
      userId,
      gameId: game.id,
      requestType: 'register',
      status: 'pending',
      storeCode: user?.storeCode || null,
      distributorCode: user?.distributorCode || null
    });

    notifyAdminsManualRequestQueued({
      gameId: game.id,
      requestType: 'register',
      userId,
      distributorCode: user?.distributorCode || null
    }).catch(() => { });

    return {
      success: true,
      pending: true,
      message: GAME_REGISTER_PENDING
    };
  }

  const isVblinkUltrapanda = isVblinkOrUltrapanda(game.name);
  const isGoldenDragon = isGoldenDragonGame(game.name, game.gameKey);
  const isGameVault = isGameVaultGame(game);
  const isVegasXCashier = isVegasXGame(game);
  const isOrionStars = isOrionStarsTerminalGame(game) && !isOrionStarsBotAutomationGame(game);
  const isFirekirinAgent = isFirekirinTerminalGame(game) && !isFirekirinBotAutomationGame(game);
  const isMilkywayAgent = isMilkywayTerminalGame(game) && !isMilkywayBotAutomationGame(game);
  const isGameroomAgent = isGameroomAgentGame(game) && !isGameroomBotAutomationGame(game);
  const isCashmachineAgent = isCashmachineAgentGame(game) && !isCashmachineBotAutomationGame(game);
  const isMafiaAgent = isMafiaAgentGame(game);
  const user = await db.User.findByPk(userId, { attributes: ['storeCode', 'distributorCode'] });
  const registerLogContext = buildBotLogContext({
    game,
    operation: 'register',
    storeCode: user?.storeCode,
    apiEndpoint: isVegasXCashier
      ? '/cashier/create'
      : ((isOrionStars || isFirekirinAgent || isMilkywayAgent)
        ? '/ws/service.ashx?action=registerUser'
        : ((isGameroomAgent || isCashmachineAgent || isMafiaAgent)
          ? '/api/player/insertPlayer'
          : (isGameVault ? '/api/external/addUser' : '/create-user')))
  });

  // --- BOT ONLINE: call the bot or third-party API ---
  if (isVblinkUltrapanda) {
    if (!game.botApiUrl || !game.appId || !game.appSecret) {
      const err = new Error('This game is not available for registration at the moment. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else if (isGameVault) {
    if (!game.agentId || !game.apiSecretKey) {
      const err = new Error('This game is not available for registration at the moment. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else if (isVegasXCashier) {
    if (!game.botApiUrl || !game.botUsername || !game.botPassword) {
      const err = new Error('This game is not available for registration at the moment. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else if (isOrionStars || isFirekirinAgent || isMilkywayAgent || isGameroomAgent || isCashmachineAgent || isMafiaAgent) {
    if (!game.botApiUrl || !game.botUsername || !game.botPassword) {
      const err = new Error('This game is not available for registration at the moment. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  } else {
    if (!game.botApiUrl || !game.botApiKey) {
      const err = new Error('This game is not available for registration at the moment. Please try again later.');
      err.statusCode = 503;
      throw err;
    }
  }

  let account_name;
  let password;
  let providerUserId = null;
  let lastError;

  if (isVblinkUltrapanda) {
    const account = sanitizeVblinkAccount(username);
    let currentAccount = account;
    let hasRetriedAlternate = false;
    let hasRetriedLetterPrefixed = false;
    for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
      const passwd = generateVblinkPassword();
      try {
        const result = await withBotRetry(
          () => callVblinkUltrapandaCreateUser(
            game.botApiUrl,
            game.appId,
            game.appSecret,
            currentAccount,
            passwd
          ),
          { logContext: { ...registerLogContext, gameUsername: currentAccount } }
        );
        account_name = result.account_name;
        password = result.password;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (!hasRetriedLetterPrefixed && isAccountMustStartWithLetterError(err)) {
          currentAccount = ensureVblinkAccountStartsWithLetter(currentAccount);
          hasRetriedLetterPrefixed = true;
          continue;
        }
        if (err.isUserAlreadyExists && MAX_RETRY_ALTERNATE_USERNAME > 0 && !hasRetriedAlternate) {
          currentAccount = ensureVblinkAccountStartsWithLetter(createAlternateVblinkAccount(account));
          hasRetriedAlternate = true;
          continue;
        }
        const isPwdValidation = isBotPasswordValidationError(err);
        if (!isPwdValidation || pwdAttempt === MAX_RETRY_PASSWORD_VALIDATION - 1) {
          break;
        }
      }
    }
    if (lastError && lastError.isUserAlreadyExists && MAX_RETRY_ALTERNATE_USERNAME > 0 && !hasRetriedAlternate) {
      const alternateAccount = createAlternateVblinkAccount(account);
      const retryPasswd = generateVblinkPassword();
      try {
        const result = await withBotRetry(
          () => callVblinkUltrapandaCreateUser(
            game.botApiUrl,
            game.appId,
            game.appSecret,
            alternateAccount,
            retryPasswd
          ),
          { logContext: { ...registerLogContext, gameUsername: alternateAccount } }
        );
        account_name = result.account_name;
        password = result.password;
        lastError = null;
      } catch (retryErr) {
        lastError = retryErr;
      }
    }
  } else if (isGoldenDragon) {
    const onInvalidApiKey = async () => {
      const r = await refreshGameBotApiKey(game.id);
      game.botApiKey = r.api_key;
    };
    const runGoldenDragon = async () => {
      const profile = await buildGoldenDragonProfile(userId, authContext);
      const created = await callGoldenDragonCreateUser(game.botApiUrl, game.botApiKey, profile);
      const searched = await callGoldenDragonSearchUser(game.botApiUrl, game.botApiKey, created.pin_id, 'pin_id');
      return {
        account_name: searched.mobile_id || created.mobile_id,
        password: String(created.pin_id)
      };
    };
    try {
      const result = await withBotRetry(runGoldenDragon, {
        onInvalidApiKey,
        logContext: { ...registerLogContext, gameUsername: String(username || '').trim() || null }
      });
      account_name = result.account_name;
      password = result.password;
      lastError = null;
    } catch (err) {
      lastError = err;
    }
  } else if (isGameVault) {
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    let currentAccount = gameUsername;
    let hasRetriedAlternate = false;
    for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
      const loginPwd = generateGameVaultPassword();
      try {
        const result = await withBotRetry(
          () => callGameVaultAddUser(
            game,
            game.agentId,
            game.apiSecretKey,
            currentAccount,
            loginPwd
          ),
          { logContext: { ...registerLogContext, gameUsername: currentAccount } }
        );
        account_name = result.account_name || currentAccount;
        password = result.password || loginPwd;
        providerUserId = result.user_id != null ? String(result.user_id) : null;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (err.isUserAlreadyExists && MAX_RETRY_ALTERNATE_USERNAME > 0 && !hasRetriedAlternate) {
          currentAccount = createAlternateUsername(gameUsername, game.name);
          hasRetriedAlternate = true;
          continue;
        }
        if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
          continue;
        }
        if (err.isAccountFormatError) {
          break;
        }
        break;
      }
    }
    if (lastError && lastError.isUserAlreadyExists && MAX_RETRY_ALTERNATE_USERNAME > 0 && !hasRetriedAlternate) {
      const alternateAccount = createAlternateUsername(gameUsername, game.name);
      const retryPwd = generateGameVaultPassword();
      try {
        const result = await withBotRetry(
          () => callGameVaultAddUser(
            game,
            game.agentId,
            game.apiSecretKey,
            alternateAccount,
            retryPwd
          ),
          { logContext: { ...registerLogContext, gameUsername: alternateAccount } }
        );
        account_name = result.account_name || alternateAccount;
        password = retryPwd;
        providerUserId = result.user_id != null ? String(result.user_id) : null;
        lastError = null;
      } catch (retryErr) {
        lastError = retryErr;
      }
    }
  } else if (isVegasXCashier) {
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    const displayName = await buildVegasXDisplayName(userId);
    let currentAccount = gameUsername;
    let usernameRetries = 0;

    while (usernameRetries <= MAX_RETRY_ALTERNATE_USERNAME) {
      let registered = false;
      for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
        const loginPwd = generateVegasXPassword();
        try {
          const result = await withBotRetry(
            () => withVegasXCashierTokenRetry(game, (token) => callVegasXCashierCreate(
              game,
              token,
              { name: displayName, username: currentAccount, password: loginPwd }
            )),
            { logContext: { ...registerLogContext, gameUsername: currentAccount } }
          );
          account_name = result.account_name || currentAccount;
          password = loginPwd;
          providerUserId = result.provider_user_id;
          lastError = null;
          registered = true;
          break;
        } catch (err) {
          lastError = err;
          if (err.isUserAlreadyExists) break;
          if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
            continue;
          }
          break;
        }
      }
      if (registered || !lastError?.isUserAlreadyExists) break;
      if (usernameRetries >= MAX_RETRY_ALTERNATE_USERNAME) break;
      currentAccount = createAlternateUsername(
        usernameRetries === 0 ? gameUsername : currentAccount,
        game.name
      );
      usernameRetries++;
    }
  } else if (isOrionStars) {
    // "Account already exists" is expected — invent a new username and retry (not a bug).
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    let currentAccount = gameUsername;
    let usernameRetries = 0;

    while (usernameRetries <= MAX_RETRY_ALTERNATE_USERNAME) {
      let registered = false;
      for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
        const loginPwd = generateOrionStarsPassword();
        try {
          const result = await withBotRetry(
            () => registerOrionStarsUser(game, currentAccount, loginPwd, {
              callBotCreateUser,
              gameName: game.name
            }),
            { logContext: { ...registerLogContext, gameUsername: currentAccount } }
          );
          account_name = result.account_name || currentAccount;
          password = result.password || loginPwd;
          lastError = null;
          registered = true;
          break;
        } catch (err) {
          lastError = err;
          if (err.isUserAlreadyExists) break;
          if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
            continue;
          }
          break;
        }
      }
      if (registered || !lastError?.isUserAlreadyExists) break;
      if (usernameRetries >= MAX_RETRY_ALTERNATE_USERNAME) break;
      currentAccount = createAlternateUsername(
        usernameRetries === 0 ? gameUsername : currentAccount,
        game.name
      );
      usernameRetries++;
    }
  } else if (isFirekirinAgent) {
    // "Account already exists" is expected — invent a new username and retry (not a bug).
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    let currentAccount = gameUsername;
    let usernameRetries = 0;

    while (usernameRetries <= MAX_RETRY_ALTERNATE_USERNAME) {
      let registered = false;
      for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
        const loginPwd = generateFirekirinPassword();
        try {
          const result = await withBotRetry(
            () => registerFirekirinUser(game, currentAccount, loginPwd),
            { logContext: { ...registerLogContext, gameUsername: currentAccount } }
          );
          account_name = result.account_name || currentAccount;
          password = result.password || loginPwd;
          lastError = null;
          registered = true;
          break;
        } catch (err) {
          lastError = err;
          if (err.isUserAlreadyExists) break;
          if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
            continue;
          }
          break;
        }
      }
      if (registered || !lastError?.isUserAlreadyExists) break;
      if (usernameRetries >= MAX_RETRY_ALTERNATE_USERNAME) break;
      currentAccount = createAlternateUsername(
        usernameRetries === 0 ? gameUsername : currentAccount,
        game.name
      );
      usernameRetries++;
    }
  } else if (isMilkywayAgent) {
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    let currentAccount = gameUsername;
    let usernameRetries = 0;

    while (usernameRetries <= MAX_RETRY_ALTERNATE_USERNAME) {
      let registered = false;
      for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
        const loginPwd = generateMilkywayPassword();
        try {
          const result = await withBotRetry(
            () => registerMilkywayUser(game, currentAccount, loginPwd),
            { logContext: { ...registerLogContext, gameUsername: currentAccount } }
          );
          account_name = result.account_name || currentAccount;
          password = result.password || loginPwd;
          lastError = null;
          registered = true;
          break;
        } catch (err) {
          lastError = err;
          if (err.isUserAlreadyExists) break;
          if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
            continue;
          }
          break;
        }
      }
      if (registered || !lastError?.isUserAlreadyExists) break;
      if (usernameRetries >= MAX_RETRY_ALTERNATE_USERNAME) break;
      currentAccount = createAlternateUsername(
        usernameRetries === 0 ? gameUsername : currentAccount,
        game.name
      );
      usernameRetries++;
    }
  } else if (isGameroomAgent) {
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    let currentAccount = gameUsername;
    let usernameRetries = 0;

    while (usernameRetries <= MAX_RETRY_ALTERNATE_USERNAME) {
      let registered = false;
      for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
        const loginPwd = generateGameroomPassword();
        try {
          const result = await withBotRetry(
            () => registerGameroomUser(game, currentAccount, loginPwd, currentAccount),
            { logContext: { ...registerLogContext, gameUsername: currentAccount } }
          );
          account_name = result.account_name || currentAccount;
          password = result.password || loginPwd;
          providerUserId = result.provider_user_id;
          lastError = null;
          registered = true;
          break;
        } catch (err) {
          lastError = err;
          if (err.isUserAlreadyExists) break;
          if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
            continue;
          }
          break;
        }
      }
      if (registered || !lastError?.isUserAlreadyExists) break;
      if (usernameRetries >= MAX_RETRY_ALTERNATE_USERNAME) break;
      currentAccount = createAlternateUsername(
        usernameRetries === 0 ? gameUsername : currentAccount,
        game.name
      );
      usernameRetries++;
    }
  } else if (isCashmachineAgent) {
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    let currentAccount = gameUsername;
    let usernameRetries = 0;

    while (usernameRetries <= MAX_RETRY_ALTERNATE_USERNAME) {
      let registered = false;
      for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
        const loginPwd = generateCashmachinePassword();
        try {
          const result = await withBotRetry(
            () => registerCashmachineUser(game, currentAccount, loginPwd, currentAccount),
            { logContext: { ...registerLogContext, gameUsername: currentAccount } }
          );
          account_name = result.account_name || currentAccount;
          password = result.password || loginPwd;
          providerUserId = result.provider_user_id;
          lastError = null;
          registered = true;
          break;
        } catch (err) {
          lastError = err;
          if (err.isUserAlreadyExists) break;
          if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
            continue;
          }
          break;
        }
      }
      if (registered || !lastError?.isUserAlreadyExists) break;
      if (usernameRetries >= MAX_RETRY_ALTERNATE_USERNAME) break;
      currentAccount = createAlternateUsername(
        usernameRetries === 0 ? gameUsername : currentAccount,
        game.name
      );
      usernameRetries++;
    }
  } else if (isMafiaAgent) {
    const gameUsername = resolveRegisterUsername(username, game.name);
    assertValidGameUsername(gameUsername, game.name);
    let currentAccount = gameUsername;
    let usernameRetries = 0;

    while (usernameRetries <= MAX_RETRY_ALTERNATE_USERNAME) {
      let registered = false;
      for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
        const loginPwd = generateMafiaPassword();
        try {
          const result = await withBotRetry(
            () => registerMafiaUser(game, currentAccount, loginPwd, currentAccount),
            { logContext: { ...registerLogContext, gameUsername: currentAccount } }
          );
          account_name = result.account_name || currentAccount;
          password = result.password || loginPwd;
          providerUserId = result.provider_user_id;
          lastError = null;
          registered = true;
          break;
        } catch (err) {
          lastError = err;
          if (err.isUserAlreadyExists) break;
          if (err.isPasswordValidationError && pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION - 1) {
            continue;
          }
          break;
        }
      }
      if (registered || !lastError?.isUserAlreadyExists) break;
      if (usernameRetries >= MAX_RETRY_ALTERNATE_USERNAME) break;
      currentAccount = createAlternateUsername(
        usernameRetries === 0 ? gameUsername : currentAccount,
        game.name
      );
      usernameRetries++;
    }
  } else {
    const gameUsername = resolveRegisterUsername(username, game.name);
    if (usesStrictRegisterUsernameRules(game.name)) {
      assertValidGameUsername(gameUsername, game.name);
    }
    const onInvalidApiKey = async () => {
      const r = await refreshGameBotApiKey(game.id);
      game.botApiKey = r.api_key;
    };
    let currentUsername = gameUsername;
    let accountNameLengthRetryCount = 0;
    for (let pwdAttempt = 0; pwdAttempt < MAX_RETRY_PASSWORD_VALIDATION; pwdAttempt++) {
      try {
        const result = await withBotRetry(
          () => callBotCreateUser(game.botApiUrl, game.botApiKey, currentUsername, game.name),
          { onInvalidApiKey, logContext: { ...registerLogContext, gameUsername: currentUsername } }
        );
        account_name = result.account_name;
        password = result.password;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (isBotAccountNameLengthError(err) && accountNameLengthRetryCount < MAX_RETRY_ACCOUNT_NAME_LENGTH) {
          currentUsername = isPandaMasterGame(game.name, game.gameKey)
            ? createAlternatePandaMasterRetryUsername(currentUsername)
            : createAlternateUsername(currentUsername, game.name);
          accountNameLengthRetryCount++;
          continue;
        }
        const isPwdValidation = isBotPasswordValidationError(err);
        if (!isPwdValidation || pwdAttempt === MAX_RETRY_PASSWORD_VALIDATION - 1) {
          break;
        }
        // Retry third-party API when bot returns password format/length error
      }
    }
    let retries = 0;
    while (lastError && lastError.isUserAlreadyExists && retries < MAX_RETRY_ALTERNATE_USERNAME) {
      const alternateUsername = createAlternateUsername(gameUsername, game.name);
      try {
        const result = await withBotRetry(
          () => callBotCreateUser(game.botApiUrl, game.botApiKey, alternateUsername, game.name),
          { onInvalidApiKey, logContext: { ...registerLogContext, gameUsername: alternateUsername } }
        );
        account_name = result.account_name;
        password = result.password;
        lastError = null;
      } catch (retryErr) {
        lastError = retryErr;
      }
      retries++;
    }
  }

  if (lastError) {
    // Do not switch to manual for password validation errors; throw so user can retry
    if (
      isBotPasswordValidationError(lastError)
      || isBotAccountNameLengthError(lastError)
      || lastError.isPasswordValidationError
      || lastError.isAccountFormatError
    ) {
      throw lastError;
    }
    // Bot / agent API outage → queue manual for store admins (not Golden Dragon — show the real error).
    if (isBotApiFailure(lastError) && !isGoldenDragonGame(game.name, game.gameKey)) {
      await recordBotAutomationFailure({
        gameId: game.id,
        platformUserId: userId,
        storeCode: (await db.User.findByPk(userId, { attributes: ['storeCode'] }))?.storeCode,
        gameName: game.name,
        error: lastError,
        gameUsername: (isVblinkUltrapanda ? (account_name || username) : (account_name || username)),
        operationType: 'register'
      }).catch(() => { });
      const pendingRequest = await db.GameManualRequest.findOne({
        where: { userId, gameId: game.id, requestType: 'register', status: 'pending' }
      });
      if (pendingRequest) {
        return {
          success: true,
          pending: true,
          message: "We're on it. You'll see your game login here once it's ready."
        };
      }
      const user = await db.User.findByPk(userId, { attributes: ['storeCode', 'distributorCode'] });
      await db.GameManualRequest.create({
        userId,
        gameId: game.id,
        requestType: 'register',
        status: 'pending',
        storeCode: user?.storeCode || null,
        distributorCode: user?.distributorCode || null
      });
      notifyAdminsManualRequestQueued({
        gameId: game.id,
        requestType: 'register',
        userId,
        distributorCode: user?.distributorCode || null
      }).catch(() => { });
      return {
        success: true,
        pending: true,
        message: "We're on it. You'll see your game login here once it's ready."
      };
    }
    if (lastError.isUserAlreadyExists) {
      const genericErr = new Error('Could not create your game account at this time. Please try again later.');
      genericErr.statusCode = lastError.statusCode || 502;
      throw genericErr;
    }
    throw lastError;
  }

  if (isGameVault && !providerUserId && account_name) {
    try {
      providerUserId = await fetchGameVaultProviderUserId(
        game,
        game.agentId,
        game.apiSecretKey,
        account_name
      );
    } catch {
      // Registration can still complete; deposit/withdraw will resolve user_id on demand.
    }
  }

  if (!account_name) {
    const err = new Error('Could not create your game account at this time. Please try again later.');
    err.statusCode = 502;
    throw err;
  }

  await assertGameUsernameAvailable(game.id, account_name, userId, { gameName: game.name });

  try {
    await db.sequelize.transaction(async (transaction) => {
      await assertGameUsernameAvailable(game.id, account_name, userId, {
        gameName: game.name,
        providerUserId,
        transaction
      });

      const accountRow = {
        userId,
        gameId: game.id,
        botUsername: account_name,
        botPassword: password,
        status: 'active',
        operationDoneBy: 'bot'
      };
      if ((isGameVault || isVegasXCashier || isGameroomAgent || isCashmachineAgent || isMafiaAgent) && providerUserId) {
        accountRow.providerUserId = String(providerUserId).slice(0, 64);
      }

      const existing = await db.UserGameAccount.findOne({
        where: { userId, gameId: game.id },
        transaction
      });
      if (existing) {
        await existing.update(accountRow, { transaction });
      } else {
        await db.UserGameAccount.create(accountRow, { transaction });
      }

      await db.GameActivity.create({
        userId,
        gameId: game.id,
        activityType: 'register',
        operationDoneBy: 'bot'
      }, { transaction });
    });
  } catch (err) {
    rethrowGameUsernameConflict(err, game.name);
  }

  return {
    success: true,
    message: `${getStoreGameDisplayName(game.name, game.gameKey)} user account created successfully`,
    data: { account_name, password }
  };
}

module.exports = { registerGameAccount };
