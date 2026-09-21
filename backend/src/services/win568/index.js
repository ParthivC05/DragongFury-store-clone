'use strict';

const { getGamesList } = require('./getGamesList.service');
const { launchGame } = require('./launchGame.service');
const {
  isWin568Configured,
  isWin568OperatorConfigured,
  isWin568LaunchConfigured,
  resolveWin568Config
} = require('./win568.config');

module.exports = {
  getGamesList,
  launchGame,
  isWin568Configured,
  isWin568OperatorConfigured,
  isWin568LaunchConfigured,
  resolveWin568Config
};
