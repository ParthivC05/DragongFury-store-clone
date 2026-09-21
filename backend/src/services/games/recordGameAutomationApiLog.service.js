'use strict';

const db = require('../../db/models');

/**
 * Persist a third-party bot API call attempt. Fire-and-forget; never throws to callers.
 * @param {object} params
 * @param {number} params.gameId
 * @param {string} [params.gameName]
 * @param {string} [params.storeCode]
 * @param {string} [params.gameUsername]
 * @param {string} params.operation - deposit, redeem, register, balance, etc.
 * @param {string} [params.apiEndpoint]
 * @param {number} [params.httpStatus]
 * @param {boolean} params.success
 * @param {string} [params.errorMessage]
 */
async function recordGameAutomationApiLog({
  gameId,
  gameName = null,
  storeCode = null,
  gameUsername = null,
  operation,
  apiEndpoint = null,
  httpStatus = null,
  success,
  errorMessage = null
} = {}) {
  if (!gameId || !operation) return;
  if (!db.GameAutomationApiLog) return;

  const safeMessage = errorMessage != null ? String(errorMessage).slice(0, 2000) : null;
  const safeEndpoint = apiEndpoint != null ? String(apiEndpoint).slice(0, 256) : null;

  try {
    await db.GameAutomationApiLog.create({
      gameId,
      gameName: gameName != null ? String(gameName).slice(0, 128) : null,
      storeCode: storeCode != null ? String(storeCode).slice(0, 64) : null,
      gameUsername: gameUsername != null ? String(gameUsername).slice(0, 128) : null,
      operation: String(operation).slice(0, 32),
      apiEndpoint: safeEndpoint,
      httpStatus: httpStatus != null && !Number.isNaN(Number(httpStatus)) ? Number(httpStatus) : null,
      success: !!success,
      errorMessage: safeMessage,
      createdAt: new Date()
    });
  } catch (err) {
    console.error('[recordGameAutomationApiLog]', err.message);
  }
}

module.exports = { recordGameAutomationApiLog };
