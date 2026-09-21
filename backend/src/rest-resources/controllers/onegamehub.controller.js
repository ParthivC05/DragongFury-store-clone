'use strict';

const onegamehubService = require('../../services/onegamehub');
const { filterOneGameHubUserGames } = require('../../constants/slotsCategoryGames');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const {
  isSlotProviderEnabled,
  assertSlotProviderEnabled
} = require('../../services/slotProviders/slotProvidersSettings.service');
const { resolveStoreCodeFromReq } = require('../../services/onegamehub/onegamehub.config');

async function getStatus(req, res) {
  try {
    const storeCode = resolveStoreCodeFromReq(req);
    const enabled = await isSlotProviderEnabled(req, 'onegamehub');
    const configured = enabled && onegamehubService.isOneGameHubConfigured(storeCode);
    sendSuccess(res, {
      enabled,
      configured,
      launchConfigured: enabled && onegamehubService.isOneGameHubLaunchConfigured(storeCode),
      currency: 'SC',
      callbackUrl: onegamehubService.getCallbackUrl()
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to read 1GameHub status', err.statusCode || 500);
  }
}

async function getGames(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'onegamehub');
    if (!enabled) {
      return sendSuccess(res, { games: [], enabled: false });
    }
    const data = await onegamehubService.getGamesList(resolveStoreCodeFromReq(req));
    sendSuccess(res, {
      ...data,
      games: filterOneGameHubUserGames(data?.games)
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to fetch 1GameHub games', err.statusCode || 500);
  }
}

async function launchGame(req, res) {
  try {
    await assertSlotProviderEnabled(req, 'onegamehub');
    const data = await onegamehubService.launchGame(req);
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to launch 1GameHub game', err.statusCode || 500, err.code || null);
  }
}

async function getRecentlyPlayed(req, res) {
  try {
    const enabled = await isSlotProviderEnabled(req, 'onegamehub');
    if (!enabled) {
      return sendSuccess(res, { games: [], enabled: false });
    }
    const userId = req.user && req.user.userId != null ? req.user.userId : null;
    if (!userId) {
      return sendError(res, 'Unauthorized', 401);
    }
    const data = await onegamehubService.getRecentlyPlayed({
      userId,
      limit: req.query?.limit
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load recently played games', err.statusCode || 500);
  }
}

module.exports = { getStatus, getGames, launchGame, getRecentlyPlayed };
