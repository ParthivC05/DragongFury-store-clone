'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { getStoreWalletSummaryByStore } = require('../../services/adminStoreWallet/getStoreWalletSummaryByStore.service');

/**
 * GET /api/admin/store-wallet-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * master_admin only (route). Scoped master_admin needs store_wallet_summary permission (middleware).
 */
async function getByStore(req, res) {
  try {
    const { startDate, endDate } = req.query || {};
    const data = await getStoreWalletSummaryByStore({
      startDate: startDate != null ? String(startDate).trim() : undefined,
      endDate: endDate != null ? String(endDate).trim() : undefined
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to load store wallet summary', 500);
  }
}

module.exports = {
  getByStore
};
