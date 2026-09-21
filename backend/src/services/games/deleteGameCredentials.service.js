'use strict';

const db = require('../../db/models');
const { recordUserGameCredentialHistory } = require('./recordUserGameCredentialHistory.service');

async function deleteSingleGameCredentials({ userId, accountId, performedByUserId, operationDoneBy }) {
  return db.sequelize.transaction(async (t) => {
    const account = await db.UserGameAccount.findOne({
      where: { id: accountId, userId },
      transaction: t
    });

    if (!account) {
      throw new Error('Game account not found');
    }

    const oldUsername = account.botUsername || '';
    const oldPassword = account.botPassword || '';

    if (!oldUsername && !oldPassword) {
      return { success: true, message: 'Credentials already cleared' };
    }

    // Set credentials to null
    await account.update({
      botUsername: null,
      botPassword: null
    }, { transaction: t });

    // Clear from manual requests if exist
    const { findApprovedRegisterManualRequest } = require('./manualRegisterCredentials.service');
    const manualReq = await findApprovedRegisterManualRequest(userId, account.gameId);
    if (manualReq) {
      await manualReq.update({
        gameUsername: null,
        gamePassword: null
      }, { transaction: t });
    }

    // Record history
    await recordUserGameCredentialHistory({
      userId,
      gameId: account.gameId,
      action: 'deleted',
      oldUsername,
      oldPassword,
      newUsername: null,
      newPassword: null,
      performedByUserId,
      operationDoneBy
    }, t);

    return { success: true };
  });
}

async function deleteAllGameCredentials({ userId, performedByUserId, operationDoneBy }) {
  return db.sequelize.transaction(async (t) => {
    const accounts = await db.UserGameAccount.findAll({
      where: { userId },
      transaction: t
    });

    if (!accounts || accounts.length === 0) {
      return { success: true, message: 'No game accounts found' };
    }

    for (const account of accounts) {
      const oldUsername = account.botUsername || '';
      const oldPassword = account.botPassword || '';

      if (!oldUsername && !oldPassword) {
        continue;
      }

      await account.update({
        botUsername: null,
        botPassword: null
      }, { transaction: t });

      const { findApprovedRegisterManualRequest } = require('./manualRegisterCredentials.service');
      const manualReq = await findApprovedRegisterManualRequest(userId, account.gameId);
      if (manualReq) {
        await manualReq.update({
          gameUsername: null,
          gamePassword: null
        }, { transaction: t });
      }

      await recordUserGameCredentialHistory({
        userId,
        gameId: account.gameId,
        action: 'deleted',
        oldUsername,
        oldPassword,
        newUsername: null,
        newPassword: null,
        performedByUserId,
        operationDoneBy
      }, t);
    }

    return { success: true };
  });
}

async function getGameCredentialsHistory(userId) {
  if (!db.UserGameCredentialHistory) return [];

  return db.UserGameCredentialHistory.findAll({
    where: { userId },
    include: [
      { model: db.Game, attributes: ['name'] },
      { model: db.User, as: 'PerformedByUser', attributes: ['username', 'role'] }
    ],
    order: [['created_at', 'DESC']]
  });
}

module.exports = {
  deleteSingleGameCredentials,
  deleteAllGameCredentials,
  getGameCredentialsHistory
};
