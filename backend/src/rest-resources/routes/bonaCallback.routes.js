'use strict';

const express = require('express');
const bonaCallbackController = require('../controllers/bonaCallback.controller');

const router = express.Router();

/**
 * Bona Seamless Wallet V8 callbacks.
 * Give these URLs to Bona support for configuration:
 *   POST {PUBLIC_BASE}/api/bona/callback/query
 *   POST {PUBLIC_BASE}/api/bona/callback/bet
 *   POST {PUBLIC_BASE}/api/bona/callback/settlement
 *   POST {PUBLIC_BASE}/api/bona/callback/activity-settlement
 *   POST {PUBLIC_BASE}/api/bona/callback/fishing-settlement
 */
router.post('/query', bonaCallbackController.query);
router.post('/bet', bonaCallbackController.bet);
router.post('/settlement', bonaCallbackController.settlement);
router.post('/activity-settlement', bonaCallbackController.activitySettlement);
router.post('/fishing-settlement', bonaCallbackController.fishingSettlement);

module.exports = router;
