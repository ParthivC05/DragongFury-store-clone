'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');

/** Must match migration `20260710160000-unique-game-username-per-store-game.js`. */
const UNIQUE_GAME_USERNAME_INDEX = 'user_game_accounts_game_id_bot_username_lower_uidx';

const GAME_USERNAME_ALREADY_TAKEN_CODE = 'GAME_USERNAME_ALREADY_TAKEN';

const GAME_USERNAME_ALREADY_TAKEN_MESSAGE =
  'This game username is already linked to another account. Please register a new game account or connect with a different username.';

function formatGameUsernameTakenMessage(gameName) {
  const label = String(gameName || '').trim();
  if (!label) return GAME_USERNAME_ALREADY_TAKEN_MESSAGE;
  return `This ${label} username is already linked to another account. Please register a new game account or connect with a different username.`;
}

function createGameUsernameTakenError(gameName) {
  const err = new Error(formatGameUsernameTakenMessage(gameName));
  err.statusCode = 409;
  err.code = GAME_USERNAME_ALREADY_TAKEN_CODE;
  return err;
}

function isGameUsernameTakenError(err) {
  return err?.code === GAME_USERNAME_ALREADY_TAKEN_CODE;
}

function normalizeGameUsernameForCompare(gameUsername) {
  return String(gameUsername || '').trim().toLowerCase();
}

/**
 * Ensure no other platform user on this store game already uses this game username.
 * Scoped by game_id (each store has its own game row).
 *
 * @param {number} gameId
 * @param {string} gameUsername
 * @param {number} currentUserId
 * @param {{ transaction?: import('sequelize').Transaction, gameName?: string, providerUserId?: string|number|null }} [opts]
 */
async function assertGameUsernameAvailable(gameId, gameUsername, currentUserId, opts = {}) {
  if (!gameId || !currentUserId) return;

  const normalized = normalizeGameUsernameForCompare(gameUsername);
  const providerUserId = opts.providerUserId != null && String(opts.providerUserId).trim()
    ? String(opts.providerUserId).trim().slice(0, 64)
    : null;

  if (!normalized && !providerUserId) return;

  const conflictConditions = [];

  if (normalized) {
    conflictConditions.push(
      db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.fn('TRIM', db.sequelize.col('bot_username'))),
        Op.eq,
        normalized
      )
    );
  }

  if (providerUserId) {
    conflictConditions.push({ providerUserId });
  }

  const existing = await db.UserGameAccount.findOne({
    where: {
      gameId,
      userId: { [Op.ne]: currentUserId },
      [Op.or]: conflictConditions
    },
    attributes: ['id', 'userId', 'botUsername', 'providerUserId'],
    transaction: opts.transaction || undefined
  });

  if (existing) {
    throw createGameUsernameTakenError(opts.gameName);
  }
}

/** True only for unique-index violations on game_id + bot_username (not other constraints). */
function isGameUsernameTakenDbError(err) {
  if (err?.name !== 'SequelizeUniqueConstraintError' && err?.parent?.code !== '23505') {
    return false;
  }

  const constraint = String(err?.parent?.constraint || '');
  if (constraint === UNIQUE_GAME_USERNAME_INDEX) {
    return true;
  }

  const fields = err?.fields || err?.parent?.fields;
  if (fields && typeof fields === 'object') {
    const keys = Object.keys(fields);
    if (keys.includes('game_id') && keys.some((k) => k.includes('bot_username'))) {
      return true;
    }
  }

  return false;
}

function rethrowGameUsernameConflict(err, gameName) {
  if (isGameUsernameTakenError(err)) {
    throw err;
  }
  if (isGameUsernameTakenDbError(err)) {
    throw createGameUsernameTakenError(gameName);
  }
  throw err;
}

module.exports = {
  UNIQUE_GAME_USERNAME_INDEX,
  GAME_USERNAME_ALREADY_TAKEN_CODE,
  GAME_USERNAME_ALREADY_TAKEN_MESSAGE,
  formatGameUsernameTakenMessage,
  createGameUsernameTakenError,
  isGameUsernameTakenError,
  assertGameUsernameAvailable,
  isGameUsernameTakenDbError,
  rethrowGameUsernameConflict
};
