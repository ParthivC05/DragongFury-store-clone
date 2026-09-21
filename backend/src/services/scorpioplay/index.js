'use strict';

const { getGamesList } = require('./getGamesList.service');
const { launchGame } = require('./launchGame.service');
const { isScorpioConfigured, resolveScorpioConfig } = require('./scorpio.config');
const { handleCallback } = require('./scorpioCallbacks.service');

module.exports = {
  getGamesList,
  launchGame,
  isScorpioConfigured,
  resolveScorpioConfig,
  handleCallback
};
