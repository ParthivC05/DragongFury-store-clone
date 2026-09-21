'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { can } = require('../../utils/permissionHelpers');
const { isStoreAdmin } = require('../../constants/roles');
const { getLndWalletSnapshot } = require('../../services/paymentProviders/selfcrypto/selfcrypto.lightning');

/**
 * GET /api/admin/lightning-wallet
 * Shared Direct Crypto LND balances (USD + BTC + sats). Master or store admin.
 */
async function getLightningWallet(req, res) {
  try {
    if (isStoreAdmin(req.role) && !can(req, STORE_FEATURE_KEYS.PAYMENT_PROVIDERS)) {
      return sendError(res, 'You do not have permission to view the Lightning wallet.', 403);
    }
    const snapshot = await getLndWalletSnapshot();
    sendSuccess(res, snapshot);
  } catch (err) {
    sendError(res, err.message || 'Failed to load Lightning wallet', err.statusCode || 502);
  }
}

module.exports = { getLightningWallet };
