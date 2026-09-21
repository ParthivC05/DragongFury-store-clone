'use strict';

const scorpioService = require('../../services/scorpioplay');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { filterScorpioUserGames } = require('../../constants/slotsCategoryGames');
const {
  isSlotProviderEnabled,
  assertSlotProviderEnabled
} = require('../../services/slotProviders/slotProvidersSettings.service');

/**
 * GET /api/scorpio/games
 */
async function getGames(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'scorpio');
    if (!enabled) {
      return sendSuccess(res, { games: [], providers: [], enabled: false });
    }
    const data = await scorpioService.getGamesList();
    sendSuccess(res, {
      ...data,
      games: filterScorpioUserGames(data?.games),
      enabled: true
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch Scorpio Play games', err.statusCode || 500);
  }
}

/**
 * POST /api/scorpio/launch
 * Body: { gameCode, providerId }
 */
async function launchGame(req, res) {
  try {
    await assertSlotProviderEnabled(req, 'scorpio');
    const data = await scorpioService.launchGame(req);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to launch Scorpio Play game', err.statusCode || 500, err.code || null);
  }
}

/**
 * GET /api/scorpio/status
 */
async function getStatus(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'scorpio');
    sendSuccess(res, {
      enabled,
      configured: enabled && scorpioService.isScorpioConfigured(),
      launchConfigured: enabled && scorpioService.isScorpioConfigured()
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to read Scorpio Play status', err.statusCode || 500);
  }
}

module.exports = { getGames, launchGame, getStatus };
