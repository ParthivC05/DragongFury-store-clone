'use strict';

const express = require('express');
const bonaController = require('../controllers/bona.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/status', authMiddlewareOptional, bonaController.getStatus);
router.get('/games', authMiddlewareOptional, bonaController.getGames);
router.post('/launch', authMiddleware, bonaController.launchGame);
router.post('/settle', authMiddleware, bonaController.settleSession);

module.exports = router;
