'use strict';

const express = require('express');
const slotProvidersController = require('../controllers/slotProviders.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/config', slotProvidersController.getPublicConfig);
router.get('/admin/settings', authMiddleware, adminMiddleware, slotProvidersController.getSettingsAdmin);
router.put('/admin/settings', authMiddleware, adminMiddleware, slotProvidersController.updateSettingsAdmin);

module.exports = router;
