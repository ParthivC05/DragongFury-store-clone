'use strict';

const express = require('express');
const onegamehubController = require('../controllers/onegamehub.controller');
const onegamehubCallbackRoutes = require('./onegamehubCallback.routes');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/status', authMiddlewareOptional, onegamehubController.getStatus);
router.get('/games', authMiddlewareOptional, onegamehubController.getGames);
router.post('/launch', authMiddleware, onegamehubController.launchGame);
router.get('/recently-played', authMiddleware, onegamehubController.getRecentlyPlayed);
router.use('/callback', onegamehubCallbackRoutes);

module.exports = router;
