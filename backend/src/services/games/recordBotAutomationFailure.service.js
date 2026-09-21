'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { logger } = require('../../libs/logger');
const {
  getBotFailureLogReason,
  getBotExternalResponse,
  isPlatformSideValidationError
} = require('../../utils/botApiHelper');
const { isAbortedTransactionError } = require('../../utils/pgErrors');
const { switchGameToManualMode } = require('./switchGameToManualMode.service');
const { serializeExternalResponse } = require('./getGameBotAutomationFailureLogs.service');

/** Distinct users with bot errors within this window required before switching to manual. */
const BOT_AUTOMATION_FAILURE_THRESHOLD = 3;
const BOT_AUTOMATION_FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Bot operations that count toward the manual-mode failure threshold (deposit, redeem, register only). */
const MANUAL_MODE_THRESHOLD_OPERATION_TYPES = new Set(['topup', 'redeem', 'register']);
const MANUAL_MODE_THRESHOLD_OPERATION_TYPE_LIST = [...MANUAL_MODE_THRESHOLD_OPERATION_TYPES];

function normalizeStoreCode(storeCode) {
  if (storeCode == null) return '';
  const s = String(storeCode).trim();
  return s || '';
}

async function appendBotAutomationFailureLog(opts) {
  if (!db.GameBotAutomationFailureLog) return;
  const {
    gameId,
    gameName,
    platformUserId,
    storeCode,
    operationType,
    reasonSummary,
    gameUsername,
    externalResponse
  } = opts;
  try {
    await db.GameBotAutomationFailureLog.create({
      gameId,
      gameName: gameName || null,
      storeCode: normalizeStoreCode(storeCode),
      platformUserId,
      operationType: operationType || null,
      errorSummary: reasonSummary || null,
      gameUsername: gameUsername || null,
      externalResponse: serializeExternalResponse(externalResponse),
      createdAt: new Date()
    });
  } catch (err) {
    logger.error({ err, gameId, platformUserId }, 'Failed to append bot automation failure log');
  }
}

function resolveBotFailureFields(opts) {
  const { reasonSummary, externalResponse, error } = opts;
  const resolvedExternalResponse =
    externalResponse != null ? externalResponse : error ? getBotExternalResponse(error) : null;
  const resolvedReasonSummary =
    reasonSummary || (error ? getBotFailureLogReason(error) : null);
  return { resolvedReasonSummary, resolvedExternalResponse };
}

function getFailureWindowStart(now = new Date()) {
  return new Date(now.getTime() - BOT_AUTOMATION_FAILURE_WINDOW_MS);
}

async function getRecentThresholdFailures(gameId, storeCode, since) {
  if (!db.GameBotAutomationFailureLog) return [];
  return db.GameBotAutomationFailureLog.findAll({
    where: {
      gameId,
      storeCode: normalizeStoreCode(storeCode),
      operationType: { [Op.in]: MANUAL_MODE_THRESHOLD_OPERATION_TYPE_LIST },
      createdAt: { [Op.gte]: since }
    },
    order: [['createdAt', 'ASC']]
  });
}

function parseExternalResponse(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function mapFailureLogToDetail(row) {
  const json = row.toJSON ? row.toJSON() : row;
  return {
    platformUserId: json.platformUserId,
    operationType: json.operationType,
    reasonSummary: json.errorSummary,
    gameUsername: json.gameUsername,
    externalResponse: parseExternalResponse(json.externalResponse),
    occurredAt: json.createdAt
  };
}

/** Latest failure log per distinct platform user (same user failing multiple times counts once). */
function getLatestFailurePerDistinctUser(failures) {
  const byUser = new Map();
  for (const row of failures) {
    const json = row.toJSON ? row.toJSON() : row;
    const userId = json.platformUserId;
    const existing = byUser.get(userId);
    if (!existing) {
      byUser.set(userId, row);
      continue;
    }
    const existingAt = existing.toJSON ? existing.toJSON().createdAt : existing.createdAt;
    if (new Date(json.createdAt) > new Date(existingAt)) {
      byUser.set(userId, row);
    }
  }
  return [...byUser.values()].sort((a, b) => {
    const aAt = a.toJSON ? a.toJSON().createdAt : a.createdAt;
    const bAt = b.toJSON ? b.toJSON().createdAt : b.createdAt;
    return new Date(aAt) - new Date(bAt);
  });
}

/**
 * Record a bot automation failure for a platform user. Switches the game to manual
 * when 3 different users hit deposit/redeem/register failures within 24 hours (same game + store).
 * Repeated failures by the same user count as one. Insufficient-balance errors must be excluded by the caller.
 *
 * @returns {Promise<{ switched: boolean, failureCountInWindow: number, distinctUserCount: number }>}
 */
async function recordBotAutomationFailure(opts) {
  const {
    gameId,
    platformUserId,
    storeCode,
    operationType,
    gameUsername,
    gameName
  } = opts;
  const { resolvedReasonSummary, resolvedExternalResponse } = resolveBotFailureFields(opts);
  const { error } = opts;

  if (!gameId || !platformUserId) {
    return { switched: false, failureCountInWindow: 0, distinctUserCount: 0 };
  }

  if (isAbortedTransactionError(error) || isAbortedTransactionError({ message: resolvedReasonSummary })) {
    return { switched: false, failureCountInWindow: 0, distinctUserCount: 0 };
  }

  if (isPlatformSideValidationError(error) || isPlatformSideValidationError({ message: resolvedReasonSummary })) {
    return { switched: false, failureCountInWindow: 0, distinctUserCount: 0 };
  }

  const reasonLower = String(resolvedReasonSummary || '').toLowerCase();
  if (
    reasonLower.includes('no winnings available to redeem')
    || (reasonLower.includes('no winnings') && reasonLower.includes('redeem'))
    || (error && (error.isNoWinningsAvailable === true || error.isUserActionRequired === true))
  ) {
    return { switched: false, failureCountInWindow: 0, distinctUserCount: 0 };
  }

  if (!MANUAL_MODE_THRESHOLD_OPERATION_TYPES.has(operationType)) {
    return { switched: false, failureCountInWindow: 0, distinctUserCount: 0 };
  }

  const normalizedStoreCode = normalizeStoreCode(storeCode);
  const now = new Date();
  const windowStart = getFailureWindowStart(now);

  try {
    await appendBotAutomationFailureLog({
      gameId,
      gameName,
      platformUserId,
      storeCode,
      operationType,
      reasonSummary: resolvedReasonSummary,
      gameUsername,
      externalResponse: resolvedExternalResponse
    });

    const recentFailures = await getRecentThresholdFailures(gameId, normalizedStoreCode, windowStart);
    const failureCountInWindow = recentFailures.length;
    const distinctUserFailures = getLatestFailurePerDistinctUser(recentFailures);
    const distinctUserCount = distinctUserFailures.length;

    if (distinctUserCount < BOT_AUTOMATION_FAILURE_THRESHOLD) {
      return { switched: false, failureCountInWindow, distinctUserCount };
    }

    const failureDetails = distinctUserFailures.map(mapFailureLogToDetail);

    await switchGameToManualMode({
      gameId,
      gameName,
      failureDetails,
      reasonSummary: `Automation failed for ${BOT_AUTOMATION_FAILURE_THRESHOLD} different users within 24 hours on this game (deposit, redeem, or register).`
    });

    return { switched: true, failureCountInWindow, distinctUserCount };
  } catch (err) {
    logger.error({ err, gameId, platformUserId }, 'Failed to record bot automation failure');
    return { switched: false, failureCountInWindow: 0, distinctUserCount: 0 };
  }
}

/** Clear legacy per-user failure rows when automation is re-enabled for a game. */
async function clearGameBotAutomationFailures(gameId) {
  if (!gameId) return;
  try {
    await db.GameBotAutomationFailure.destroy({ where: { gameId } });
  } catch (err) {
    logger.error({ err, gameId }, 'Failed to clear bot automation failures');
  }
}

module.exports = {
  BOT_AUTOMATION_FAILURE_THRESHOLD,
  BOT_AUTOMATION_FAILURE_WINDOW_MS,
  MANUAL_MODE_THRESHOLD_OPERATION_TYPES,
  normalizeStoreCode,
  recordBotAutomationFailure,
  clearGameBotAutomationFailures
};
