'use strict';

const db = require('../../../db/models');
const {
  listGitslotparkCallbackConfigsByAgentId,
  resolveGitslotparkCallbackConfigByAgentIdAndSign,
  isGitslotparkCallbackConfigured
} = require('../gitslotpark.config');
const {
  buildGetBalanceSignMessage,
  buildBetWinSignMessage,
  buildWithdrawSignMessage,
  buildDepositSignMessage,
  buildRollbackSignMessage,
  formatBalance,
  newPlatformTransactionId
} = require('../gitslotparkSign.helpers');
const {
  RESULT,
  errorPayload,
  successPayload,
  parseCallbackBody
} = require('./gitslotparkCallback.helpers');
const { resolveUserIdFromGitslotparkUserId } = require('./resolveGitslotparkUser.service');
const {
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta
} = require('./gitslotparkCallbackWallet.service');
const { canUserPlayGames } = require('../../games/gamePlayEligibility.service');

function validateConfigured() {
  if (!isGitslotparkCallbackConfigured()) {
    return errorPayload(RESULT.GENERAL, 'GitSlotPark callbacks are not configured');
  }
  return null;
}

function validateAgent(agentID) {
  if (!listGitslotparkCallbackConfigsByAgentId(agentID).length) {
    return errorPayload(RESULT.INVALID_AGENT, 'Invalid agent id');
  }
  return null;
}

function validateSign(signMessage, sign, agentID) {
  if (!resolveGitslotparkCallbackConfigByAgentIdAndSign(agentID, signMessage, sign)) {
    return errorPayload(RESULT.INVALID_SIGN, 'Invalid sign');
  }
  return null;
}

async function resolveUser(userID) {
  const userId = await resolveUserIdFromGitslotparkUserId(userID);
  if (!userId) {
    return { error: errorPayload(RESULT.USER_NOT_FOUND, 'Cannot find specified user id') };
  }
  return { userId };
}

async function findTransaction(transactionID) {
  if (!db.GitslotparkTransaction) return null;
  return db.GitslotparkTransaction.findOne({ where: { transactionId: transactionID } });
}

async function recordTransaction(record, transaction) {
  if (!db.GitslotparkTransaction) return;
  await db.GitslotparkTransaction.create(record, { transaction });
}

async function getBalanceCallback(body) {
  const configError = validateConfigured();
  if (configError) return configError;

  const parsed = parseCallbackBody(body);
  const { agentID, sign, userID, gameID } = parsed;

  if (!agentID || !sign || !userID || !gameID) {
    return errorPayload(RESULT.INVALID_PARAMS, 'Missing required parameters');
  }

  const agentError = validateAgent(agentID);
  if (agentError) return agentError;

  const signError = validateSign(buildGetBalanceSignMessage(agentID, userID, gameID), sign, agentID);
  if (signError) return signError;

  const userResult = await resolveUser(userID);
  if (userResult.error) return userResult.error;

  const balance = await getPlayableBalance(userResult.userId);
  return successPayload({ balance });
}

async function processWalletMutation(body, options) {
  const configError = validateConfigured();
  if (configError) return configError;

  const parsed = parseCallbackBody(body);
  const agentError = validateAgent(parsed.agentID);
  if (agentError) return agentError;

  const signError = validateSign(options.buildSignMessage(parsed), parsed.sign, parsed.agentID);
  if (signError) return signError;

  const validationError = options.validate(parsed);
  if (validationError) return validationError;

  const userResult = await resolveUser(parsed.userID);
  if (userResult.error) return userResult.error;

  const requiresDeposit = ['withdraw', 'betwin', 'deposit'].includes(options.operation);
  if (requiresDeposit) {
    const canPlay = await canUserPlayGames(userResult.userId);
    if (!canPlay) {
      return errorPayload(RESULT.INSUFFICIENT_FUNDS, 'Deposit required to play');
    }
  }

  const existing = await findTransaction(parsed.transactionID);
  if (existing) {
    return errorPayload(RESULT.DUPLICATE, 'Duplicate transaction', {
      platformTransactionID: existing.platformTransactionId,
      balance: formatBalance(existing.balanceAfter)
    });
  }

  try {
    return await db.sequelize.transaction(async (t) => {
      const applyOptions = options.getApplyOptions ? options.getApplyOptions(parsed) : undefined;
      const balanceAfter = await applyBalanceDelta(
        userResult.userId,
        options.getDelta(parsed),
        options.userTransactionMeta(parsed),
        t,
        applyOptions
      );

      const platformTransactionId = newPlatformTransactionId();
      await recordTransaction(
        {
          transactionId: parsed.transactionID,
          refTransactionId: parsed.refTransactionID || null,
          platformTransactionId,
          userId: userResult.userId,
          operation: options.operation,
          amount: formatBalance(Math.abs(options.getDelta(parsed))),
          betAmount: parsed.betAmount != null ? formatBalance(parsed.betAmount) : null,
          winAmount: parsed.winAmount != null ? formatBalance(parsed.winAmount) : null,
          balanceAfter,
          gameId: parsed.gameID,
          roundId: parsed.roundID || null,
          status: 'completed'
        },
        t
      );

      return successPayload({
        platformTransactionID: platformTransactionId,
        balance: balanceAfter
      });
    });
  } catch (err) {
    if (err.code === RESULT.INSUFFICIENT_FUNDS) {
      return errorPayload(RESULT.INSUFFICIENT_FUNDS, 'Insufficient funds');
    }
    throw err;
  }
}

async function withdrawCallback(body) {
  return processWalletMutation(body, {
    operation: 'withdraw',
    buildSignMessage: (parsed) =>
      buildWithdrawSignMessage(
        parsed.agentID,
        parsed.userID,
        parsed.amount,
        parsed.transactionID,
        parsed.roundID,
        parsed.gameID
      ),
    validate: (parsed) => {
      if (!parsed.sign || !parsed.userID || !parsed.transactionID || !parsed.roundID || !parsed.gameID) {
        return errorPayload(RESULT.INVALID_PARAMS, 'Missing required parameters');
      }
      if (parsed.amount == null || parsed.amount < 0) {
        return errorPayload(RESULT.INVALID_PARAMS, 'Invalid amount');
      }
      return null;
    },
    getDelta: (parsed) => -formatBalance(parsed.amount),
    userTransactionMeta: (parsed) => ({
      type: 'gitslotpark_withdraw',
      description: `GitSlotPark withdraw ${parsed.transactionID}`,
      metadata: {
        transactionId: parsed.transactionID,
        roundId: parsed.roundID,
        gameId: parsed.gameID
      }
    })
  });
}

async function depositCallback(body) {
  return processWalletMutation(body, {
    operation: 'deposit',
    buildSignMessage: (parsed) =>
      buildDepositSignMessage(
        parsed.agentID,
        parsed.userID,
        parsed.amount,
        parsed.refTransactionID,
        parsed.transactionID,
        parsed.roundID,
        parsed.gameID
      ),
    validate: (parsed) => {
      if (
        !parsed.sign ||
        !parsed.userID ||
        !parsed.refTransactionID ||
        !parsed.transactionID ||
        !parsed.roundID ||
        !parsed.gameID
      ) {
        return errorPayload(RESULT.INVALID_PARAMS, 'Missing required parameters');
      }
      if (parsed.amount == null || parsed.amount < 0) {
        return errorPayload(RESULT.INVALID_PARAMS, 'Invalid amount');
      }
      return null;
    },
    getDelta: (parsed) => formatBalance(parsed.amount),
    userTransactionMeta: (parsed) => ({
      type: 'gitslotpark_deposit',
      description: `GitSlotPark deposit ${parsed.transactionID}`,
      metadata: {
        transactionId: parsed.transactionID,
        refTransactionId: parsed.refTransactionID,
        roundId: parsed.roundID,
        gameId: parsed.gameID
      }
    })
  });
}

async function betWinCallback(body) {
  return processWalletMutation(body, {
    operation: 'betwin',
    buildSignMessage: (parsed) =>
      buildBetWinSignMessage(
        parsed.agentID,
        parsed.userID,
        parsed.betAmount,
        parsed.winAmount,
        parsed.transactionID,
        parsed.roundID,
        parsed.gameID
      ),
    validate: (parsed) => {
      if (!parsed.sign || !parsed.userID || !parsed.transactionID || !parsed.roundID || !parsed.gameID) {
        return errorPayload(RESULT.INVALID_PARAMS, 'Missing required parameters');
      }
      if (parsed.betAmount == null || parsed.betAmount < 0 || parsed.winAmount == null || parsed.winAmount < 0) {
        return errorPayload(RESULT.INVALID_PARAMS, 'Invalid bet or win amount');
      }
      return null;
    },
    getDelta: (parsed) => formatBalance(parsed.winAmount - parsed.betAmount),
    getApplyOptions: (parsed) => ({
      betAmount: parsed.betAmount,
      winAmount: parsed.winAmount
    }),
    userTransactionMeta: (parsed) => ({
      type: 'gitslotpark_betwin',
      description: `GitSlotPark bet/win ${parsed.transactionID}`,
      metadata: {
        transactionId: parsed.transactionID,
        roundId: parsed.roundID,
        gameId: parsed.gameID,
        betAmount: parsed.betAmount,
        winAmount: parsed.winAmount
      }
    })
  });
}

async function rollbackCallback(body) {
  const configError = validateConfigured();
  if (configError) return configError;

  const parsed = parseCallbackBody(body);
  const { agentID, sign, userID, refTransactionID, gameID } = parsed;

  if (!agentID || !sign || !userID || !refTransactionID || !gameID) {
    return errorPayload(RESULT.INVALID_PARAMS, 'Missing required parameters');
  }

  const agentError = validateAgent(agentID);
  if (agentError) return agentError;

  const signError = validateSign(buildRollbackSignMessage(agentID, userID, refTransactionID, gameID), sign, agentID);
  if (signError) return signError;

  const userResult = await resolveUser(userID);
  if (userResult.error) return userResult.error;

  const original = await findTransaction(refTransactionID);
  if (!original) {
    return errorPayload(RESULT.REF_NOT_FOUND, 'Could not find reference transaction id');
  }

  if (original.status === 'rolled_back') {
    return errorPayload(RESULT.ALREADY_ROLLED_BACK, 'Transaction is already rolled back');
  }

  const rollbackId = `rollback:${refTransactionID}`;
  const existingRollback = await findTransaction(rollbackId);
  if (existingRollback) {
    return successPayload({
      platformTransactionID: existingRollback.platformTransactionId,
      balance: formatBalance(existingRollback.balanceAfter)
    });
  }

  const originalDelta = original.operation === 'withdraw'
    ? -formatBalance(original.amount)
    : original.operation === 'deposit'
      ? formatBalance(original.amount)
      : formatBalance((original.winAmount || 0) - (original.betAmount || 0));

  const reverseDelta = -originalDelta;

  try {
    return await db.sequelize.transaction(async (t) => {
      const balanceAfter = await applyRollbackDelta(
        userResult.userId,
        original.transactionId,
        reverseDelta,
        {
          type: 'gitslotpark_rollback',
          description: `GitSlotPark rollback ${refTransactionID}`,
          metadata: {
            transactionId: rollbackId,
            refTransactionId: refTransactionID,
            gameId: gameID
          }
        },
        t
      );

      const platformTransactionId = newPlatformTransactionId();
      await original.update({ status: 'rolled_back' }, { transaction: t });
      await recordTransaction(
        {
          transactionId: rollbackId,
          refTransactionId: refTransactionID,
          platformTransactionId,
          userId: userResult.userId,
          operation: 'rollback',
          amount: formatBalance(Math.abs(reverseDelta)),
          balanceAfter,
          gameId: gameID,
          status: 'completed'
        },
        t
      );

      return successPayload({
        platformTransactionID: platformTransactionId,
        balance: balanceAfter
      });
    });
  } catch (err) {
    if (err.code === RESULT.INSUFFICIENT_FUNDS) {
      return errorPayload(RESULT.INSUFFICIENT_FUNDS, 'Insufficient funds');
    }
    throw err;
  }
}

module.exports = {
  getBalanceCallback,
  withdrawCallback,
  depositCallback,
  betWinCallback,
  rollbackCallback
};
