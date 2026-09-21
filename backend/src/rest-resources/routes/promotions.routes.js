const express = require('express');
const promotionsController = require('../controllers/promotions.controller');
const { authMiddlewareOptional, authMiddleware } = require('../middlewares/auth.middleware');
const { adminMiddleware } = require('../middlewares/admin.middleware');

const router = express.Router();

router.get('/', authMiddlewareOptional, promotionsController.listPromotions);

router.get('/admin', authMiddleware, adminMiddleware, promotionsController.listAllPromotions);
router.put('/admin/:id', authMiddleware, adminMiddleware, promotionsController.updatePromotion);

module.exports = router;
