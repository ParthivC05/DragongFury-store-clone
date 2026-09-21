const express = require('express');
const vipController = require('../controllers/vip.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/status', authMiddleware, vipController.getStatus);
router.get('/history', authMiddleware, vipController.getHistory);
// Optional auth: when logged-in with a store, returns store-scoped FAQ/levels; otherwise global
router.get('/faq', authMiddlewareOptional, vipController.getFaq);
router.get('/levels', authMiddlewareOptional, vipController.getLevels);

// Admin: get/update VIP settings; store_admin = their store, master_admin = global
router.get('/settings', authMiddleware, adminMiddleware, vipController.getSettings);
router.put('/settings', authMiddleware, adminMiddleware, vipController.updateSettings);
router.post('/settings/reset-to-default', authMiddleware, adminMiddleware, vipController.resetToDefault);

module.exports = router;
