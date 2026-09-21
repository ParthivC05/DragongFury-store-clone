'use strict';

const express = require('express');
const scorpioController = require('../controllers/scorpio.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/status', authMiddlewareOptional, scorpioController.getStatus);
router.get('/games', authMiddlewareOptional, scorpioController.getGames);
router.post('/launch', authMiddleware, scorpioController.launchGame);

module.exports = router;
