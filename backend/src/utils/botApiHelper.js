'use strict';

const { recordGameAutomationApiLog } = require('../services/games/recordGameAutomationApiLog.service');
const { isAbortedTransactionError } = require('./pgErrors');

/** User-facing message when bot API fails after all retries (do not expose raw bot/technical errors). */
const BOT_UNAVAILABLE_MESSAGE = 'Please wait a few minutes or try again later.';

/** Number of times to call the third-party bot API before giving up. */
const BOT_API_MAX_ATTEMPTS = 8;

/** Delay (ms) between retryable bot API attempts — gives slow bots time to respond. */
const BOT_API_RETRY_DELAY_MS = 3000;

/** Substring match for provider "session" failures (case-insensitive). */
const FAILED_TO_ESTABLISH_SESSION_NEEDLE = 'failed to establish session';
/** Exact provider text when their session refresh fails and a new key is required. */
const SESSION_EXPIRED_AUTO_RECOVERY_FAILED_NEEDLE = 'session expired and auto-recovery failed';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeResponseField(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((d) => d.msg || d.message || d).join(' ');
  }
  if (value != null) return String(value);
  return '';
}

/**
 * Capture the raw bot HTTP response body for logging (never a platform custom string).
 * @param {*} data - Response body from axios
 * @param {number} httpStatus - HTTP status code
 * @returns {object}
 */
function captureBotApiResponse(data, httpStatus) {
  if (data && typeof data === 'object') return data;
  if (data != null && data !== '') {
    return { success: false, message: String(data), status: httpStatus };
  }
  return { success: false, message: `HTTP ${httpStatus}`, status: httpStatus };
}

/**
 * Extract the bot/third-party response object from an error for admin logging.
 * @param {Error} err
 * @returns {object|string|null}
 */
function getBotExternalResponse(err) {
  if (!err) return null;
  if (err.externalResponse != null && err.externalResponse !== '') {
    return err.externalResponse;
  }
  const axiosData = err.response && err.response.data;
  if (axiosData != null && axiosData !== '') {
    if (typeof axiosData === 'object') return axiosData;
    return { success: false, message: String(axiosData), status: err.response.status };
  }
  const transportMessage = err.originalMessage || err.message;
  if (transportMessage && String(transportMessage).trim() !== BOT_UNAVAILABLE_MESSAGE) {
    return {
      success: false,
      message: String(transportMessage).trim(),
      code: err.code || null,
      status: err.statusCode || (err.response && err.response.status) || null
    };
  }
  if (err.code) {
    return { success: false, message: String(err.code), code: err.code };
  }
  return null;
}

/**
 * Extract a human-readable message from a bot API response body.
 * @param {*} res
 * @returns {string|null}
 */
function extractMessageFromBotResponse(res) {
  if (res == null || res === '') return null;
  if (typeof res === 'string') {
    const trimmed = res.trim();
    return trimmed ? trimmed.slice(0, 2000) : null;
  }
  if (typeof res === 'object') {
    const message = [
      res.message,
      res.detail,
      res.error,
      res.msg,
      res.Msg,
      res.description,
      res.error_message
    ]
      .filter(Boolean)
      .map(normalizeResponseField)
      .join(' ')
      .trim();
    if (message) return message.slice(0, 2000);
    try {
      return JSON.stringify(res).slice(0, 2000);
    } catch {
      return String(res).slice(0, 2000);
    }
  }
  return String(res).slice(0, 2000);
}

/**
 * True when the bot/third-party response indicates a session could not be established.
 * Matches message/detail/error from externalResponse or err.message.
 * @param {Error} err
 * @returns {boolean}
 */
function isFailedToEstablishSessionError(err) {
  if (!err) return false;
  const fromReason = getBotErrorReason(err);
  const ext = getBotExternalResponse(err);
  let fromExt = '';
  if (ext && typeof ext === 'object') {
    fromExt = [ext.msg, ext.Msg, ext.detail, ext.description, ext.error_message, ext.error]
      .filter((v) => typeof v === 'string')
      .join(' ');
  }
  const combined = [fromReason, fromExt, err.message, err.originalMessage]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' ')
    .toLowerCase();
  return combined.includes(FAILED_TO_ESTABLISH_SESSION_NEEDLE);
}

/**
 * Check if an error is retryable (e.g. socket hang up, connection reset, timeout).
 * @param {Error} err
 * @returns {boolean}
 */
/**
 * True when the provider error is a recoverable session issue (e.g. Orion Stars "Session timeout").
 * These must not be shown raw to end users.
 */
function isProviderSessionTimeoutError(err) {
  if (!err) return false;
  if (err.isSessionTimeout === true) return true;
  const fromReason = getBotErrorReason(err);
  const combined = [fromReason, err.message, err.originalMessage]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' ')
    .toLowerCase();
  return (
    combined.includes('session timeout')
    || combined.includes('session expired')
    || /session\s*(invalid|not\s*found)/i.test(combined)
  );
}

function isRetryableBotError(err) {
  if (!err) return false;
  // Orion Stars "Session timeout" must not be treated as a network timeout retry.
  if (isProviderSessionTimeoutError(err)) return false;
  const code = err.code || (err.response && err.response.data && err.response.data.code);
  const message = (err.message || '').toLowerCase();
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EPIPE' ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    err.code === 'ECONNABORTED'
  );
}

/** True when axios/HTTP gave up waiting — the provider may already have applied the request. */
function isHttpTimeoutError(err) {
  if (!err || isProviderSessionTimeoutError(err)) return false;
  const code = err.code || (err.response && err.response.data && err.response.data.code);
  const message = String(err.message || '').toLowerCase();
  return (
    code === 'ETIMEDOUT' ||
    err.code === 'ECONNABORTED' ||
    message.includes('timeout of') ||
    message.includes('timed out')
  );
}

/**
 * Map provider/session errors to a safe end-user message (never expose "Session timeout").
 * Also hides transport timeout / rate-limit wording.
 */
function toUserFacingBotError(err) {
  if (!err) return err;
  if (err.isBotUnavailable === true) return err;
  if (isProviderSessionTimeoutError(err)) {
    return wrapBotUnavailableError(err);
  }
  // Agent/client session cannot be opened — treat like bot outage (manual queue + generic user message).
  if (isFailedToEstablishSessionError(err)) {
    return wrapBotUnavailableError(err);
  }
  const status = Number(err.statusCode || err.response?.status || 0);
  if (status === 429) {
    return wrapBotUnavailableError(err);
  }
  const message = String(err.message || '').toLowerCase();
  if (
    message.includes('rate limit')
    || message.includes('too many request')
    || message.includes('too many attempts')
    || message.includes('checked too often')
    || ((message.includes('timeout') || message.includes('timed out') || err.code === 'ECONNABORTED')
      && !isProviderSessionTimeoutError(err))
  ) {
    return wrapBotUnavailableError(err);
  }
  return err;
}

/**
 * True when the bot API returned success: false, message containing '403: Invalid or inactive API key', status 500.
 * Used to trigger generateKey + update botApiKey and retry the API once.
 * @param {Error} err - Error with optional externalResponse from bot API
 * @returns {boolean}
 */
function isInvalidApiKeyError(err) {
  if (!err) return false;
  const res = getBotExternalResponse(err);
  if (!res || typeof res !== 'object') return false;
  const msg = String(res.message || res.detail || res.error || '').trim();
  const status = res.status ?? err.statusCode ?? (err.response && err.response.status);
  return (
    res.success === false &&
    (msg.includes('403') && msg.toLowerCase().includes('invalid or inactive api key')) &&
    (status == null || status === 500)
  );
}

/**
 * True when provider reports: "Session expired and auto-recovery failed".
 * In this case we should refresh bot key (generate-key + DB update) and retry.
 * @param {Error} err - Error with optional externalResponse from bot API
 * @returns {boolean}
 */
function isSessionExpiredAutoRecoveryFailedError(err) {
  if (!err) return false;
  const res = getBotExternalResponse(err);
  let fromResponse = '';
  if (res && typeof res === 'object') {
    fromResponse = [res.message, res.detail, res.error]
      .filter((v) => typeof v === 'string')
      .join(' ');
  }
  const combined = [fromResponse, err.message]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' ')
    .toLowerCase();
  return combined.includes(SESSION_EXPIRED_AUTO_RECOVERY_FAILED_NEEDLE);
}

function isGoldenDragonDrawerMustBeFilledText(text) {
  if (!text) return false;
  const normalized = String(text).replace(/\s+/g, ' ').toLowerCase();
  if (!normalized.includes('drawer')) return false;
  return (
    normalized.includes('initial amount') ||
    normalized.includes('must filled') ||
    normalized.includes('must be filled') ||
    normalized.includes('must fill') ||
    ((normalized.includes('can not purchase') || normalized.includes('cannot purchase')) &&
      normalized.includes('drawer'))
  );
}

/**
 * Golden Dragon (and similar): player has entries but no redeemable winnings.
 * Business/user error — must not count as bot failure or switch to manual mode.
 */
function isNoWinningsAvailableToRedeemText(text) {
  if (!text) return false;
  const normalized = String(text).replace(/\s+/g, ' ').toLowerCase();
  return (
    normalized.includes('no winnings available to redeem')
    || normalized.includes('no winning available to redeem')
    || (normalized.includes('no winnings') && normalized.includes('redeem'))
    || (normalized.includes('no winning') && normalized.includes('redeem'))
    || (normalized.includes('winnings') && normalized.includes('not available') && normalized.includes('redeem'))
  );
}

/**
 * Check if the bot API error is Golden Dragon drawer/moneybox not configured.
 * @param {Error} err
 * @returns {{ isDrawerError: boolean, message?: string }}
 */
function getGoldenDragonDrawerErrorInfo(err) {
  if (!err) return { isDrawerError: false };
  const fromReason = getBotErrorReason(err);
  const fromProvider =
    err.providerBody != null ? extractMessageFromBotResponse(err.providerBody) : '';
  const fromMessage = err.message && String(err.message).trim() !== BOT_UNAVAILABLE_MESSAGE
    ? String(err.message).trim()
    : '';
  const message = (fromReason || fromProvider || fromMessage || '').trim();
  const isDrawerError = isGoldenDragonDrawerMustBeFilledText(message);
  return { isDrawerError, message: message || null };
}

/**
 * User-facing message when redeem is blocked because there are no winnings.
 * @param {Error} err
 * @returns {string|null}
 */
function getNoWinningsAvailableToRedeemMessage(err) {
  if (!err) return null;
  if (err.isNoWinningsAvailable === true) {
    const msg = String(err.message || '').trim();
    return msg || 'No winnings available to redeem';
  }
  const text = getBotErrorReason(err);
  if (!text || !isNoWinningsAvailableToRedeemText(text)) return null;
  // Prefer the provider wording when it is clear; otherwise use the canonical copy.
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (/no winnings available to redeem/i.test(normalized)) {
    return 'No winnings available to redeem';
  }
  return normalized.slice(0, 500);
}

function logBotApiAttempt(logContext, err, success) {
  if (!logContext) return;
  const httpStatus = err && (err.statusCode || (err.response && err.response.status));
  recordGameAutomationApiLog({
    gameId: logContext.gameId,
    gameName: logContext.gameName,
    storeCode: logContext.storeCode,
    gameUsername: logContext.gameUsername,
    operation: logContext.operation,
    apiEndpoint: logContext.apiEndpoint,
    httpStatus: httpStatus != null ? httpStatus : null,
    success: !!success,
    errorMessage: success ? null : getBotFailureLogReason(err)
  }).catch(() => {});

  if (!success && err && logContext.gameName) {
    const drawerInfo = getGoldenDragonDrawerErrorInfo(err);
    if (drawerInfo.isDrawerError) {
      const compact = String(logContext.gameName || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (compact === 'goldendragon' || compact === 'goldendragonnewbot' || compact === 'goldendragon2') {
        const { trySendGoldenDragonDrawerAlert } = require('../services/games/goldenDragonDrawerAlert.service');
        trySendGoldenDragonDrawerAlert({
          gameId: logContext.gameId,
          gameName: logContext.gameName,
          storeCode: logContext.storeCode,
          operation: logContext.operation,
          botMessage: drawerInfo.message
        }).catch(() => {});
      }
    }
  }
}

function wrapBotUnavailableError(originalErr) {
  const userErr = new Error(BOT_UNAVAILABLE_MESSAGE);
  userErr.statusCode = originalErr.statusCode || 503;
  userErr.isBotUnavailable = true;
  userErr.externalResponse = getBotExternalResponse(originalErr);
  userErr.code = originalErr.code;
  userErr.originalMessage = originalErr.message;
  return userErr;
}

/**
 * Run an async bot API call; on retryable errors (e.g. socket hang up) retry before giving up.
 * If the bot returns 403 Invalid or inactive API key, calls onInvalidApiKey (e.g. generateKey + update game),
 * then retries the API once. Preserves the last bot/transport response on failure for admin logging.
 * @param {() => Promise<T>} fn - Async function that performs the bot API call
 * @param {{ onInvalidApiKey?: () => Promise<void>, logContext?: object, retryOnTimeout?: boolean }} [options]
 * @returns {Promise<T>}
 */
async function withBotRetry(fn, options = {}) {
  const { onInvalidApiKey, logContext, retryOnTimeout = true } = options;
  let invalidKeyRefreshed = false;
  let lastErr = null;

  for (let attempt = 1; attempt <= BOT_API_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await fn();
      logBotApiAttempt(logContext, null, true);
      return result;
    } catch (err) {
      lastErr = err;
      logBotApiAttempt(logContext, err, false);
      const invalidApiKey = isInvalidApiKeyError(err);
      const sessionAutoRecoveryFailed = isSessionExpiredAutoRecoveryFailedError(err);
      if (
        (invalidApiKey || sessionAutoRecoveryFailed) &&
        onInvalidApiKey &&
        !invalidKeyRefreshed
      ) {
        const refreshReason = invalidApiKey
          ? 'invalid/inactive API key'
          : 'session expired and auto-recovery failed';
        console.info(`[botApiHelper] refreshing bot API key and retrying request (${refreshReason}).`);
        invalidKeyRefreshed = true;
        await onInvalidApiKey();
        try {
          const result = await fn();
          logBotApiAttempt(logContext, null, true);
          return result;
        } catch (retryErr) {
          lastErr = retryErr;
          logBotApiAttempt(logContext, retryErr, false);
          throw toUserFacingBotError(retryErr);
        }
      }
      // Credit/debit calls must not be re-sent after timeout; Juwa may already have applied them.
      if (!retryOnTimeout && isHttpTimeoutError(err)) {
        throw wrapBotUnavailableError(err);
      }
      const isLastAttempt = attempt === BOT_API_MAX_ATTEMPTS;
      if (isFailedToEstablishSessionError(err)) {
        if (!isLastAttempt) {
          await sleep(BOT_API_RETRY_DELAY_MS);
          continue;
        }
        throw toUserFacingBotError(err);
      }
      if (!isRetryableBotError(err)) {
        throw toUserFacingBotError(err);
      }
      if (isLastAttempt) {
        throw wrapBotUnavailableError(lastErr || err);
      }
      await sleep(BOT_API_RETRY_DELAY_MS);
    }
  }
}

/**
 * Check if the bot API error is balance-related (insufficient, low balance, etc.).
 * @param {Error} err - Error with optional externalResponse from bot API
 * @returns {{ isBalanceError: boolean, message?: string }}
 */
function getBotBalanceErrorInfo(err) {
  const res = getBotExternalResponse(err);
  if (!res || typeof res !== 'object') return { isBalanceError: false };

  const message = extractMessageFromBotResponse(res) || '';
  const lower = message.toLowerCase();

  const balanceKeywords = [
    'insufficient balance',
    'insufficient',
    'balance low',
    'low balance',
    'not enough balance',
    'not enougn balance',
    'balance enough'
  ];
  const isBalanceError = balanceKeywords.some((kw) => lower.includes(kw));

  return { isBalanceError, message: message || null };
}

/**
 * Provider/agent is out of credits (store-side), not the player's wallet.
 * These deposits should be queued as manual instead of shown as a user insufficient-balance error.
 */
function isAgentSideBalanceError(err) {
  if (!err) return false;
  if (err.isAgentBalanceError === true) return true;
  const text = `${err.message || ''} ${getBotBalanceErrorInfo(err).message || ''}`.toLowerCase();
  return text.includes('agent balance');
}

/**
 * True when the error is from a failed bot/agent API call (after retries or direct failure).
 * Use this to switch the game to manual mode and re-serve the request as manual
 * (deposit / redeem / register / withdraw).
 * Includes gateway timeouts (504), transport timeouts, and "Failed to establish session"
 * provider errors (agent login/session cannot be opened — treat as bot outage for the user op).
 * @param {Error} err
 * @returns {boolean}
 */
function isBotApiFailure(err) {
  if (!err) return false;
  // Business/user errors — never treat as bot outage / manual-mode trigger.
  if (err.isNoWinningsAvailable === true || getNoWinningsAvailableToRedeemMessage(err)) return false;
  if (err.isBotUnavailable === true) return true;
  // Provider cannot open agent/client session → queue manual for this user operation.
  if (isFailedToEstablishSessionError(err)) return true;
  const code = err.statusCode || (err.response && err.response.status);
  if (code === 502 || code === 503 || code === 504) return true;

  const transport = String(err.code || '');
  if (
    transport === 'ECONNABORTED' ||
    transport === 'ETIMEDOUT' ||
    transport === 'ECONNRESET' ||
    transport === 'ECONNREFUSED' ||
    transport === 'ENOTFOUND' ||
    transport === 'EPIPE'
  ) {
    return true;
  }

  // Axios/network timeout wording — exclude provider "Session timeout" business errors.
  if (isProviderSessionTimeoutError(err)) return false;
  const message = String(err.message || '').toLowerCase();
  if (message.includes('timeout exceeded') || message.includes('timeout of ')) return true;
  if (message.includes('gateway time') || message.includes('gateway timeout')) return true;
  return false;
}

/**
 * True for platform-side validation/business-rule errors (not bot API failures).
 * These must not count toward the manual-mode failure threshold.
 * @param {Error|{ message?: string, internalValidation?: boolean }} err
 * @returns {boolean}
 */
function isPlatformSideValidationError(err) {
  if (!err) return false;
  if (err.internalValidation === true) return true;
  if (isAbortedTransactionError(err)) return true;
  const msg = String(err.message || '').trim().toLowerCase();
  if (!msg) return false;
  if (msg.includes('minimum balance required to redeem') && msg.includes('last deposit')) {
    return true;
  }
  if (msg.includes('insufficient wallet balance for this deposit')) {
    return true;
  }
  if (msg.includes('requires a whole number amount') && msg.includes('integer sc')) {
    return true;
  }
  return false;
}

/**
 * True when a bot API error should count toward the manual-mode failure threshold.
 * Excludes insufficient balance, platform validation, and user-input / action-required errors.
 * @param {Error} err
 * @returns {boolean}
 */
function isRecordableBotAutomationFailure(err) {
  if (!err) return false;
  if (isAbortedTransactionError(err)) return false;
  if (isPlatformSideValidationError(err)) return false;
  if (err.isUserActionRequired === true) return false;
  if (err.isNoWinningsAvailable === true || getNoWinningsAvailableToRedeemMessage(err)) return false;
  if (getBotBalanceErrorInfo(err).isBalanceError) return false;
  if (getGoldenDragonDrawerErrorInfo(err).isDrawerError) return false;
  if (err.isSearchUserNotFound === true) return true;
  if (isFailedToEstablishSessionError(err)) return true;
  if (isBotApiFailure(err)) return true;
  if (getBotExternalResponse(err) != null) return true;
  return false;
}

/**
 * Extract a reason string from a bot API error for end-user display (short, sanitized).
 * @param {Error} err - Error from bot API call or withBotRetry
 * @returns {string|null}
 */
function getBotErrorReason(err) {
  if (!err) return null;
  const fromResponse = extractMessageFromBotResponse(getBotExternalResponse(err));
  if (fromResponse) return fromResponse.slice(0, 500);
  const msg = err.message && String(err.message).trim();
  if (msg && msg !== BOT_UNAVAILABLE_MESSAGE) return msg.slice(0, 500);
  return null;
}

/**
 * Extract the bot-side error for admin logs, bot failure logs, and manual mode logs.
 * Never returns platform custom fallback strings — only bot API or transport error text.
 * @param {Error} err
 * @returns {string|null}
 */
function getBotFailureLogReason(err) {
  if (!err) return null;
  const fromResponse = extractMessageFromBotResponse(getBotExternalResponse(err));
  if (fromResponse) return fromResponse.slice(0, 2000);
  const msg = err.message && String(err.message).trim();
  if (msg && msg !== BOT_UNAVAILABLE_MESSAGE) return msg.slice(0, 2000);
  if (err.originalMessage && String(err.originalMessage).trim() !== BOT_UNAVAILABLE_MESSAGE) {
    return String(err.originalMessage).trim().slice(0, 2000);
  }
  if (err.code) return String(err.code).slice(0, 2000);
  return null;
}

/**
 * Extract bot message intended for end-users when bot blocks the operation due to a required in-game choice.
 * Specifically handles the "Midnight Party" and "Wager Bonus" selection-required scenarios.
 * @param {Error} err
 * @returns {string|null} Exact message to show to user, or null if not applicable
 */
function getDepositBlockedByProgramSelectionMessage(err) {
  if (!err) return null;
  const text = getBotErrorReason(err);
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  const fullNeedles = [
    'players can only deposit again after selecting whether or not to participate in the midnight party program for the previous deposit',
    'players can only deposit again after selecting whether or not to participate in the wager bonus program for the previous deposit'
  ];
  if (fullNeedles.some((n) => normalized.includes(n))) return text;
  const needsSelection =
    normalized.includes('selecting') &&
    normalized.includes('previous deposit') &&
    (normalized.includes('wager bonus') || normalized.includes('midnight party'));
  return needsSelection ? text : null;
}

/**
 * Extract bot message when the player is actively in a game session and must return to the lobby
 * before top-up/redeem can proceed. Must not trigger manual mode.
 * @param {Error} err
 * @returns {string|null} Exact message to show to user, or null if not applicable
 */
function getPlayerInGameBlockedMessage(err) {
  if (!err) return null;
  const text = getBotErrorReason(err);
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  if (
    normalized.includes('player is still in the game') ||
    normalized.includes('return to the game lobby')
  ) {
    return text;
  }
  const purchaseBlocked =
    (normalized.includes('can not purchase') || normalized.includes('cannot purchase')) &&
    normalized.includes('customer is playing');
  return purchaseBlocked ? text : null;
}

/**
 * Extract bot message when Golden Dragon blocks the operation because the store drawer is not set.
 * @param {Error} err
 * @returns {string|null}
 */
function getGoldenDragonDrawerBlockedMessage(err) {
  const drawerInfo = getGoldenDragonDrawerErrorInfo(err);
  if (!drawerInfo.isDrawerError) return null;
  return "We're working on your request. Please try again in a moment.";
}

module.exports = {
  BOT_UNAVAILABLE_MESSAGE,
  BOT_API_MAX_ATTEMPTS,
  BOT_API_RETRY_DELAY_MS,
  captureBotApiResponse,
  getBotExternalResponse,
  extractMessageFromBotResponse,
  isRetryableBotError,
  isHttpTimeoutError,
  isProviderSessionTimeoutError,
  isInvalidApiKeyError,
  isFailedToEstablishSessionError,
  withBotRetry,
  toUserFacingBotError,
  getBotBalanceErrorInfo,
  isAgentSideBalanceError,
  isBotApiFailure,
  isPlatformSideValidationError,
  isRecordableBotAutomationFailure,
  getBotErrorReason,
  getBotFailureLogReason,
  getDepositBlockedByProgramSelectionMessage,
  getPlayerInGameBlockedMessage,
  getGoldenDragonDrawerErrorInfo,
  getGoldenDragonDrawerBlockedMessage,
  getNoWinningsAvailableToRedeemMessage
};
