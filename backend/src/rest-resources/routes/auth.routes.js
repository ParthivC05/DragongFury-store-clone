const express = require('express');
const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { authRateLimiter } = require('../middlewares/authRateLimit.middleware');
const { geoBlock } = require('../middlewares/geoBlock.middleware');

const router = express.Router();

// Rate limit all auth endpoints (login, register, SSO) to prevent abuse
router.use(authRateLimiter);

const geoGate = geoBlock();

router.post('/register', geoGate, authController.register);
router.post('/signup/direct', geoGate, authController.register);
router.post('/login', geoGate, authController.login);
router.post('/google', geoGate, authController.googleLogin);
router.post('/google/code', geoGate, authController.googleLoginWithCode);
router.post('/facebook', geoGate, authController.facebookLogin);
router.get('/me', authMiddleware, authController.getMe);
router.post('/send-verification-email', authMiddleware, authController.sendVerificationEmail);
router.get('/verify-email', authController.verifyEmail);
router.post('/refresh-email-token', authController.refreshEmailToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.post('/complete-onboarding', authMiddleware, authController.completeOnboarding);

module.exports = router;
