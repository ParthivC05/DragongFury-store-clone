const express = require('express');
const spinWheelController = require('../controllers/spinWheel.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

// Public: wheel display config (no weights) – default/global
router.get('/config', spinWheelController.getConfig);

// Protected: wheel config for logged-in user's store (store users see their store's wheel)
router.get('/config/me', authMiddleware, spinWheelController.getConfigMe);

// Protected: user status and spin
router.get('/status', authMiddleware, spinWheelController.getStatus);
router.post('/spin', authMiddleware, spinWheelController.spin);

// Admin: full settings (get + update); store_admin = their store, master_admin = global
router.get('/settings', authMiddleware, adminMiddleware, spinWheelController.getSettings);
router.put('/settings', authMiddleware, adminMiddleware, spinWheelController.updateSettings);
// Store admin only: reset store spin wheel to platform default
router.post('/settings/reset-to-default', authMiddleware, adminMiddleware, spinWheelController.resetToDefault);

module.exports = router;
