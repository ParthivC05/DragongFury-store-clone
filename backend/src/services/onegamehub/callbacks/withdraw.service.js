'use strict';

const db = require('../../../db/models');
const { canUserPlayGames } = require('../../games/gamePlayEligibility.service');
const { notifyUserBalanceChanged } = require('../../realtime/notifyBalance.service');
const { getActiveSession } = require('./session.service');
const {
  centsToSc,
  applySessionBalanceDelta,
  isCurrencyMismatch,
  isInsufficientFundsError,
  success
} = require('./wallet.helpers');
const { ERRORS, OPERATIONS, TX_STATUS } = require('../onegamehub.constants');

function betKey(transactionId) {
  return `${transactionId}:bet`;
}

function cancelKey(transactionId) {
  return `${transactionId}:cancel`;
}

/**
 * GAP `bet` — debit SC or GC from the player wallet (withdraw).
 * Amounts arrive in cents. Freespin bets may be 0.
 */
async function withdraw(args) {
  const session = await getActiveSession(args.player_id);
  if (!session) return ERRORS.sessionTimeout;
  if (isCurrencyMismatch(session, args.currency)) return ERRORS.unsupportedCurrency;

  const transactionId = String(args.transaction_id || '').trim();
  const roundId = args.round_id != null ? String(args.round_id) : null;
  if (!transactionId) return ERRORS.unknown;

  const canPlay = await canUserPlayGames(session.userId);
  if (!canPlay) return ERRORS.authenticationFailed;

  const amountSc = centsToSc(args.amount);
  if (amountSc < 0) return ERRORS.unknown;

  try {
    const balanceAfter = await db.sequelize.transaction(async (t) => {
      const denied = await db.OneGameHubTransaction.findOne({
        where: { transactionId: cancelKey(transactionId) },
        transaction: t
      });
      if (denied) {
        const err = new Error('BET_AFTER_CANCEL');
        err.code = 'BET_AFTER_CANCEL';
        throw err;
      }

      const existingBet = await db.OneGameHubTransaction.findOne({
        where: { transactionId: betKey(transactionId) },
        transaction: t
      });

      if (existingBet?.status === TX_STATUS.CANCELLED) {
        const err = new Error('BET_CANCELLED');
        err.code = 'BET_CANCELLED';
        throw err;
      }

      if (existingBet) {
        return existingBet.balanceAfter;
      }

      const after = await applySessionBalanceDelta(
        session.userId,
        -amountSc,
        {
          type: 'onegamehub_bet',
          description: `1GameHub bet ${transactionId}`,
          metadata: {
            provider: 'onegamehub',
            transactionId: betKey(transactionId),
            gameId: session.gameId,
            roundId
          }
        },
        t,
        session
      );

      await db.OneGameHubTransaction.create(
        {
          transactionId: betKey(transactionId),
          providerTransactionId: transactionId,
          userId: session.userId,
          storeCode: session.storeCode,
          operation: OPERATIONS.BET,
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
    if (err.code === 'BET_AFTER_CANCEL') return ERRORS.authenticationFailed;
    if (err.code === 'BET_CANCELLED') return ERRORS.sessionTimeout;
    if (isInsufficientFundsError(err)) return ERRORS.insufficientFunds;
    return ERRORS.unknown;
  }
}

module.exports = { withdraw };
