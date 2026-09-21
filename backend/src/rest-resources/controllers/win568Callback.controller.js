'use strict';

const win568 = require('../../services/win568/win568Callbacks.service');
const { createLogger } = require('../../libs/logger');
const { ERROR } = require('../../services/win568/win568.constants');
const { errorResponse } = require('../../services/win568/win568.helpers');

const log = createLogger('win568Callback');

function sendJson(res, payload) {
  res.set('Content-Type', 'application/json; charset=UTF-8');
  res.status(200).json(payload);
}

async function handle(req, res, name, handler) {
  const started = Date.now();
  const body = req.body || {};
  log.info('568Win callback received', {
    name,
    userName: body.userName || body.Username || body.username || null,
    transferCode: body.transferCode || body.TransferCode || null
  });

  try {
    const payload = await handler(body);
    log.info('568Win callback response', {
      name,
      errorCode: payload.errorCode ?? payload.ErrorCode,
      durationMs: Date.now() - started
    });
    sendJson(res, payload);
  } catch (err) {
    log.error('568Win callback failed', {
      name,
      message: err.message,
      stack: err.stack,
      durationMs: Date.now() - started
    });
    sendJson(res, errorResponse('', ERROR.INTERNAL));
  }
}

module.exports = {
  getBalance: (req, res) => handle(req, res, 'GetBalance', win568.getBalanceCallback),
  deduct: (req, res) => handle(req, res, 'Deduct', win568.deductCallback),
  settle: (req, res) => handle(req, res, 'Settle', win568.settleCallback),
  rollback: (req, res) => handle(req, res, 'Rollback', win568.rollbackCallback),
  cancel: (req, res) => handle(req, res, 'Cancel', win568.cancelCallback),
  returnStake: (req, res) => handle(req, res, 'ReturnStake', win568.returnStakeCallback),
  getBetStatus: (req, res) => handle(req, res, 'GetBetStatus', win568.getBetStatusCallback),
  bonus: (req, res) => handle(req, res, 'Bonus', win568.bonusCallback),
  tip: (req, res) => handle(req, res, 'Tip', win568.tipCallback),
  liveCoin: (req, res) => handle(req, res, 'liveCoinTransaction', win568.liveCoinCallback),
  transfer: (req, res) => handle(req, res, 'Transfer', win568.transferCallback),
  rollbackTransfer: (req, res) => handle(req, res, 'RollbackTransfer', win568.rollbackTransferCallback),
  getTransferStatus: (req, res) => handle(req, res, 'GetTransferStatus', win568.getTransferStatusCallback)
};
