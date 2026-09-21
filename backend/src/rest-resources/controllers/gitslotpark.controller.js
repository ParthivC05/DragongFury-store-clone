'use strict';

const gitslotparkService = require('../../services/gitslotpark');
const { getRecentlyPlayedSlots } = require('../../services/gitslotpark/getRecentlyPlayedSlots.service');
const {
  filterGitslotparkUserGames,
  filterGitslotparkRecentlyPlayed
} = require('../../constants/slotsCategoryGames');
const { resolveGitslotparkConfig } = require('../../services/gitslotpark/gitslotpark.config');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const {
  isSlotProviderEnabled,
  assertSlotProviderEnabled
} = require('../../services/slotProviders/slotProvidersSettings.service');

/**
 * GET /api/gitslotpark/games
 * Proxy GitSlotPark game catalog. Credentials: per-store backend env
 * (GIT_SLOTPARK_*_{STORECODE}), then request headers, then unsuffixed GIT_SLOTPARK_*.
 */
async function getGames(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'gitslotpark');
    if (!enabled) {
      return sendSuccess(res, { games: [], enabled: false });
    }
    const data = await gitslotparkService.getGamesList(req);
    const { provider } = resolveGitslotparkConfig(req);
    sendSuccess(res, {
      ...data,
      games: filterGitslotparkUserGames(data?.games, provider)
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch GitSlotPark games', err.statusCode || 500);
  }
}

/**
 * POST /api/gitslotpark/launch
 * Body: { gameid: number }
 */
async function launchGame(req, res) {
  try {
    await assertSlotProviderEnabled(req, 'gitslotpark');
    const data = await gitslotparkService.launchGame(req);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to launch GitSlotPark game', err.statusCode || 500, err.code || null);
  }
}

/**
 * GET /api/gitslotpark/recently-played
 * Distinct slot games the authenticated user has bet on (from gitslotpark_transactions).
 */
async function getRecentlyPlayed(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'gitslotpark');
    if (!enabled) {
      return sendSuccess(res, { games: [], enabled: false });
    }
    const userId = req.user && req.user.userId != null ? req.user.userId : null;
    if (!userId) {
      return sendError(res, 'Unauthorized', 401);
    }
    const data = await getRecentlyPlayedSlots({
      userId,
      limit: req.query?.limit
    });
    sendSuccess(res, {
      ...data,
      games: filterGitslotparkRecentlyPlayed(data?.games)
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to load recently played games', err.statusCode || 500);
  }
}

module.exports = { getGames, launchGame, getRecentlyPlayed };
