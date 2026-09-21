'use strict';

const express = require('express');
const withdrawController = require('../controllers/withdraw.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/speed/request', authMiddleware, withdrawController.createSpeedWithdrawRequestHandler);
router.get('/:withdrawId/status', authMiddleware, withdrawController.getSpeedWithdrawStatusHandler);

module.exports = router;
