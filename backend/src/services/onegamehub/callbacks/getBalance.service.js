'use strict';

const { getActiveSession } = require('./session.service');
const { getSessionPlayableBalance, isCurrencyMismatch, success } = require('./wallet.helpers');
const { ERRORS } = require('../onegamehub.constants');

/** GAP `balance` — return current playable balance in cents (SC or GC). */
async function getBalance(args) {
  const session = await getActiveSession(args.player_id);
  if (!session) return ERRORS.sessionTimeout;
  if (isCurrencyMismatch(session, args.currency)) return ERRORS.unsupportedCurrency;

  const balance = await getSessionPlayableBalance(session.userId, session);
  return success(balance, args.currency);
}

module.exports = { getBalance };
