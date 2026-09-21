'use strict';

const express = require('express');
const win568CallbackController = require('../controllers/win568Callback.controller');

const router = express.Router();

/**
 * 568Win Seamless Wallet 2.0 callbacks.
 * Mounted at /api/568win and also at domain root (see walletRootCallback.routes.js).
 * GitSlotPark shares POST /GetBalance — root dispatcher routes by CompanyKey.
 *
 * Back office 3.3 Domain (WITH trailing slash), either:
 *   https://dragonfury.com/
 *   https://dragonfury.com/api/568win/
 */
router.get('/health', (req, res) => {
  res.json({ ok: true, provider: '568win', v: '20260827-root-wallet' });
});

router.use((req, _res, next) => {
  if (req.method === 'POST' && req.path) {
    const aliases = {
      '/getbalance': '/GetBalance',
      '/deduct': '/Deduct',
      '/settle': '/Settle',
      '/rollback': '/Rollback',
      '/cancel': '/Cancel',
      '/returnstake': '/ReturnStake',
      '/getbetstatus': '/GetBetStatus',
      '/bonus': '/Bonus',
      '/tip': '/Tip',
      '/livecointransaction': '/liveCoinTransaction',
      '/transfer': '/Transfer',
      '/rollbacktransfer': '/RollbackTransfer',
      '/gettransferstatus': '/GetTransferStatus'
    };
    const mapped = aliases[String(req.path).toLowerCase()];
    if (mapped && req.path !== mapped) req.url = mapped;
  }
  next();
});

function postBoth(path, handler) {
  router.post(path, handler);
  const lower = path.toLowerCase();
  if (lower !== path) router.post(lower, handler);
}

postBoth('/GetBalance', win568CallbackController.getBalance);
postBoth('/Deduct', win568CallbackController.deduct);
postBoth('/Settle', win568CallbackController.settle);
postBoth('/Rollback', win568CallbackController.rollback);
postBoth('/Cancel', win568CallbackController.cancel);
postBoth('/ReturnStake', win568CallbackController.returnStake);
postBoth('/GetBetStatus', win568CallbackController.getBetStatus);
postBoth('/Bonus', win568CallbackController.bonus);
postBoth('/Tip', win568CallbackController.tip);
postBoth('/liveCoinTransaction', win568CallbackController.liveCoin);
postBoth('/Transfer', win568CallbackController.transfer);
postBoth('/RollbackTransfer', win568CallbackController.rollbackTransfer);
postBoth('/GetTransferStatus', win568CallbackController.getTransferStatus);

module.exports = router;
