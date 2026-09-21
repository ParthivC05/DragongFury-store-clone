'use strict';

/** CashMachine / Gameroom: letters and numbers only, 5–20 characters, must start with a letter. */
const ALPHANUMERIC_5_20_GAME_KEYS = new Set(['cashmachine', 'gameroom']);

/** CashMachine777 / Mafia: letters and numbers only, 6–20 characters (no letter-start requirement). */
const ALPHANUMERIC_6_20_GAME_KEYS = new Set(['cashmachine777', 'mafia', 'mafiaagent']);

/**
 * Juwa, Orionstar(s), Firekirin, GameVault, GameVault2, Milkyway, Juwa 2.0, PandaMaster:
 * 13 or fewer characters; letters and numbers only.
 */
const SHORT_UNDERSCORE_GAME_KEY_PATTERN = /^(juwa|juwa20|orionstars?|firekirin|gamevault2?|gamevaultagent|milkyway|milkywayagent|pandamaster2?)$/;

const MIN_ALPHANUMERIC_5_20_LENGTH = 5;
const MAX_ALPHANUMERIC_5_20_LENGTH = 20;
const MIN_ALPHANUMERIC_6_20_LENGTH = 6;
const MAX_ALPHANUMERIC_6_20_LENGTH = 20;
const MAX_SHORT_UNDERSCORE_LENGTH = 13;

const ALPHANUMERIC_5_20_REGEX = /^[a-zA-Z][a-zA-Z0-9]{4,19}$/;
const ALPHANUMERIC_6_20_REGEX = /^[a-zA-Z0-9]{6,20}$/;
const SHORT_UNDERSCORE_REGEX = /^[a-zA-Z][a-zA-Z0-9]{0,12}$/;

/** Vblink / UltraPanda / Egame99: 7–16 characters (letters and numbers). */
const VBLINK_FAMILY_GAME_KEYS = new Set(['vblink', 'ultrapanda', 'egame99']);

/** VegasX agent API: alphanumeric plus underscore, dash, dot. */
const VEGASX_USERNAME_REGEX = /^[A-Za-z0-9_.-]+$/;

const MIN_VBLINK_FAMILY_LENGTH = 7;
const MAX_VBLINK_FAMILY_LENGTH = 16;

const VBLINK_FAMILY_REGEX = /^[a-zA-Z][a-zA-Z0-9]{6,15}$/;

/** Strip spaces, dots, and special characters — letters and numbers only. */
function stripAlphanumericUsername(username) {
  return String(username || '').trim().replace(/[^a-zA-Z0-9]/g, '');
}

/** Normalize game name for rule lookup (e.g. "Juwa 2.0" → "juwa20", "Orionstars" → "orionstars"). */
function normalizeGameNameKey(gameName) {
  const key = String(gameName || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_.-]+/g, '');
  if (key === 'juwa20agent') return 'juwa20';
  if (key === 'juwaagent') return 'juwa';
  if (key === 'juwanewbot' || key.includes('juwanewbot')) return 'juwa';
  if (key === 'pandamaster2' || key.includes('pandamasternewbot')) return 'pandamaster';
  if (key === 'gamevault2' || key === 'gamevaultagent') return 'gamevault';
  if (key.startsWith('firekirin')) return 'firekirin';
  if (key.startsWith('milkyway')) return 'milkyway';
  if (key.startsWith('gameroom')) return 'gameroom';
  if (key.includes('cashmachine') && key.includes('agent')) return 'cashmachine';
  if (key.includes('mafia')) return 'mafia';
  return key;
}

function isAlphanumeric5To20UsernameGame(gameName) {
  return ALPHANUMERIC_5_20_GAME_KEYS.has(normalizeGameNameKey(gameName));
}

function isAlphanumeric6To20UsernameGame(gameName) {
  return ALPHANUMERIC_6_20_GAME_KEYS.has(normalizeGameNameKey(gameName));
}

function isShortUnderscoreUsernameGame(gameName) {
  return SHORT_UNDERSCORE_GAME_KEY_PATTERN.test(normalizeGameNameKey(gameName));
}

function isVblinkFamilyUsernameGame(gameName) {
  return VBLINK_FAMILY_GAME_KEYS.has(normalizeGameNameKey(gameName));
}

function isVegasXUsernameGame(gameName) {
  return normalizeGameNameKey(gameName) === 'vegasx';
}

function usesStrictRegisterUsernameRules(gameName) {
  return isAlphanumeric5To20UsernameGame(gameName)
    || isAlphanumeric6To20UsernameGame(gameName)
    || isShortUnderscoreUsernameGame(gameName)
    || isVblinkFamilyUsernameGame(gameName)
    || isVegasXUsernameGame(gameName);
}

/**
 * Returns a user-facing validation error message, or null when the username is valid for the game.
 * @param {string} username
 * @param {string} gameName
 * @returns {string|null}
 */
function getGameUsernameValidationError(username, gameName) {
  const value = String(username || '').trim();
  if (!value) {
    return 'Game username is required.';
  }

  if (isAlphanumeric6To20UsernameGame(gameName)) {
    if (!ALPHANUMERIC_6_20_REGEX.test(value)) {
      return 'Username can only be letters and numbers, and must be between 6 and 20 characters.';
    }
    return null;
  }

  if (isAlphanumeric5To20UsernameGame(gameName)) {
    if (!ALPHANUMERIC_5_20_REGEX.test(value)) {
      return 'Username must start with a letter, can only contain letters and numbers, and must be between 5 and 20 characters.';
    }
    return null;
  }

  if (isShortUnderscoreUsernameGame(gameName)) {
    if (!SHORT_UNDERSCORE_REGEX.test(value)) {
      return 'Username must start with a letter, can only contain letters and numbers, and must be 13 characters or fewer.';
    }
    return null;
  }

  if (isVblinkFamilyUsernameGame(gameName)) {
    if (!VBLINK_FAMILY_REGEX.test(value)) {
      return 'Username must start with a letter, can only contain letters and numbers, and must be between 7 and 16 characters.';
    }
    return null;
  }

  if (isVegasXUsernameGame(gameName)) {
    if (!VEGASX_USERNAME_REGEX.test(value)) {
      return 'Username can only contain letters, numbers, underscores, dashes, or dots.';
    }
    return null;
  }

  return null;
}

/**
 * @param {string} username
 * @param {string} gameName
 * @returns {boolean}
 */
function isValidGameUsername(username, gameName) {
  return getGameUsernameValidationError(username, gameName) == null;
}

/**
 * Enforce per-game username rules before registration.
 * @param {string} username
 * @param {string} gameName
 */
function assertValidGameUsername(username, gameName) {
  const message = getGameUsernameValidationError(username, gameName);
  if (message) {
    const err = new Error(message);
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  normalizeGameNameKey,
  stripAlphanumericUsername,
  isAlphanumeric5To20UsernameGame,
  isAlphanumeric6To20UsernameGame,
  isShortUnderscoreUsernameGame,
  isVblinkFamilyUsernameGame,
  isVegasXUsernameGame,
  usesStrictRegisterUsernameRules,
  getGameUsernameValidationError,
  isValidGameUsername,
  assertValidGameUsername,
  MIN_ALPHANUMERIC_5_20_LENGTH,
  MAX_ALPHANUMERIC_5_20_LENGTH,
  MIN_ALPHANUMERIC_6_20_LENGTH,
  MAX_ALPHANUMERIC_6_20_LENGTH,
  MAX_SHORT_UNDERSCORE_LENGTH,
  MIN_VBLINK_FAMILY_LENGTH,
  MAX_VBLINK_FAMILY_LENGTH,
};
