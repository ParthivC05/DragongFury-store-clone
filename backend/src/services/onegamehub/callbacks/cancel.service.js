'use strict';

const db = require('../../../db/models');
const { notifyUserBalanceChanged } = require('../../realtime/notifyBalance.service');
const { getActiveSession } = require('./session.service');
const {
  centsToSc,
  getPlayableBalance,
  applyRollbackDelta,
  isUnsupportedCurrency,
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
 * GAP `cancel` — refund a failed bet. If the bet was never stored, still record
 * a cancelled row so a later BET for the same id is rejected.
 */
async function cancel(args) {
  const session = await getActiveSession(args.player_id);
  if (!session) return ERRORS.sessionTimeout;
  if (isUnsupportedCurrency(args.currency)) return ERRORS.unsupportedCurrency;

  const transactionId = String(args.transaction_id || '').trim();
  const roundId = args.round_id != null ? String(args.round_id) : null;
  if (!transactionId) return ERRORS.unknown;

  const amountSc = centsToSc(args.amount);

  try {
    const balanceAfter = await db.sequelize.transaction(async (t) => {
      const alreadyCancelled = await db.OneGameHubTransaction.findOne({
        where: { transactionId: cancelKey(transactionId) },
        transaction: t
      });
      if (alreadyCancelled) {
        return alreadyCancelled.balanceAfter;
      }

      const bet = await db.OneGameHubTransaction.findOne({
        where: {
          transactionId: betKey(transactionId),
          operation: OPERATIONS.BET
        },
        transaction: t
      });

      let after = await getPlayableBalance(session.userId, t);

      if (bet && bet.status !== TX_STATUS.CANCELLED) {
        after = await applyRollbackDelta(
          session.userId,
          betKey(transactionId),
          amountSc,
          {
            type: 'onegamehub_cancel',
            description: `1GameHub cancel ${transactionId}`,
            metadata: {
              provider: 'onegamehub',
              transactionId: cancelKey(transactionId),
              gameId: session.gameId,
              roundId
            }
          },
          t
        );
        await bet.update({ status: TX_STATUS.CANCELLED }, { transaction: t });
      }

      await db.OneGameHubTransaction.create(
        {
          transactionId: cancelKey(transactionId),
          providerTransactionId: transactionId,
          userId: session.userId,
          storeCode: session.storeCode,
          operation: OPERATIONS.CANCEL,
          amount: amountSc,
          balanceAfter: after,
          gameId: session.gameId,
          roundId,
          status: TX_STATUS.CANCELLED,
          metadata: args
        },
        { transaction: t }
      );

      return after;
    });

    notifyUserBalanceChanged(session.userId);
    return success(balanceAfter, args.currency);
  } catch (_) {
    return ERRORS.unknown;
  }
}

module.exports = { cancel };
