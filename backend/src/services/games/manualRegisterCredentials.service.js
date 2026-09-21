'use strict';

const db = require('../../db/models');
const { recordGameManualRequestLog } = require('./recordGameManualRequestLog.service');
const { recordUserGameCredentialHistory } = require('./recordUserGameCredentialHistory.service');
const {
  assertGameUsernameAvailable,
  rethrowGameUsernameConflict
} = require('./assertGameUsernameAvailable.service');

/**
 * Latest approved register manual request for a user + game pair.
 */
async function findApprovedRegisterManualRequest(userId, gameId) {
  return db.GameManualRequest.findOne({
    where: {
      userId,
      gameId,
      requestType: 'register',
      status: 'approved'
    },
    order: [[db.sequelize.col('resolved_at'), 'DESC NULLS LAST'], [db.sequelize.col('created_at'), 'DESC']]
  });
}

async function getManualRegisterCredentials(manualReq) {
  let gameUsername = manualReq.gameUsername || '';
  let gamePassword = manualReq.gamePassword || '';

  if (!gameUsername || !gamePassword) {
    const account = await db.UserGameAccount.findOne({
      where: { userId: manualReq.userId, gameId: manualReq.gameId },
      attributes: ['botUsername', 'botPassword']
    });
    if (account) {
      gameUsername = gameUsername || account.botUsername || '';
      gamePassword = gamePassword || account.botPassword || '';
    }
  }

  return { game_username: gameUsername, game_password: gamePassword };
}

async function updateManualRegisterCredentials(manualReq, {
  gameUsername,
  gamePassword,
  performedByUserId,
  operationDoneBy
}) {
  let previousGameUsername = manualReq.gameUsername || '';
  let previousGamePassword = manualReq.gamePassword || '';

  if (!previousGameUsername || !previousGamePassword) {
    const existingAccount = await db.UserGameAccount.findOne({
      where: { userId: manualReq.userId, gameId: manualReq.gameId },
      attributes: ['botUsername', 'botPassword']
    });
    if (existingAccount) {
      previousGameUsername = previousGameUsername || existingAccount.botUsername || '';
      previousGamePassword = previousGamePassword || existingAccount.botPassword || '';
    }
  }

  await assertGameUsernameAvailable(manualReq.gameId, gameUsername, manualReq.userId, {
    gameName: manualReq.Game?.name
  });

  try {
    await db.sequelize.transaction(async (t) => {
      await assertGameUsernameAvailable(manualReq.gameId, gameUsername, manualReq.userId, {
        gameName: manualReq.Game?.name,
        transaction: t
      });

      const account = await db.UserGameAccount.findOne({
        where: { userId: manualReq.userId, gameId: manualReq.gameId },
        transaction: t
      });

      if (account) {
        await account.update({
          botUsername: gameUsername,
          botPassword: gamePassword
        }, { transaction: t });
      } else {
        await db.UserGameAccount.create({
          userId: manualReq.userId,
          gameId: manualReq.gameId,
          botUsername: gameUsername,
          botPassword: gamePassword,
          status: 'active',
          operationDoneBy: manualReq.operationDoneBy || operationDoneBy
        }, { transaction: t });
      }

      await manualReq.update({
        gameUsername,
        gamePassword
      }, { transaction: t });

      await recordGameManualRequestLog({
        manualRequestId: manualReq.id,
        userId: manualReq.userId,
        gameId: manualReq.gameId,
        actionType: 'credentials_updated',
        gameUsername,
        gamePassword,
        previousGameUsername,
        previousGamePassword,
        performedByUserId,
        operationDoneBy
      }, t);

      await recordUserGameCredentialHistory({
        userId: manualReq.userId,
        gameId: manualReq.gameId,
        action: 'updated',
        oldUsername: previousGameUsername,
        oldPassword: previousGamePassword,
        newUsername: gameUsername,
        newPassword: gamePassword,
        performedByUserId,
        operationDoneBy
      }, t);
    });
  } catch (err) {
    rethrowGameUsernameConflict(err, manualReq.Game?.name);
  }

  return { gameUsername };
}

async function listManualRegisterCredentialLogs(manualRequestId) {
  if (!db.GameManualRequestLog) return [];

  const rows = await db.GameManualRequestLog.findAll({
    where: { manualRequestId },
    include: [
      { model: db.User, as: 'PerformedByUser', attributes: ['userId', 'username', 'role'] }
    ],
    order: [[db.sequelize.col('GameManualRequestLog.created_at'), 'DESC']]
  });

  return rows.map((row) => {
    const j = row.toJSON();
    j.performedByUsername = j.PerformedByUser?.username || null;
    delete j.PerformedByUser;
    delete j.gamePassword;
    delete j.previousGamePassword;
    return j;
  });
}

module.exports = {
  findApprovedRegisterManualRequest,
  getManualRegisterCredentials,
  updateManualRegisterCredentials,
  listManualRegisterCredentialLogs
};
