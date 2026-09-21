'use strict';

const express = require('express');
const gitslotparkCallbackController = require('../controllers/gitslotparkCallback.controller');
const win568CallbackController = require('../controllers/win568Callback.controller');

const router = express.Router();

/**
 * Domain-root wallet callbacks.
 * GitSlotPark: /GetBalance /Withdraw /Deposit /BetWin /RollbackTransaction
 * 568Win:     /GetBalance /Deduct /Settle /Rollback /Cancel ...
 *
 * Both providers use POST /GetBalance. Route by payload:
 *   CompanyKey + Username → 568Win
 *   agentID + userID + sign → GitSlotPark
 */
function looksLikeWin568Wallet(body) {
  if (!body || typeof body !== 'object') return false;
  const keys = Object.keys(body).map((key) => String(key).toLowerCase());
  const hasCompanyKey = keys.includes('companykey');
  const hasUser = keys.includes('username') || keys.includes('accountname');
  if (hasCompanyKey) return true;
  if (hasUser && !keys.includes('agentid')) return true;
  return false;
}

function dispatchGetBalance(req, res) {
  if (looksLikeWin568Wallet(req.body || {})) {
    return win568CallbackController.getBalance(req, res);
  }
  return gitslotparkCallbackController.getBalance(req, res);
}

function postBoth(path, handler) {
  router.post(path, handler);
  const lower = path.toLowerCase();
  if (lower !== path) router.post(lower, handler);
}

postBoth('/GetBalance', dispatchGetBalance);

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
