'use strict';

const express = require('express');
const phoneController = require('../controllers/phone.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');
const { authRateLimiter } = require('../middlewares/authRateLimit.middleware');
const { geoBlock } = require('../middlewares/geoBlock.middleware');

const router = express.Router();
const geoGate = geoBlock();

router.use(authRateLimiter);

router.post('/send', geoGate, authMiddlewareOptional, phoneController.send);
router.post('/check', geoGate, authMiddlewareOptional, phoneController.check);
router.post('/complete-login', geoGate, phoneController.completeLogin);
router.get('/status', authMiddleware, phoneController.status);

module.exports = router;
