'use strict';

const { getGamesList, warmOneGameHubGamesCache } = require('./getGamesList.service');
const { launchGame } = require('./launchGame.service');
const { getRecentlyPlayed } = require('./getRecentlyPlayed.service');
const { handleCallback } = require('./callbacks');
const {
  isOneGameHubConfigured,
  isOneGameHubLaunchConfigured,
  getCallbackUrl,
  resolveOneGameHubConfig
} = require('./onegamehub.config');

module.exports = {
  getGamesList,
  launchGame,
  getRecentlyPlayed,
  handleCallback,
  isOneGameHubConfigured,
  isOneGameHubLaunchConfigured,
  getCallbackUrl,
  resolveOneGameHubConfig,
  warmOneGameHubGamesCache
};
