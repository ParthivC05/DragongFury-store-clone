const db = require('../../db/models');
const {
  getReceiveAccounts,
  pickRandomAccount
} = require('./storeChimeDepositReceiveAccounts.service');

/**
 * Returns one uniformly random receive account for the user's store (for display before submit).
 */
async function getChimeDepositReceivePreview(userId) {
  const requester = await db.User.findByPk(userId, {
    attributes: ['userId', 'distributorCode', 'storeCode']
  });
  if (!requester) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  const storeCode = requester.storeCode ? String(requester.storeCode).trim() : null;
  const distributorCode = requester.distributorCode ? String(requester.distributorCode).trim() : null;
  if (!storeCode || !distributorCode) {
    const err = new Error('Chime deposits are only available when your account is linked to a store.');
    err.statusCode = 400;
    throw err;
  }
  const accounts = await getReceiveAccounts(distributorCode, storeCode);
  if (!accounts.length) {
    const err = new Error(
      'Chime pay-to accounts are not configured for your store yet. Please try again later or contact support.'
    );
    err.statusCode = 400;
    throw err;
  }
  const picked = pickRandomAccount(accounts);
  return {
    destinationUsername: picked?.username || null,
    qrUrl: picked?.qrUrl || null,
    appLink: picked?.appLink || null
  };
}

module.exports = { getChimeDepositReceivePreview };
