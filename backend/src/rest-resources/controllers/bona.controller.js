'use strict';

const bonaService = require('../../services/bona');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const {
  isSlotProviderEnabled,
  assertSlotProviderEnabled
} = require('../../services/slotProviders/slotProvidersSettings.service');

/**
 * GET /api/bona/games
 */
async function getGames(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'bona');
    if (!enabled) {
      return sendSuccess(res, { games: [], enabled: false });
    }
    const data = await bonaService.getGamesList(req.query || {});
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch Bona games', err.statusCode || 500);
  }
}

/**
 * POST /api/bona/launch
 * Body: { gameid: number }
 */
async function launchGame(req, res) {
  try {
    await assertSlotProviderEnabled(req, 'bona');
    const data = await bonaService.launchGame(req);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to launch Bona game', err.statusCode || 500, err.code || null);
  }
}

/**
 * POST /api/bona/settle
 * Withdraw remaining Bona wallet + sync bet records.
 */
async function settleSession(req, res) {
  try {
    await assertSlotProviderEnabled(req, 'bona');
    const data = await bonaService.settleSession(req);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to settle Bona session', err.statusCode || 500, err.code || null);
  }
}

/**
 * GET /api/bona/status
 */
async function getStatus(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'bona');
    sendSuccess(res, {
      enabled,
      configured: enabled && bonaService.isBonaConfigured(),
      launchConfigured: enabled && bonaService.isBonaLaunchConfigured(),
      currency: bonaService.resolveBonaConfig().currency
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to read Bona status', err.statusCode || 500);
  }
}

module.exports = { getGames, launchGame, settleSession, getStatus };
