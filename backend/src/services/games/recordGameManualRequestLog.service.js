'use strict';

const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');

const logger = createLogger('recordGameManualRequestLog');

/**
 * Record an audit log entry for manual register request approval or credential update.
 */
async function recordGameManualRequestLog(opts, transaction) {
  if (!db.GameManualRequestLog) return null;

  const {
    manualRequestId,
    userId,
    gameId,
    actionType,
    gameUsername,
    gamePassword,
    previousGameUsername,
    previousGamePassword,
    performedByUserId,
    operationDoneBy
  } = opts;

  try {
    return await db.GameManualRequestLog.create({
      manualRequestId,
      userId,
      gameId,
      actionType,
      gameUsername: gameUsername || null,
      gamePassword: gamePassword || null,
      previousGameUsername: previousGameUsername || null,
      previousGamePassword: previousGamePassword || null,
      performedByUserId: performedByUserId || null,
      operationDoneBy: operationDoneBy || null
    }, transaction ? { transaction } : undefined);
  } catch (err) {
    logger.warn({ err, manualRequestId, actionType }, 'Failed to record game manual request log');
    return null;
  }
}

module.exports = { recordGameManualRequestLog };
