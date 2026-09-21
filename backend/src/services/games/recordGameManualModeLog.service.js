'use strict';

const db = require('../../db/models');
const { logger } = require('../../libs/logger');
const { extractMessageFromBotResponse } = require('../../utils/botApiHelper');

function storeCodeToDisplayName(storeCode) {
  if (!storeCode || typeof storeCode !== 'string') return null;
  const s = String(storeCode).trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatExternalResponseForLog(externalResponse) {
  if (externalResponse == null || externalResponse === '') return null;
  if (typeof externalResponse === 'object') {
    try {
      return JSON.stringify(externalResponse, null, 2);
    } catch {
      return String(externalResponse);
    }
  }
  return String(externalResponse);
}

/**
 * Build a readable multi-line block for one bot failure shown in the admin manual logs table.
 */
function formatAutomationApiError({
  reasonSummary,
  operationType,
  gameUsername,
  externalResponse
} = {}) {
  const lines = [];
  const botMessage =
    (reasonSummary && String(reasonSummary).trim()) ||
    extractMessageFromBotResponse(externalResponse);
  if (botMessage) lines.push(`Bot error: ${botMessage}`);
  if (operationType) lines.push(`Operation: ${operationType}`);
  if (gameUsername) lines.push(`Game user: ${gameUsername}`);
  const responseText = formatExternalResponseForLog(externalResponse);
  if (responseText) {
    lines.push('API response:');
    lines.push(responseText);
  }
  return lines.length > 0 ? lines.join('\n') : null;
}

function formatOccurredAt(occurredAt) {
  if (!occurredAt) return '';
  const d = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Build admin log text for multiple bot failures that triggered manual mode.
 * @param {Array<{ platformUserId?: number, operationType?: string, reasonSummary?: string, gameUsername?: string, externalResponse?: *, occurredAt?: Date|string }>} failures
 * @returns {string|null}
 */
function formatAutomationApiErrors(failures = []) {
  if (!Array.isArray(failures) || failures.length === 0) return null;

  return failures
    .map((failure, index) => {
      const body = formatAutomationApiError({
        reasonSummary: failure.reasonSummary,
        operationType: failure.operationType,
        gameUsername: failure.gameUsername,
        externalResponse: failure.externalResponse
      });
      const header = `── Failure ${index + 1} ──`;
      const meta = [];
      if (failure.platformUserId != null) meta.push(`Platform user ID: ${failure.platformUserId}`);
      const timePart = formatOccurredAt(failure.occurredAt);
      if (timePart) meta.push(`Time: ${timePart}`);
      return [header, ...meta, body].filter(Boolean).join('\n');
    })
    .join('\n\n');
}

/**
 * Record a log row when a game transitions between automated and manual mode.
 * @param {{
 *   game: { id: number, name?: string, botUsername?: string, botPassword?: string, addedByStoreCode?: string },
 *   automationApiError?: string|null,
 *   switchedByUserId?: number|null,
 *   switchedByName?: string|null,
 *   triggerSource: 'automation_failure'|'admin_panel'
 * }} opts
 */
async function recordGameManualModeLog(opts) {
  const { game, automationApiError, switchedByUserId, switchedByName, triggerSource } = opts;
  if (!game?.id) return;

  try {
    const storeCode =
      game.addedByStoreCode != null && String(game.addedByStoreCode).trim()
        ? String(game.addedByStoreCode).trim()
        : null;

    await db.GameManualModeLog.create({
      gameId: game.id,
      gameName: game.name || null,
      storeCode,
      gameStoreUsername: game.botUsername || null,
      gameStorePassword: game.botPassword || null,
      automationApiError: automationApiError || null,
      switchedByUserId: switchedByUserId ?? null,
      switchedByName: switchedByName || null,
      triggerSource: triggerSource || 'automation_failure',
      createdAt: new Date()
    });
  } catch (err) {
    logger.error({ err, gameId: game.id }, 'Failed to record game manual mode log');
  }
}

module.exports = {
  storeCodeToDisplayName,
  formatAutomationApiError,
  formatAutomationApiErrors,
  recordGameManualModeLog
};
