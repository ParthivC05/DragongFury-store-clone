const express = require('express');
const socialLinksController = require('../controllers/socialLinks.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/config', socialLinksController.getPublicConfig);

router.get('/admin/settings', authMiddleware, adminMiddleware, socialLinksController.getSettingsAdmin);
router.put('/admin/settings', authMiddleware, adminMiddleware, socialLinksController.updateSettingsAdmin);
router.delete('/admin/settings', authMiddleware, adminMiddleware, socialLinksController.deleteSettingsAdmin);

module.exports = router;
