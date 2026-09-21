'use strict';

const gitslotparkCallbacks = require('../../services/gitslotpark/callbacks/gitslotparkCallbacks.service');
const { createLogger } = require('../../libs/logger');

const log = createLogger('gitslotparkCallback');

function sendCallback(res, payload) {
  res.status(200).json(payload);
}

async function handleCallback(req, res, handler) {
  try {
    const payload = await handler(req.body || {});
    sendCallback(res, payload);
  } catch (err) {
    log.error('GitSlotPark callback failed', {
      path: req.path,
      message: err.message,
      stack: err.stack
    });
    sendCallback(res, { code: 1, message: err.message || 'General error' });
  }
}

async function getBalance(req, res) {
  await handleCallback(req, res, gitslotparkCallbacks.getBalanceCallback);
}

async function withdraw(req, res) {
  await handleCallback(req, res, gitslotparkCallbacks.withdrawCallback);
}

async function deposit(req, res) {
  await handleCallback(req, res, gitslotparkCallbacks.depositCallback);
}

async function betWin(req, res) {
  await handleCallback(req, res, gitslotparkCallbacks.betWinCallback);
}

async function rollbackTransaction(req, res) {
  await handleCallback(req, res, gitslotparkCallbacks.rollbackCallback);
}

module.exports = {
  getBalance,
  withdraw,
  deposit,
  betWin,
  rollbackTransaction
};
