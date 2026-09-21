const express = require('express');
const paymentsController = require('../controllers/payments.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/deposit-methods', authMiddleware, paymentsController.getDepositMethods);
router.get('/withdraw-methods', authMiddleware, paymentsController.getWithdrawMethods);
router.post('/deposits/session', authMiddleware, paymentsController.createDepositSessionHandler);
router.get('/deposits/:depositId/status', authMiddleware, paymentsController.getDepositStatusHandler);
router.post('/scrypto/withdraw-request', authMiddleware, paymentsController.createSpeedWithdrawRequest);
router.post('/linked-accounts/withdraw', authMiddleware, paymentsController.createWithdrawal);
router.get('/withdrawal-requests', authMiddleware, paymentsController.listWithdrawalRequests);
router.post('/withdrawal-requests/:requestId/approve', authMiddleware, paymentsController.approveWithdrawalRequest);
router.post('/withdrawal-requests/:requestId/reject', authMiddleware, paymentsController.rejectWithdrawalRequest);

router.post('/chime-cashapp/withdraw', authMiddleware, paymentsController.createChimeCashappWithdrawal);
router.get('/chime-cashapp/withdrawals', authMiddleware, paymentsController.listChimeCashappWithdrawalsForUser);

router.get('/chime/receive-preview', authMiddleware, paymentsController.getChimeReceivePreview);
router.post('/chime/deposit', authMiddleware, paymentsController.createChimeDeposit);
router.get('/chime/deposits', authMiddleware, paymentsController.listChimeDepositsForUser);

module.exports = router;
