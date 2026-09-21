'use strict';

const express = require('express');
const dailyBonusController = require('../controllers/dailyBonus.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/status', authMiddleware, dailyBonusController.getStatus);
router.post('/claim', authMiddleware, dailyBonusController.claim);
router.post('/spin', authMiddleware, dailyBonusController.spin);
router.get('/vouchers', authMiddleware, dailyBonusController.listVouchers);

router.get('/admin/stores', authMiddleware, adminMiddleware, dailyBonusController.listStores);
router.put('/admin/stores', authMiddleware, adminMiddleware, dailyBonusController.updateStore);
router.get('/admin/packages', authMiddleware, adminMiddleware, dailyBonusController.listPackages);

module.exports = router;
