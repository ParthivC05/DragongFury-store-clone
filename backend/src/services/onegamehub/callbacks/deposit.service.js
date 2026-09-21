'use strict';

const { Op } = require('sequelize');
const db = require('../../../db/models');
const { notifyUserBalanceChanged } = require('../../realtime/notifyBalance.service');
const { getActiveSession } = require('./session.service');
const {
  centsToSc,
  applySessionBalanceDelta,
  isCurrencyMismatch,
  success
} = require('./wallet.helpers');
const { ERRORS, OPERATIONS, TX_STATUS } = require('../onegamehub.constants');

function winKey(transactionId) {
  return `${transactionId}:win`;
}

function cancelKey(transactionId) {
  return `${transactionId}:cancel`;
}

/**
 * GAP `win` — credit SC or GC to the player wallet.
 * Amounts arrive in cents. Zero wins (player lost) are valid. GC wins stay in GC.
 */
async function deposit(args) {
  const session = await getActiveSession(args.player_id);
  if (!session) return ERRORS.sessionTimeout;
  if (isCurrencyMismatch(session, args.currency)) return ERRORS.unsupportedCurrency;

  const transactionId = String(args.transaction_id || '').trim();
  const roundId = args.round_id != null ? String(args.round_id) : null;
  if (!transactionId) return ERRORS.unknown;

  const amountSc = centsToSc(args.amount);
  if (amountSc < 0) return ERRORS.unknown;

  try {
    const balanceAfter = await db.sequelize.transaction(async (t) => {
      const roundBet = await db.OneGameHubTransaction.findOne({
        where: {
          userId: session.userId,
          roundId,
          operation: OPERATIONS.BET,
          status: { [Op.ne]: TX_STATUS.CANCELLED }
        },
        transaction: t
      });
      if (!roundBet) {
        const err = new Error('NO_BET');
        err.code = 'NO_BET';
        throw err;
      }

      const existing = await db.OneGameHubTransaction.findOne({
        where: {
          transactionId: { [Op.in]: [winKey(transactionId), cancelKey(transactionId)] },
          roundId
        },
        transaction: t
      });
      if (existing) {
        return existing.balanceAfter;
      }

      const after = await applySessionBalanceDelta(
        session.userId,
        amountSc,
        {
          type: 'onegamehub_win',
          description: `1GameHub win ${transactionId}`,
          metadata: {
            provider: 'onegamehub',
            transactionId: winKey(transactionId),
            gameId: session.gameId,
            roundId,
            extRoundFinished: args.ext_round_finished,
            freeroundsFinished: args.freerounds_finished
          }
        },
        t,
        session
      );

      await db.OneGameHubTransaction.create(
        {
          transactionId: winKey(transactionId),
          providerTransactionId: transactionId,
          userId: session.userId,
          storeCode: session.storeCode,
          operation: OPERATIONS.WIN,
          amount: amountSc,
          balanceAfter: after,
          gameId: session.gameId,
          roundId,
          status: TX_STATUS.COMPLETED,
          metadata: args
        },
        { transaction: t }
      );

      return after;
    });

    notifyUserBalanceChanged(session.userId);
    return success(balanceAfter, args.currency);
  } catch (err) {
    if (err.code === 'NO_BET') return ERRORS.unknown;
    return ERRORS.unknown;
  }
}

module.exports = { deposit };
