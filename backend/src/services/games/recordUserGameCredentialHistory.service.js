'use strict';

const db = require('../../db/models');

async function recordUserGameCredentialHistory({
  userId,
  gameId,
  action, // 'updated', 'deleted'
  oldUsername,
  oldPassword,
  newUsername,
  newPassword,
  performedByUserId,
  operationDoneBy
}, transaction) {
  if (!db.UserGameCredentialHistory) return null;

  return db.UserGameCredentialHistory.create({
    userId,
    gameId,
    action,
    oldUsername,
    oldPassword,
    newUsername,
    newPassword,
    performedByUserId,
    operationDoneBy
  }, { transaction });
}

module.exports = {
  recordUserGameCredentialHistory
};
