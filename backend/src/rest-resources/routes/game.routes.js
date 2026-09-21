const express = require('express');
const gameController = require('../controllers/game.controller');
const { authMiddleware, authMiddlewareWithBodyToken } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', authMiddlewareWithBodyToken, gameController.register);
router.post('/link-account', authMiddleware, gameController.linkAccount);
router.post('/deposit', authMiddlewareWithBodyToken, gameController.deposit);
router.post('/redeem', authMiddlewareWithBodyToken, gameController.redeem);
router.post('/forgot-password', authMiddlewareWithBodyToken, gameController.forgotPassword);

module.exports = router;
