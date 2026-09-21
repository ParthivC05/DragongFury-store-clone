'use strict';

const express = require('express');
const win568Controller = require('../controllers/win568.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/status', authMiddlewareOptional, win568Controller.getStatus);
router.get('/games', authMiddlewareOptional, win568Controller.getGames);
router.post('/launch', authMiddleware, win568Controller.launchGame);

module.exports = router;
