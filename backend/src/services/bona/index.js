'use strict';

const { getGamesList } = require('./getGamesList.service');
const { launchGame } = require('./launchGame.service');
const { settleSession } = require('./settleSession.service');
const { syncUserGameRecords } = require('./syncGameRecords.service');
const { isBonaConfigured, isBonaLaunchConfigured, resolveBonaConfig } = require('./bona.config');

module.exports = {
  getGamesList,
  launchGame,
  settleSession,
  syncUserGameRecords,
  isBonaConfigured,
  isBonaLaunchConfigured,
  resolveBonaConfig
};
