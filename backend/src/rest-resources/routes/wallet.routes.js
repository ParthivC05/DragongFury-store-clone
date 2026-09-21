const express = require('express');
const walletController = require('../controllers/wallet.controller');
const { authMiddleware, authMiddlewareOptional } = require('../middlewares/auth.middleware');
const { balanceRateLimiter } = require('../middlewares/balanceRateLimit.middleware');

const router = express.Router();

router.get('/limits', authMiddlewareOptional, walletController.getWalletLimits);
router.get('/balance', authMiddleware, balanceRateLimiter, walletController.getBalance);
router.post('/deposit', authMiddleware, walletController.deposit);
router.post('/deposit/complete', authMiddleware, walletController.completeDeposit);
router.get('/deposits', authMiddleware, walletController.getDeposits);
router.post('/deposits/sync', authMiddleware, walletController.syncDeposits);
/** Same handler as POST /deposits/sync: server calls CentryOS GET /payments/transactions then applies credits. Used by deposit page “Refresh status”. */
router.get('/deposits/refresh-status', authMiddleware, walletController.syncDeposits);
router.post('/withdraw', authMiddleware, walletController.withdraw);
router.get('/withdrawals', authMiddleware, walletController.getWithdrawals);
router.post('/payment-account/link', authMiddleware, walletController.linkPaymentAccount);
router.post('/payment-account/send-otp', authMiddleware, walletController.sendPaymentOTP);
router.post('/payment-account/verify-otp', authMiddleware, walletController.verifyPaymentOTP);
router.post('/payment-account/check-direct', authMiddleware, walletController.checkPaymentAccountDirect);
router.post('/payment-account/password-reset/request-otp', authMiddleware, walletController.requestPaymentPasswordResetOtp);
router.post('/payment-account/password-reset/verify-otp', authMiddleware, walletController.verifyPaymentPasswordResetOtp);
router.post('/payment-account/password-reset/confirm', authMiddleware, walletController.confirmPaymentPasswordReset);
router.get('/payment-account/linked-accounts', authMiddleware, walletController.getPaymentLinkedAccounts);
router.post('/payment-account/create', authMiddleware, walletController.createPaymentAccount);
router.get('/payment-account/reveal-password', authMiddleware, walletController.revealPaymentPassword);

module.exports = router;
