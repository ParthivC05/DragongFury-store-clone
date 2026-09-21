const express = require('express');
const affiliateController = require('../controllers/affiliate.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

// Partner: stats (auth required); settings (optional auth – scoped when logged in)
router.get('/stats', authMiddleware, affiliateController.getStats);
router.get('/settings', authMiddlewareOptional, affiliateController.getSettings);

// Admin: per-store list/update (master/tech = all stores, store_admin = own store)
router.get('/admin/stores', authMiddleware, adminMiddleware, affiliateController.listStores);
router.put('/admin/stores', authMiddleware, adminMiddleware, affiliateController.updateStore);

// Legacy admin settings (still used as fallback)
router.get('/admin/settings', authMiddleware, adminMiddleware, affiliateController.getSettingsAdmin);
router.put('/admin/settings', authMiddleware, adminMiddleware, affiliateController.updateSettings);
router.post('/admin/settings/reset-to-default', authMiddleware, adminMiddleware, affiliateController.resetToDefault);

module.exports = router;
