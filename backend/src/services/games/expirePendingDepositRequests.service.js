'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { createLogger } = require('../../libs/logger');
const { REDEEMABLE_CURRENCY_CODE, BONUS_CURRENCY_CODE } = require('../wallet/getCurrencySetting.service');
const { parseDepositFundingFromNotes, creditBonusSc, refundPlayable } = require('../wallet/walletBuckets.service');

const logger = createLogger('expirePendingDepositRequests');

/** Pending deposit requests older than this are auto-refunded and auto-rejected. Withdrawal (redeem) requests have no time limit. */
const EXPIRY_MINUTES = 180; // 3 hours
const EXPIRY_HOURS = EXPIRY_MINUTES / 60;
const EXPIRY_MS = EXPIRY_MINUTES * 60 * 1000;

/** Max expired requests to process per run (avoids loading 10k+ rows with 50+ stores × 500+ users). */
const BATCH_SIZE = 500;

/** At most one courtesy SC per user per rolling 24 hours (prevents refund-loop farming). */
const COURTESY_SC = 1;
const COURTESY_WINDOW_MS = 24 * 60 * 60 * 1000;
const COURTESY_MARKER = 'Courtesy: 1 SC';

const APOLOGY_TITLE = 'Deposit request could not be completed';
const APOLOGY_MESSAGE_WITH_COURTESY =
  'We apologize. Your deposit request could not be completed in time. Your amount has been refunded to your wallet, plus 1 SC as a courtesy. You can try again later.';
const APOLOGY_MESSAGE_REFUND_ONLY =
  'We apologize. Your deposit request could not be completed in time. Your amount has been refunded to your wallet. You can try again later.';

/**
 * Whether this user already received the auto-expiry courtesy SC within the last 24 hours.
 * @param {number} userId
 * @param {import('sequelize').Transaction} transaction
 */
async function userReceivedCourtesyInLast24Hours(userId, transaction) {
  const since = new Date(Date.now() - COURTESY_WINDOW_MS);
  const recent = await db.GameManualRequest.findOne({
    where: {
      userId,
      requestType: 'deposit',
      status: 'rejected',
      operationDoneBy: 'system',
      rejectionReason: { [Op.like]: `%${COURTESY_MARKER}%` },
      resolvedAt: { [Op.gte]: since }
    },
    transaction
  });
  return !!recent;
}

/**
 * Find pending deposit manual requests older than EXPIRY (3 hours) and:
 * - Refund the reserved request amount to the user's wallet
 * - Grant at most 1 SC courtesy per user per 24 hours
 * - Mark the request as rejected (auto-expiry)
 * - Create an in-app notification for the user
 *
 * Only deposit requests expire. Withdrawal (redeem) and register requests have no time limit;
 * admin/store partner can approve or reject them whenever they want.
 * @returns {{ expired: number, errors: string[] }}
 */
async function expirePendingDepositRequests() {
  const cutoff = new Date(Date.now() - EXPIRY_MS);
  const requests = await db.GameManualRequest.findAll({
    where: {
      requestType: 'deposit',
      status: 'pending',
      createdAt: { [Op.lt]: cutoff }
    },
    include: [{ model: db.Game, as: 'Game', attributes: ['id', 'name'], required: false }],
    order: [['id', 'ASC']],
    limit: BATCH_SIZE
  });

  const result = { expired: 0, errors: [] };
  const courtesyGrantedInRun = new Set();

  for (const req of requests) {
    const amount = parseFloat(req.amount) || 0;
    let grantCourtesy = false;

    try {
      await db.sequelize.transaction(async (t) => {
        const funding = parseDepositFundingFromNotes(req.notes, amount);
        await refundPlayable(req.userId, funding, t, {
          sourceType: 'GAME_DEPOSIT_EXPIRE',
          sourceId: req.id,
          eventType: 'REFUND',
          remarks: 'Expired game deposit refunded'
        });

        const alreadyHadCourtesy =
          courtesyGrantedInRun.has(req.userId) ||
          (await userReceivedCourtesyInLast24Hours(req.userId, t));
        grantCourtesy = !alreadyHadCourtesy;
        if (grantCourtesy) {
          await creditBonusSc(req.userId, COURTESY_SC, {
            transaction: t,
            ledger: {
              eventType: 'OTHER_BONUS',
              bonusType: 'OTHER_BONUS',
              sourceType: 'DEPOSIT_COURTESY',
              sourceId: req.id,
              remarks: 'Manual deposit expiry courtesy'
            }
          });
          courtesyGrantedInRun.add(req.userId);
          if (db.UserTransaction) {
            const gameName = req.Game?.name || null;
            await db.UserTransaction.create({
              userId: req.userId,
              type: 'deposit_courtesy',
              amount: COURTESY_SC,
              currencyCode: BONUS_CURRENCY_CODE,
              description: 'Manual deposit expiry courtesy: 1 BSC',
              metadata: {
                manual_request_id: req.id,
                game_id: req.gameId || null,
                game_name: gameName,
                deposit_amount_refunded: amount
              }
            }, { transaction: t });
          }
        }

        const baseReason = `Auto-refund: no response from store within ${EXPIRY_MINUTES} minutes.`;
        await req.update({
          status: 'rejected',
          rejectionReason: grantCourtesy ? `${baseReason} ${COURTESY_MARKER}.` : baseReason,
          resolvedAt: new Date(),
          operationDoneBy: 'system'
        }, { transaction: t });
      });

      if (db.Notification) {
        await db.Notification.create({
          userId: req.userId,
          type: 'game_request',
          title: APOLOGY_TITLE,
          message: grantCourtesy ? APOLOGY_MESSAGE_WITH_COURTESY : APOLOGY_MESSAGE_REFUND_ONLY,
          actionUrl: '/'
        }).catch((err) => logger.warn({ err, requestId: req.id }, 'Failed to create expiry notification'));
      }

      result.expired += 1;
      const refundTotal = Math.round((amount + (grantCourtesy ? COURTESY_SC : 0)) * 100) / 100;
      logger.info(
        { requestId: req.id, userId: req.userId, amount, refundTotal, courtesyGranted: grantCourtesy },
        'Expired pending deposit request'
      );
    } catch (err) {
      result.errors.push(`Request ${req.id}: ${err.message}`);
      logger.error({ err, requestId: req.id }, 'Failed to expire pending deposit request');
    }
  }

  return result;
}

module.exports = {
  expirePendingDepositRequests,
  userReceivedCourtesyInLast24Hours,
  EXPIRY_MINUTES,
  EXPIRY_HOURS,
  BATCH_SIZE,
  COURTESY_SC,
  COURTESY_WINDOW_MS,
  COURTESY_MARKER
};
