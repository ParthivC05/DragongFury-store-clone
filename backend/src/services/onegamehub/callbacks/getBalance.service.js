'use strict';

const { getActiveSession } = require('./session.service');
const { getPlayableBalance, isUnsupportedCurrency, success } = require('./wallet.helpers');
const { ERRORS } = require('../onegamehub.constants');

/** GAP `balance` — return current SC playable balance in cents. */
async function getBalance(args) {
  const session = await getActiveSession(args.player_id);
  if (!session) return ERRORS.sessionTimeout;
  if (isUnsupportedCurrency(args.currency)) return ERRORS.unsupportedCurrency;

  const balance = await getPlayableBalance(session.userId);
  return success(balance, args.currency);
}

module.exports = { getBalance };
