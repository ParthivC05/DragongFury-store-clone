'use strict';

const express = require('express');
const gitslotparkCallbackController = require('../controllers/gitslotparkCallback.controller');

const router = express.Router();

/** GitSlotPark seamless wallet callbacks — mounted at domain root (no /api prefix). */
router.post('/GetBalance', gitslotparkCallbackController.getBalance);
router.post('/Withdraw', gitslotparkCallbackController.withdraw);
router.post('/Deposit', gitslotparkCallbackController.deposit);
router.post('/BetWin', gitslotparkCallbackController.betWin);
router.post('/RollbackTransaction', gitslotparkCallbackController.rollbackTransaction);

module.exports = router;
