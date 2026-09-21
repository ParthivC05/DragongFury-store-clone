const express = require('express');
const depositPackagesController = require('../controllers/depositPackages.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/public', depositPackagesController.getPublicCatalog);
router.get('/catalog', authMiddleware, depositPackagesController.getCatalog);

router.get('/admin/catalog', authMiddleware, adminMiddleware, depositPackagesController.getAdminCatalog);
router.put('/admin/settings', authMiddleware, adminMiddleware, depositPackagesController.updateSettings);
router.patch('/admin/groups/:id', authMiddleware, adminMiddleware, depositPackagesController.patchGroup);
router.post('/admin/packages', authMiddleware, adminMiddleware, depositPackagesController.createPackage);
router.patch('/admin/packages/:id', authMiddleware, adminMiddleware, depositPackagesController.patchPackage);
router.delete('/admin/packages/:id', authMiddleware, adminMiddleware, depositPackagesController.removePackage);

module.exports = router;
