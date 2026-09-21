'use strict';

const express = require('express');
const kycController = require('../controllers/kyc.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/status', authMiddleware, kycController.getStatus);
router.post('/session', authMiddleware, kycController.createSession);

module.exports = router;
