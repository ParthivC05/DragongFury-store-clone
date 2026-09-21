'use strict';

const win568Service = require('../../services/win568');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');

/**
 * GET /api/win568/games
 */
async function getGames(req, res) {
  try {
    const data = await win568Service.getGamesList();
    sendSuccess(res, { ...data, enabled: true });
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch 568Win games', err.statusCode || 500);
  }
}

/**
 * POST /api/win568/launch
 * Body: { gpid?, gameid? } — omit both to open Games Lobby (gpid 10000, gameid 0).
 */
async function launchGame(req, res) {
  try {
    const data = await win568Service.launchGame(req);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to launch 568Win game', err.statusCode || 500, err.code || null);
  }
}

/**
 * GET /api/win568/status
 */
async function getStatus(req, res) {
  try {
    sendSuccess(res, {
      enabled: true,
      configured: win568Service.isWin568Configured(),
      launchConfigured: win568Service.isWin568LaunchConfigured()
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to read 568Win status', err.statusCode || 500);
  }
}

module.exports = { getGames, launchGame, getStatus };
