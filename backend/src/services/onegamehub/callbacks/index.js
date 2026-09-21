'use strict';

const { createLogger } = require('../../../libs/logger');
const { WALLET_ACTIONS, ERRORS } = require('../onegamehub.constants');
const { getBalance } = require('./getBalance.service');
const { withdraw } = require('./withdraw.service');
const { deposit } = require('./deposit.service');
const { cancel } = require('./cancel.service');

const log = createLogger('onegamehubCallback');

function mergeArgs(req) {
  return { ...(req.body || {}), ...(req.query || {}) };
}

/**
 * Route 1GameHub GAP wallet actions:
 *   balance → getBalance
 *   bet     → withdraw (debit SC)
 *   win     → deposit  (credit SC)
 *   cancel  → refund
 */
async function handleCallback(req) {
  const args = mergeArgs(req);
  const action = String(args.action || '').trim().toLowerCase();

  log.info('Incoming 1GameHub callback', {
    action,
    playerId: args.player_id || null,
    transactionId: args.transaction_id || null,
    roundId: args.round_id || null,
    amount: args.amount ?? null
  });

  switch (action) {
    case WALLET_ACTIONS.BALANCE:
      return getBalance(args);
    case WALLET_ACTIONS.BET:
      return withdraw(args);
    case WALLET_ACTIONS.WIN:
      return deposit(args);
    case WALLET_ACTIONS.CANCEL:
      return cancel(args);
    default:
      log.warn('Unknown 1GameHub action', { action });
      return ERRORS.unknown;
  }
}

module.exports = { handleCallback };
