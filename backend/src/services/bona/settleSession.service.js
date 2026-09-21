'use strict';

const { isBonaConfigured } = require('./bona.config');
const { getBonaUsernameForUser } = require('./bonaUser.helpers');
const { syncUserGameRecords } = require('./syncGameRecords.service');
const { getPlayableBalance } = require('./bonaWallet.helpers');

/**
 * Seamless mode: money never left the platform wallet.
 * Settle = sync game records (best-effort) + return current playable balance.
 */
async function settleSession(req) {
  if (!isBonaConfigured()) {
    const err = new Error('Bona Games is not configured');
    err.statusCode = 503;
    throw err;
  }

  const userId = req.user && req.user.userId != null ? req.user.userId : null;
  if (!userId) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  const bonaUsername = await getBonaUsernameForUser(userId);
  let synced = { inserted: 0 };
  if (bonaUsername) {
    try {
      synced = await syncUserGameRecords({ userId, bonaUsername, hoursBack: 24 });
    } catch (_) {
      /* optional */
    }
  }

  const balanceAfter = await getPlayableBalance(userId);

  return {
    message: 'OK',
    provider: 'bona',
    mode: 'seamless',
    withdrawnAmount: 0,
    balanceAfter,
    syncedRecords: synced.inserted || 0
  };
}

module.exports = { settleSession };
