'use strict';

const express = require('express');
const onegamehubCallbackController = require('../controllers/onegamehubCallback.controller');
const { validateOneGameHubHash } = require('../middlewares/validateOneGameHubHash.middleware');

const router = express.Router();

/**
 * 1GameHub GAP wallet callbacks.
 * Whitelist this URL in the 1GameHub dashboard:
 *   POST {BACKEND_PUBLIC_URL}/api/onegamehub/callback
 */
router.post('/', validateOneGameHubHash, onegamehubCallbackController.callback);

module.exports = router;
