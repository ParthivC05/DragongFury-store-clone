const express = require('express');
const multer = require('multer');
const adminAuthController = require('../controllers/adminAuth.controller');
const adminMeController = require('../controllers/adminMe.controller');
const adminDashboardController = require('../controllers/adminDashboard.controller');
const adminDistributorsController = require('../controllers/adminDistributors.controller');
const adminStoresController = require('../controllers/adminStores.controller');
const adminUsersController = require('../controllers/adminUsers.controller');
const adminContactListsController = require('../controllers/adminContactLists.controller');
const adminUserManagementController = require('../controllers/adminUserManagement.controller');
const adminReportsController = require('../controllers/adminReports.controller');
const adminAnalyticsController = require('../controllers/adminAnalytics.controller');
const adminStoreRolesController = require('../controllers/adminStoreRoles.controller');
const adminStoreStaffController = require('../controllers/adminStoreStaff.controller');
const adminRolesController = require('../controllers/adminRoles.controller');
const adminStaffController = require('../controllers/adminStaff.controller');
const adminGamesController = require('../controllers/adminGames.controller');
const adminGameLogsController = require('../controllers/adminGameLogs.controller');
const adminGameReportController = require('../controllers/adminGameReport.controller');
const adminGameManualRequestsController = require('../controllers/adminGameManualRequests.controller');
const adminSubscriptionsController = require('../controllers/adminSubscriptions.controller');
const adminSubscriptionRequestsController = require('../controllers/adminSubscriptionRequests.controller');
const adminPaymentProvidersController = require('../controllers/adminPaymentProviders.controller');
const adminLightningWalletController = require('../controllers/adminLightningWallet.controller');
const adminDirectCryptoTreasuryController = require('../controllers/adminDirectCryptoTreasury.controller');
const adminStorePaymentProvidersController = require('../controllers/adminStorePaymentProviders.controller');
const adminWalletLimitsController = require('../controllers/adminWalletLimits.controller');
const adminRedeemPercentageController = require('../controllers/adminRedeemPercentage.controller');
const adminTransactionFeesController = require('../controllers/adminTransactionFees.controller');
const adminHelpController = require('../controllers/adminHelp.controller');
const adminBlogController = require('../controllers/adminBlog.controller');
const adminLink2PlayController = require('../controllers/adminLink2Play.controller');
const adminFooterController = require('../controllers/adminFooter.controller');
const adminChimeCashappWithdrawalsController = require('../controllers/adminChimeCashappWithdrawals.controller');
const adminChimeDepositsController = require('../controllers/adminChimeDeposits.controller');
const adminDepositRequestsController = require('../controllers/adminDepositRequests.controller');
const adminReferralTransactionsController = require('../controllers/adminReferralTransactions.controller');
const adminWithdrawalRequestsController = require('../controllers/adminWithdrawalRequests.controller');
const adminBonusController = require('../controllers/adminBonus.controller');
const adminEmailCampaignsController = require('../controllers/adminEmailCampaigns.controller');
const adminPushCampaignsController = require('../controllers/adminPushCampaigns.controller');
const adminBonusReportController = require('../controllers/adminBonusReport.controller');
const adminBonusScUsageController = require('../controllers/adminBonusScUsage.controller');
const adminPaymentReportController = require('../controllers/adminPaymentReport.controller');
const adminWalletAdjustReportController = require('../controllers/adminWalletAdjustReport.controller');
const adminWalletScReconciliationController = require('../controllers/adminWalletScReconciliation.controller');
const adminDailyScReportController = require('../controllers/adminDailyScReport.controller');
const adminGeoIpAllowlistController = require('../controllers/adminGeoIpAllowlist.controller');
const adminFingerprintSignupIpAllowlistController = require('../controllers/adminFingerprintSignupIpAllowlist.controller');
const adminDiditKycController = require('../controllers/adminDiditKyc.controller');
const adminPhoneVerificationController = require('../controllers/adminPhoneVerification.controller');
const adminStoreWalletController = require('../controllers/adminStoreWallet.controller');
const adminAutomationUsageController = require('../controllers/adminAutomationUsage.controller');
const adminSupportTicketsController = require('../controllers/adminSupportTickets.controller');
const adminStaffShiftsController = require('../controllers/adminStaffShifts.controller');
const adminStaffAttendanceController = require('../controllers/adminStaffAttendance.controller');
const socialLinksController = require('../controllers/socialLinks.controller');
const slotProvidersController = require('../controllers/slotProviders.controller');
const landingPaymentLinksController = require('../controllers/landingPaymentLinks.controller');
const dashboardPromoModalsController = require('../controllers/dashboardPromoModals.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');
const { authRateLimiter } = require('../middlewares/authRateLimit.middleware');
const {
  supportTicketWriteLimiter,
  supportTicketUploadLimiter
} = require('../middlewares/supportTicketsRateLimit.middleware');
const { contactListDownloadLimiter } = require('../middlewares/contactListsRateLimit.middleware');
const { adminMiddleware, requireMasterAdmin, requireMasterOrStoreAdmin, requireAdminPermissionByPath } = require('../middlewares/admin.middleware');
const { requireStoreStaffShiftActive } = require('../middlewares/staffShiftActive.middleware');

const router = express.Router();

// In-memory upload for small images (QR codes), streamed to S3 in the controller.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Unsupported image type. Use PNG, JPG, WEBP, or GIF.'));
  }
});

router.post('/auth/login', authRateLimiter, adminAuthController.login);
router.post('/auth/off-shift-login-request', authRateLimiter, adminStaffAttendanceController.requestOffShiftLogin);
router.post('/auth/invalidate-login-otp', authRateLimiter, adminAuthController.invalidateLoginOtp);
router.post('/auth/resend-login-otp', authRateLimiter, adminAuthController.resendLoginOtp);
router.post('/auth/verify-login-otp', authRateLimiter, adminAuthController.verifyLoginOtp);
router.post('/auth/forgot-password', authRateLimiter, adminAuthController.forgotPassword);
router.post('/auth/reset-password', authRateLimiter, adminAuthController.resetPassword);

router.use(authMiddleware);
router.use(adminMiddleware);
router.use(requireStoreStaffShiftActive);
router.use(requireAdminPermissionByPath);

router.post('/auth/change-password', adminAuthController.changePassword);
router.get('/me', adminMeController.getMe);
router.get('/me/attendance', adminStaffAttendanceController.getMine);
router.post('/me/attendance/check-in', adminStaffAttendanceController.checkIn);
router.post('/me/attendance/check-out', adminStaffAttendanceController.checkOut);
router.patch('/me/user-site-url', adminMeController.patchUserSiteUrl);
router.patch('/me/drawer', adminMeController.patchDrawer);
router.get('/dashboard', adminDashboardController.getStats);
router.get('/dashboard/series', adminDashboardController.getSeries);

router.get('/analytics/summary', adminAnalyticsController.getSummary);
router.get('/analytics/top', adminAnalyticsController.getTop);

router.get('/distributors', adminDistributorsController.list);
router.post('/distributors', adminDistributorsController.create);
router.get('/distributors/:id', adminDistributorsController.get);
router.put('/distributors/:id', adminDistributorsController.update);
router.delete('/distributors/:id', adminDistributorsController.remove);

router.get('/stores/filter-options', adminStoresController.filterOptions);
router.get('/stores', adminStoresController.list);
router.post('/stores', adminStoresController.create);
router.get('/stores/:id', adminStoresController.get);
router.get('/stores/:id/admins', adminStoresController.listStoreAdmins);
router.get('/stores/:id/store-roles', adminStoresController.getStoreRoles);
router.get('/stores/:id/social-links', socialLinksController.getStoreSocialLinks);
router.put('/stores/:id/social-links', socialLinksController.updateStoreSocialLinks);
router.delete('/stores/:id/social-links', socialLinksController.deleteStoreSocialLinks);
router.get('/stores/:id/slot-providers', slotProvidersController.getStoreSettings);
router.put('/stores/:id/slot-providers', slotProvidersController.updateStoreSettings);
router.get('/stores/:id/landing-payment-links', landingPaymentLinksController.getStoreLandingPaymentLinks);
router.put('/stores/:id/landing-payment-links', landingPaymentLinksController.updateStoreLandingPaymentLinks);
router.delete('/stores/:id/landing-payment-links', landingPaymentLinksController.deleteStoreLandingPaymentLinks);
router.get('/stores/:id/dashboard-promo-modals', dashboardPromoModalsController.getStoreDashboardPromoModals);
router.put('/stores/:id/dashboard-promo-modals', dashboardPromoModalsController.updateStoreDashboardPromoModals);
router.delete('/stores/:id/dashboard-promo-modals', dashboardPromoModalsController.deleteStoreDashboardPromoModals);
router.put('/stores/:id', adminStoresController.update);
router.delete('/stores/:id', adminStoresController.remove);

router.get('/users/filter-options', adminUsersController.filterOptions);
router.get('/users', adminUsersController.list);

router.get('/contact-lists/filter-options', requireMasterAdmin, adminContactListsController.filterOptions);
router.get('/contact-lists/downloads', requireMasterAdmin, adminContactListsController.downloads);
router.get('/contact-lists', requireMasterAdmin, adminContactListsController.list);
router.post('/contact-lists/download', requireMasterAdmin, contactListDownloadLimiter, adminContactListsController.download);

router.get('/users/:userId', adminUserManagementController.getById);
router.patch('/users/:userId', adminUserManagementController.patchUser);
router.post('/users/:userId/wallet/deduct', adminUserManagementController.walletDeduct);
router.post('/users/:userId/wallet/add-sc', adminUserManagementController.walletAddSc);
router.get('/users/:userId/user-transactions', adminUserManagementController.listUserTransactions);
router.get('/users/:userId/game-activities', adminUserManagementController.listGameActivities);
router.get('/users/:userId/game-accounts', adminUserManagementController.listGameAccounts);
router.get('/users/:userId/game-accounts/:accountId/credentials', adminUserManagementController.getGameAccountCredentials);
router.patch('/users/:userId/game-accounts/:accountId/credentials', adminUserManagementController.updateGameAccountCredentials);
router.delete('/users/:userId/game-accounts/:accountId/credentials', adminUserManagementController.deleteGameAccountCredentials);
router.delete('/users/:userId/game-accounts/credentials', adminUserManagementController.deleteAllGameAccountsCredentials);
router.get('/users/:userId/game-accounts/credential-history', adminUserManagementController.getGameAccountCredentialHistory);
router.get('/users/:userId/game-accounts/:accountId/credential-logs', adminUserManagementController.listGameAccountCredentialLogs);
router.get('/users/:userId/game-manual-requests', adminUserManagementController.listGameManualRequests);
router.get('/users/:userId/withdrawal-requests', adminUserManagementController.listWithdrawalRequests);
router.get('/users/:userId/deposit-requests', adminUserManagementController.listDepositRequestsForUser);
router.get('/users/:userId/gitslotpark-transactions', adminUserManagementController.listGitslotparkTransactions);

// Store roles – store admin only (create and manage roles for their store)
router.get('/store-roles', adminStoreRolesController.list);
router.post('/store-roles', adminStoreRolesController.create);
router.get('/store-roles/:id', adminStoreRolesController.get);
router.put('/store-roles/:id', adminStoreRolesController.update);
router.delete('/store-roles/:id', adminStoreRolesController.remove);

// Store staff – store admin only (list/add/update staff with store_role_id)
router.get('/store-staff', adminStoreStaffController.list);
router.post('/store-staff', adminStoreStaffController.create);
router.put('/store-staff/:id', adminStoreStaffController.update);
router.delete('/store-staff/:id', adminStoreStaffController.remove);

// Store staff shifts — store admin (own store) or super/technical staff
router.get('/staff-shifts/timezones', adminStaffShiftsController.listTimezones);
router.get('/staff-shifts', adminStaffShiftsController.list);
router.get('/staff-shifts/:userId', adminStaffShiftsController.get);
router.put('/staff-shifts/:userId', adminStaffShiftsController.upsert);
router.delete('/staff-shifts/:userId', adminStaffShiftsController.remove);

// Staff attendance report + off-shift approval — super admin / technical staff
router.get('/staff-attendance/report', adminStaffAttendanceController.report);
router.get('/staff-attendance/staff-options', adminStaffAttendanceController.listStaffOptions);
router.get('/staff-attendance/off-shift-requests', adminStaffAttendanceController.listOffShiftRequests);
router.post('/staff-attendance/off-shift-requests/:id/approve', adminStaffAttendanceController.approveOffShiftRequest);
router.post('/staff-attendance/off-shift-requests/:id/reject', adminStaffAttendanceController.rejectOffShiftRequest);
router.post('/staff-attendance/grant-off-shift', adminStaffAttendanceController.grantOffShift);

// Admin roles – master_admin only (create and manage roles for full admin panel)
router.get('/admin-roles', requireMasterAdmin, adminRolesController.list);
router.post('/admin-roles', requireMasterAdmin, adminRolesController.create);
router.get('/admin-roles/:id', requireMasterAdmin, adminRolesController.get);
router.put('/admin-roles/:id', requireMasterAdmin, adminRolesController.update);
router.delete('/admin-roles/:id', requireMasterAdmin, adminRolesController.remove);

// Admin staff – master_admin only (list/add/update staff with admin_role_id)
router.get('/admin-staff', requireMasterAdmin, adminStaffController.list);
router.post('/admin-staff', requireMasterAdmin, adminStaffController.create);
router.put('/admin-staff/:id', requireMasterAdmin, adminStaffController.update);
router.delete('/admin-staff/:id', requireMasterAdmin, adminStaffController.remove);

// Unified reports (all admin roles, scope from auth)
router.get('/reports/summary', adminReportsController.getSummary);
router.get('/reports/trend', adminReportsController.getTrend);
router.get('/reports/breakdown', adminReportsController.getBreakdown);
router.get('/reports/filter-options', adminReportsController.getFilterOptions);
router.get('/reports/transactions', adminReportsController.getTransactions);

/** Bonus report (store admin + master/technical staff only — not distributor). */
router.get('/bonus-report/summary', adminBonusReportController.getSummary);
router.get('/bonus-report/transactions', adminBonusReportController.getTransactions);
router.get('/bonus-report/filter-options', adminBonusReportController.getFilterOptions);

/** Bonus SC used vs unused (master/technical staff only). */
router.get('/bonus-sc-usage/summary', adminBonusScUsageController.getSummary);
router.get('/bonus-sc-usage/filter-options', adminBonusScUsageController.getFilterOptions);

/** Payment report (master/technical staff only — method & provider success/failure rates). */
router.get('/payment-report/summary', adminPaymentReportController.getSummary);
router.get('/payment-report/filter-options', adminPaymentReportController.getFilterOptions);

/** Wallet adjust report (master/technical staff only — admin/staff PSC/BSC/RSC add & remove audit). */
router.get('/wallet-adjust-report/summary', adminWalletAdjustReportController.getSummary);
router.get('/wallet-adjust-report/transactions', adminWalletAdjustReportController.getTransactions);
router.get('/wallet-adjust-report/filter-options', adminWalletAdjustReportController.getFilterOptions);

/** Wallet SC reconciliation (master/technical staff only — every SC coin story). */
router.get('/wallet-sc-reconciliation/summary', adminWalletScReconciliationController.getSummary);
router.get('/wallet-sc-reconciliation/entries', adminWalletScReconciliationController.getEntries);
router.get('/wallet-sc-reconciliation/filter-options', adminWalletScReconciliationController.getFilterOptions);

/** Daily SC report (all credits/debits per day, leftover carried to the next day). */
router.get('/daily-sc-report/summary', adminDailyScReportController.getSummary);
router.get('/daily-sc-report/entries', adminDailyScReportController.getEntries);
router.get('/daily-sc-report/filter-options', adminDailyScReportController.getFilterOptions);

/** Store-wise wallet topup / withdraw (+ Chime/Cash App completed manual withdrawals). master_admin only. */
router.get('/store-wallet-summary', requireMasterAdmin, adminStoreWalletController.getByStore);

router.get('/game-templates', adminGamesController.listGameTemplates);
router.get('/game-templates/all', requireMasterAdmin, adminGamesController.listAllGameTemplates);
router.get('/game-templates/:id', requireMasterAdmin, adminGamesController.getGameTemplate);
router.post('/game-templates', requireMasterAdmin, adminGamesController.createGameTemplate);
router.put('/game-templates/:id', requireMasterAdmin, adminGamesController.updateGameTemplate);
router.get('/automation-usage/games', requireMasterAdmin, adminAutomationUsageController.listGames);
router.get('/automation-usage/breakdown', requireMasterAdmin, adminAutomationUsageController.getBreakdown);
router.get('/automation-usage/trend', requireMasterAdmin, adminAutomationUsageController.getTrend);
router.get('/automation-usage/errors', requireMasterAdmin, adminAutomationUsageController.listErrors);
router.get('/games/manual-mode-logs', adminGamesController.listManualModeLogs);
router.get('/games/bot-failure-logs', adminGamesController.listBotFailureLogs);
router.get('/games/history', adminGamesController.listGameHistory);
router.get('/games', adminGamesController.list);
router.get('/games/:id', adminGamesController.get);
router.post(
  '/games/upload-image',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminGamesController.uploadImage
);
router.post('/games/custom', adminGamesController.createCustom);
router.post('/games', adminGamesController.create);
router.put('/games/:id', adminGamesController.update);
router.post('/games/:id/change-password', adminGamesController.changePassword);
router.delete('/games/:id', adminGamesController.remove);
router.patch('/games/:id/toggle-bot-offline', adminGamesController.toggleBotOffline);
router.patch('/games/:id/toggle-manual-redeem-only', adminGamesController.toggleManualRedeemOnly);

// Manual game requests (when a game's bot is offline, operations queue here for manual processing)
router.get('/game-manual-requests', adminGameManualRequestsController.list);
router.get('/game-manual-requests/:id/credentials', adminGameManualRequestsController.getCredentials);
router.patch('/game-manual-requests/:id/credentials', adminGameManualRequestsController.updateCredentials);
router.get('/game-manual-requests/:id/logs', adminGameManualRequestsController.listLogs);
router.get('/game-manual-requests/:id', adminGameManualRequestsController.get);
router.post('/game-manual-requests/:id/approve', adminGameManualRequestsController.approve);
router.post('/game-manual-requests/:id/reject', adminGameManualRequestsController.reject);

router.get('/game-logs/stats', adminGameLogsController.getStats);
router.get('/game-logs/trend', adminGameLogsController.getTrend);
router.get('/game-logs/breakdown', adminGameLogsController.getBreakdown);
router.get('/game-logs/signups', adminGameLogsController.getSignups);
router.get('/game-logs/deposits', adminGameLogsController.getDeposits);
router.get('/game-logs/withdrawals', adminGameLogsController.getWithdrawals);
router.get('/game-logs/transactions', adminGameLogsController.getTransactions);

/** Game report: SC wagered / won / GGR / payout by game or provider (slots). */
router.get('/game-report', adminGameReportController.getReport);

// Subscriptions (manual process – no payment). Distributor admin creates plans; store admin requests; dist admin approves.
router.get('/subscriptions/current', adminSubscriptionsController.getCurrent);
router.get('/subscriptions', adminSubscriptionsController.list);
router.get('/subscriptions/:id', adminSubscriptionsController.get);
router.post('/subscriptions', adminSubscriptionsController.create);
router.put('/subscriptions/:id', adminSubscriptionsController.update);
router.delete('/subscriptions/:id', adminSubscriptionsController.remove);

router.get('/subscription-requests', adminSubscriptionRequestsController.list);
router.post('/subscription-requests', adminSubscriptionRequestsController.create);
router.post('/subscription-requests/:id/approve', adminSubscriptionRequestsController.approve);
router.post('/subscription-requests/:id/reject', adminSubscriptionRequestsController.reject);
router.delete('/subscription-requests/:id', adminSubscriptionRequestsController.cancel);

// Payment providers – master_admin only (activate/deactivate providers; deposit/withdraw toggles; reorder)
router.get('/payment-providers', requireMasterAdmin, adminPaymentProvidersController.listPaymentProviders);
router.get('/lightning-wallet', requireMasterOrStoreAdmin, adminLightningWalletController.getLightningWallet);
router.get('/direct-crypto-treasury', requireMasterOrStoreAdmin, adminDirectCryptoTreasuryController.list);
router.put('/payment-providers/reorder', requireMasterAdmin, adminPaymentProvidersController.reorderPaymentProviders);
router.patch('/payment-providers/:providerCode/status', requireMasterAdmin, adminPaymentProvidersController.updateProviderStatus);
router.get('/wallet-limits', adminWalletLimitsController.getWalletLimits);
router.put('/wallet-limits', adminWalletLimitsController.updateWalletLimits);
router.get('/wallet-limits/stores', adminWalletLimitsController.listStoreDailyLimits);
router.put('/wallet-limits/stores', adminWalletLimitsController.updateStoreDailyLimit);

// Game redeem win % (last top-up + N% required to redeem) — master = global / store override; store_admin = own store
router.get('/redeem-percentage', adminRedeemPercentageController.getRedeemPercentageAdmin);
router.get('/redeem-percentage/stores', adminRedeemPercentageController.listStoreRedeemPercentagesAdmin);
router.put('/redeem-percentage', adminRedeemPercentageController.updateRedeemPercentageAdmin);
router.post('/redeem-percentage/reset-to-default', adminRedeemPercentageController.resetRedeemPercentageAdmin);

// Per-store payin/payout fees — super admin + technical staff only
router.get('/transaction-fees', adminTransactionFeesController.getTransactionFeesAdmin);
router.get('/transaction-fees/stores', adminTransactionFeesController.listStoreTransactionFeesAdmin);
router.put('/transaction-fees', adminTransactionFeesController.updateTransactionFeesAdmin);
router.post('/transaction-fees/reset-to-default', adminTransactionFeesController.resetTransactionFeesAdmin);

// Store payment providers – store_admin or master (master passes distributorCode+storeCode)
router.get('/store-payment-providers', requireMasterOrStoreAdmin, adminStorePaymentProvidersController.list);
router.put('/store-payment-providers/reorder', requireMasterOrStoreAdmin, adminStorePaymentProvidersController.reorder);
router.patch('/store-payment-providers/best-deals', requireMasterOrStoreAdmin, adminStorePaymentProvidersController.updateBestDeals);
router.patch('/store-payment-providers/:providerCode', requireMasterOrStoreAdmin, adminStorePaymentProvidersController.update);

// Help content – master_admin edits platform default; store_admin can use default or set own
router.get('/help', adminHelpController.list);
router.get('/help/:topic', adminHelpController.getOne);
router.put('/help/:topic', adminHelpController.upsert);

// Support tickets – store-scoped conversation between players and admins
router.post(
  '/support-tickets/upload',
  requireMasterOrStoreAdmin,
  supportTicketUploadLimiter,
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminSupportTicketsController.upload
);
router.get(
  '/support-tickets',
  requireMasterOrStoreAdmin,
  adminSupportTicketsController.list
);
router.get(
  '/support-tickets/:id',
  requireMasterOrStoreAdmin,
  adminSupportTicketsController.getOne
);
router.post(
  '/support-tickets/:id/messages',
  requireMasterOrStoreAdmin,
  supportTicketWriteLimiter,
  adminSupportTicketsController.reply
);
router.patch(
  '/support-tickets/:id',
  requireMasterOrStoreAdmin,
  supportTicketWriteLimiter,
  adminSupportTicketsController.updateStatus
);

// Blog posts – store-scoped (dragonfury admin posts appear on dragonfury user site)
router.post(
  '/blog/upload-image',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminBlogController.uploadImage
);
router.get('/blog', adminBlogController.list);
router.get('/blog/:id', adminBlogController.getOne);
router.post('/blog', adminBlogController.create);
router.put('/blog/:id', adminBlogController.update);
router.put('/blog/:id/toggle', adminBlogController.toggle);
router.delete('/blog/:id', adminBlogController.remove);

// Link2Play catalog – DragonFury only
router.post(
  '/link2play/upload-image',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminLink2PlayController.uploadImage
);
router.get('/link2play', adminLink2PlayController.list);
router.get('/link2play/:id', adminLink2PlayController.getOne);
router.post('/link2play', adminLink2PlayController.create);
router.put('/link2play/:id', adminLink2PlayController.update);
router.put('/link2play/:id/toggle', adminLink2PlayController.toggle);
router.delete('/link2play/:id', adminLink2PlayController.remove);

// Footer menus + pages (store-scoped CMS)
router.post(
  '/footer/upload-image',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminFooterController.uploadImage
);
router.get('/footer/settings', adminFooterController.getSettings);
router.put('/footer/settings', adminFooterController.updateSettings);
router.get('/footer/menus', adminFooterController.listMenus);
router.get('/footer/menus/:id', adminFooterController.getMenu);
router.post('/footer/menus', adminFooterController.createMenu);
router.put('/footer/menus/:id', adminFooterController.updateMenu);
router.delete('/footer/menus/:id', adminFooterController.removeMenu);
router.get('/footer/pages', adminFooterController.listPages);
router.get('/footer/pages/:id', adminFooterController.getPage);
router.post('/footer/pages', adminFooterController.createPage);
router.put('/footer/pages/:id', adminFooterController.updatePage);
router.delete('/footer/pages/:id', adminFooterController.removePage);

// User wallet deposits (deposit_requests + user scope; read-only)
router.get('/deposit-requests/store-codes', adminDepositRequestsController.listStoreCodes);
router.get('/deposit-requests', adminDepositRequestsController.list);
router.get('/withdrawal-requests', adminWithdrawalRequestsController.list);

// Referral transactions report (friend signup + referrer rewards; Affiliate permission)
router.get('/referral-transactions', adminReferralTransactionsController.list);

// Chime / Cash App manual withdrawals (scoped by store or distributor)
router.get('/chime-cashapp-withdrawals', adminChimeCashappWithdrawalsController.list);
router.get('/chime-cashapp-withdrawals/account-totals', adminChimeCashappWithdrawalsController.accountTotals);
router.get('/chime-cashapp-withdrawals/:id', adminChimeCashappWithdrawalsController.getOne);
router.post('/chime-cashapp-withdrawals/:id/approve', adminChimeCashappWithdrawalsController.approve);
router.post('/chime-cashapp-withdrawals/:id/reject', adminChimeCashappWithdrawalsController.reject);

// Chime manual deposits (scoped by store or distributor)
router.get('/chime-deposits/receive-accounts', adminChimeDepositsController.getReceiveAccounts);
router.get('/chime-deposits/account-totals', adminChimeDepositsController.accountTotals);
router.put('/chime-deposits/receive-accounts', adminChimeDepositsController.updateReceiveAccounts);
router.post(
  '/chime-deposits/qr-upload',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminChimeDepositsController.uploadQr
);
router.get('/chime-deposits', adminChimeDepositsController.list);
router.get('/chime-deposits/:id', adminChimeDepositsController.getOne);
router.post('/chime-deposits/:id/approve', adminChimeDepositsController.approve);
router.post('/chime-deposits/:id/reject', adminChimeDepositsController.reject);

// Bonus codes & deposit-bonus grants (separate from platform promotions)
router.get('/bonus/codes', adminBonusController.listCodes);
router.post('/bonus/codes', adminBonusController.createCode);
router.get('/bonus/codes/:id', adminBonusController.getCode);
router.patch('/bonus/codes/:id', adminBonusController.updateCode);
router.delete('/bonus/codes/:id', adminBonusController.removeCode);
router.get('/bonus/transactions', adminBonusController.listTransactions);

// DragonFury email campaigns (no-deposit reengagement) — dragonfury store only
router.post(
  '/email-campaigns/upload-image',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminEmailCampaignsController.uploadImage
);
router.get('/email-campaigns', adminEmailCampaignsController.listCampaigns);
router.post('/email-campaigns', adminEmailCampaignsController.createCampaign);
router.post('/email-campaigns/preview', adminEmailCampaignsController.preview);
router.get('/email-campaigns/:id', adminEmailCampaignsController.getCampaign);
router.patch('/email-campaigns/:id', adminEmailCampaignsController.updateCampaign);
router.get('/email-campaigns/:id/test-users', adminEmailCampaignsController.listTestUsers);
router.post('/email-campaigns/:id/test-users', adminEmailCampaignsController.addTestUser);
router.delete('/email-campaigns/:id/test-users/:testUserId', adminEmailCampaignsController.removeTestUser);
router.get('/email-campaigns/:id/sends', adminEmailCampaignsController.listSends);
router.get('/email-campaigns/:id/sends/:sendId', adminEmailCampaignsController.getSendDetail);
router.post('/email-campaigns/:id/sends/:sendId/sync-delivery', adminEmailCampaignsController.syncSendDelivery);
router.post('/email-campaigns/:id/sync-delivery', adminEmailCampaignsController.syncCampaignDelivery);
router.post('/email-campaigns/:id/preview', adminEmailCampaignsController.preview);
router.post('/email-campaigns/:id/send-test', adminEmailCampaignsController.sendTest);
router.post('/email-campaigns/:id/send-to-test-users', adminEmailCampaignsController.sendToTestUsers);
router.get('/email-campaigns/:id/eligible-count', adminEmailCampaignsController.eligibleCount);

router.post(
  '/push-campaigns/upload-image',
  (req, res, next) => {
    imageUpload.single('file')(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Image is too large. Maximum size is 5MB.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ message });
      }
      return next();
    });
  },
  adminPushCampaignsController.uploadImage
);
router.get('/push-campaigns', adminPushCampaignsController.listCampaigns);
router.post('/push-campaigns', adminPushCampaignsController.createCampaign);
router.get('/push-campaigns/:id', adminPushCampaignsController.getCampaign);
router.patch('/push-campaigns/:id', adminPushCampaignsController.updateCampaign);
router.get('/push-campaigns/:id/test-users', adminPushCampaignsController.listTestUsers);
router.post('/push-campaigns/:id/test-users', adminPushCampaignsController.addTestUser);
router.delete('/push-campaigns/:id/test-users/:testUserId', adminPushCampaignsController.removeTestUser);
router.get('/push-campaigns/:id/sends', adminPushCampaignsController.listSends);
router.post('/push-campaigns/:id/send-test', adminPushCampaignsController.sendTest);
router.post('/push-campaigns/:id/send-to-test-users', adminPushCampaignsController.sendToTestUsers);
router.post('/push-campaigns/:id/send', adminPushCampaignsController.sendBroadcast);
router.get('/push-campaigns/:id/eligible-count', adminPushCampaignsController.eligibleCount);

// Geo IP allowlist (bypass geo-blocking for specific IPs)
router.get('/geo-ip-allowlist', adminGeoIpAllowlistController.list);
router.post('/geo-ip-allowlist', adminGeoIpAllowlistController.create);
router.delete('/geo-ip-allowlist/:id', adminGeoIpAllowlistController.remove);

router.get('/fingerprint-signup-ip-allowlist', adminFingerprintSignupIpAllowlistController.list);
router.post('/fingerprint-signup-ip-allowlist', adminFingerprintSignupIpAllowlistController.create);
router.delete('/fingerprint-signup-ip-allowlist/:id', adminFingerprintSignupIpAllowlistController.remove);

// Didit KYC (require verification before withdraw) — master_admin
router.get('/didit-kyc/reports/filter-options', adminDiditKycController.getReportsFilterOptions);
router.get('/didit-kyc/reports/summary', adminDiditKycController.getReportsSummary);
router.get('/didit-kyc/reports', adminDiditKycController.getReports);
router.get('/didit-kyc', adminDiditKycController.getSettings);
router.patch('/didit-kyc', adminDiditKycController.updateSettings);
router.get('/phone-verification', adminPhoneVerificationController.getSettings);
router.patch('/phone-verification', adminPhoneVerificationController.updateSettings);

module.exports = router;
