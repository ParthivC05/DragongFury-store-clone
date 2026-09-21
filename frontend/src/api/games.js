import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';

const GAMES_BASE = `${API_BASE}/api/games`;

/** Minimum length for game password reset (default games); must match backend `MIN_NEW_GAME_PASSWORD_LENGTH`. */
export const MIN_GAME_NEW_PASSWORD_LENGTH = 8;

/**
 * Strict forgot-password rules per game (must match backend `STRICT_FORGOT_PASSWORD_GAMES`).
 * CashMachine777: 6–12 with upper, lower, number, special (no @). Gameroom: 8–12 same. VegasX: 6–16 letters and numbers.
 */
const STRICT_FORGOT_PASSWORD_GAMES = {
  cashmachine777: {
    label: 'CashMachine777',
    minLen: 6,
    maxLen: 12,
    forbidAtInPassword: true,
    alphanumericOnly: false,
  },
  gameroom: { label: 'Gameroom', minLen: 8, maxLen: 12, forbidAtInPassword: false, alphanumericOnly: false },
  vegasx: { label: 'VegasX', minLen: 6, maxLen: 16, forbidAtInPassword: false, alphanumericOnly: true },
};

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

/** CashMachine777 provider rejects `@` in passwords (must match backend). */
export function strictForgotPasswordForbidsAt(gameName) {
  const key = normalizeGameNameKey(gameName);
  return STRICT_FORGOT_PASSWORD_GAMES[key]?.forbidAtInPassword === true;
}

/** @returns {{ minLen: number, maxLen: number } | null} */
export function getStrictForgotPasswordLengthBounds(name) {
  const key = normalizeGameNameKey(name);
  const cfg = STRICT_FORGOT_PASSWORD_GAMES[key];
  return cfg ? { minLen: cfg.minLen, maxLen: cfg.maxLen } : null;
}

export function usesStrictForgotPasswordGameName(name) {
  return getStrictForgotPasswordLengthBounds(name) != null;
}

function strictForgotPasswordLabel(name) {
  const key = normalizeGameNameKey(name);
  return STRICT_FORGOT_PASSWORD_GAMES[key]?.label || 'This game';
}

/** User-facing message for game password reset failures (never generic bot/internal text). */
export function getGamePasswordResetErrorMessage(err) {
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  const isInternal =
    !msg ||
    /^please check your details/i.test(msg) ||
    /^unable to reset your game password/i.test(msg) ||
    /^bot_forgot_password/i.test(msg);
  if (!isInternal) return msg;
  return 'We could not reset your game password. Please try again or contact support.';
}

/**
 * Client-side validation for forgot-password; mirrors backend `assertValidNewGamePassword`.
 * @returns {string|null} error message, or null if valid
 */
export function getGameForgotPasswordValidationError(gameName, trimmedPassword) {
  const bounds = getStrictForgotPasswordLengthBounds(gameName);
  const key = normalizeGameNameKey(gameName);
  const cfg = STRICT_FORGOT_PASSWORD_GAMES[key];
  if (bounds && cfg) {
    const label = strictForgotPasswordLabel(gameName);
    const len = trimmedPassword.length;
    if (len < bounds.minLen || len > bounds.maxLen) {
      return `For ${label}, password must be between ${bounds.minLen} and ${bounds.maxLen} characters.`;
    }
    if (strictForgotPasswordForbidsAt(gameName) && trimmedPassword.includes('@')) {
      return `For ${label}, the @ character cannot be used in the password. Use another symbol (for example ! # $ % & *).`;
    }
    if (!/[A-Z]/.test(trimmedPassword)) {
      return `For ${label}, password must include at least one uppercase letter.`;
    }
    if (!/[a-z]/.test(trimmedPassword)) {
      return `For ${label}, password must include at least one lowercase letter.`;
    }
    if (cfg.alphanumericOnly) {
      if (!/^[A-Za-z0-9]+$/.test(trimmedPassword)) {
        return `For ${label}, password can only contain letters and numbers.`;
      }
    } else if (!/[^A-Za-z0-9]/.test(trimmedPassword)) {
      return `For ${label}, password must include at least one special character (for example ! # $ % & *).`;
    }
    if (!/\d/.test(trimmedPassword)) {
      return `For ${label}, password must include at least one number.`;
    }
    return null;
  }
  if (trimmedPassword.length < MIN_GAME_NEW_PASSWORD_LENGTH) {
    return `New password must be at least ${MIN_GAME_NEW_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/** Match timeout/abort errors (e.g. "timeout exceeded", ECONNABORTED). */
const isTimeoutError = (err) => /timeout|exceeded|ECONNABORTED/i.test(err?.message || '');

/**
 * Run a promise; on timeout-like errors, retry once. Used for bot APIs so users don't see red toasts for transient timeouts.
 */
async function withRetryOnTimeout(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isTimeoutError(err)) throw err;
    return await fn();
  }
}

/** List active games. With auth, includes has_account and account_status per game. */
export function listGames(params = {}) {
  const query = {};
  if (params.store_code != null && String(params.store_code).trim()) {
    query.store_code = String(params.store_code).trim();
  }
  return getRequest(GAMES_BASE, query);
}

/** FireKirin exclusive titles from Game API getgamelist. Auth required. */
export function getFirekirinExclusiveGames() {
  return getRequest(`${GAMES_BASE}/firekirin/exclusive`);
}

/** Launch a FireKirin exclusive title via entergame. Body: { kindId }. */
export function enterFirekirinExclusiveGame(kindId) {
  return postRequest(`${GAMES_BASE}/firekirin/enter`, { kindId });
}

export const FIREKIRIN_ACCOUNT_REQUIRED_CODE = 'FIREKIRIN_ACCOUNT_REQUIRED';

/** Whether user has deposited and can play slots / manage platform game balance. */
export function getGamePlayEligibility() {
  return getRequest(`${GAMES_BASE}/play-eligibility`);
}

/** Get one game by id or slug. With auth, includes account credentials if any. */
export function getGame(idOrSlug) {
  return getRequest(`${GAMES_BASE}/${idOrSlug}`);
}

/** Register (create) game account for current user. Retries once on timeout. */
export function registerGameAccount(gameId) {
  return withRetryOnTimeout(() => postRequest(`${GAMES_BASE}/${gameId}/register`, {}));
}

/** Get game balance from the game provider. Retries once on timeout. */
export function getGameBalance(gameId) {
  return withRetryOnTimeout(() => getRequest(`${GAMES_BASE}/${gameId}/balance`));
}

/** Firekirin / Milkyway agent: verify current game password via queryInfo, persist it, return balance. */
export function syncFirekirinGamePassword(gameId, gamePassword) {
  return postRequest(`${GAMES_BASE}/${gameId}/sync-password`, { gamePassword });
}

/** Alias for Milkyway agent password sync (same endpoint; backend routes by game type). */
export function syncMilkywayGamePassword(gameId, gamePassword) {
  return syncFirekirinGamePassword(gameId, gamePassword);
}

export const GAME_PASSWORD_STALE_CODE = 'GAME_PASSWORD_STALE';

export function isPasswordStaleBalanceResponse(res) {
  if (!res || typeof res !== 'object') return false;
  return res.passwordStale === true || res.code === GAME_PASSWORD_STALE_CODE;
}

/** Top-up game: deduct from wallet, add to game. Body: { amount: number }. Retries once on timeout. */
export function gameTopup(gameId, amount) {
  return withRetryOnTimeout(() => postRequest(`${GAMES_BASE}/${gameId}/topup`, { amount }));
}

/** Withdraw from game to wallet (legacy, kept for reference). Retries once on timeout. */
export function gameWithdraw(gameId, amount) {
  return withRetryOnTimeout(() => postRequest(`${GAMES_BASE}/${gameId}/withdraw`, { amount }));
}

/**
 * Redeem credits from a game back to the user's SC wallet.
 * Uses same pattern as topup: POST /api/games/:id/redeem with { amount } (gameId in URL). Retries once on timeout.
 */
export function gameRedeem(gameId, amount) {
  return withRetryOnTimeout(() => postRequest(`${GAMES_BASE}/${gameId}/redeem`, { amount }));
}

/** Link an existing game-platform account to the current user. Body: { gameName, gameUsername, gamePassword? } */
export function linkGameAccount(gameName, gameUsername, gamePassword) {
  const body = { gameName, gameUsername };
  if (gamePassword != null && String(gamePassword).length > 0) {
    body.gamePassword = String(gamePassword);
  }
  return postRequest(`${GAMES_BASE}/link-account`, body);
}

/** Matches backend `GAME_USERNAME_ALREADY_TAKEN` conflict responses. */
export const GAME_USERNAME_ALREADY_TAKEN_CODE = 'GAME_USERNAME_ALREADY_TAKEN';

export function isGameUsernameAlreadyTakenError(err) {
  return err?.body?.code === GAME_USERNAME_ALREADY_TAKEN_CODE;
}

/** List current user's game activities (register, login, topup, withdraw). */
export function getGameActivities(params) {
  return getRequest(`${GAMES_BASE}/activities`, params || {});
}

/**
 * Reset game account password (server generates a new password).
 * Calls POST /api/games/forgot-password with { gameName, game_username }.
 */
export function gameForgotPassword(gameName, gameUsername) {
  return postRequest(`${GAMES_BASE}/forgot-password`, {
    gameName,
    game_username: gameUsername,
  });
}
