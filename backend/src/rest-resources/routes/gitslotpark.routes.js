'use strict';

const express = require('express');
const gitslotparkController = require('../controllers/gitslotpark.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/games', authMiddlewareOptional, gitslotparkController.getGames);
router.get('/recently-played', authMiddleware, gitslotparkController.getRecentlyPlayed);
router.post('/launch', authMiddleware, gitslotparkController.launchGame);

module.exports = router;
