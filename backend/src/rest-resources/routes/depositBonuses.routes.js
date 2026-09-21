const express = require('express');
const depositBonusesController = require('../controllers/depositBonuses.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/public', depositBonusesController.getPublicPromo);
router.get('/eligibility', authMiddleware, depositBonusesController.getEligibility);
router.get('/admin/settings', authMiddleware, adminMiddleware, depositBonusesController.getSettingsAdmin);
router.put('/admin/settings', authMiddleware, adminMiddleware, depositBonusesController.updateSettings);
router.post('/admin/settings/reset-to-default', authMiddleware, adminMiddleware, depositBonusesController.resetToDefault);

module.exports = router;
