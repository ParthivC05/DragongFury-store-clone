'use strict';

const { getGamesList } = require('./getGamesList.service');
const { launchGame } = require('./launchGame.service');

module.exports = {
  getGamesList,
  launchGame
};
