const express = require('express');
const db = require('../../db/models');
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const walletRoutes = require('./wallet.routes');
const transactionsRoutes = require('./transactions.routes');
const affiliateRoutes = require('./affiliate.routes');
const userRoutes = require('./user.routes');
const spinWheelRoutes = require('./spinWheel.routes');
const promotionsRoutes = require('./promotions.routes');
const notificationsRoutes = require('./notifications.routes');
const vipRoutes = require('./vip.routes');
const paymentsRoutes = require('./payments.routes');
const withdrawRoutes = require('./withdraw.routes');
const gamesRoutes = require('./games.routes');
const gamesController = require('../controllers/games.controller');
const { authMiddlewareOptional, authMiddlewareWithBodyToken } = require('../middlewares/auth.middleware');
const gameRoutes = require('./game.routes');
const cronRoutes = require('./cron.routes');
const helpRoutes = require('./help.routes');
const blogRoutes = require('./blog.routes');
const blogSeoRoutes = require('./blogSeo.routes');
const link2playRoutes = require('./link2play.routes');
const footerRoutes = require('./footer.routes');
const legalRoutes = require('./legal.routes');
const socialLinksRoutes = require('./socialLinks.routes');
const slotProvidersRoutes = require('./slotProviders.routes');
const landingPaymentLinksRoutes = require('./landingPaymentLinks.routes');
const dashboardPromoModalsRoutes = require('./dashboardPromoModals.routes');
const depositBonusesRoutes = require('./depositBonuses.routes');
const depositPackagesRoutes = require('./depositPackages.routes');
const welcomeSignupBonusRoutes = require('./welcomeSignupBonus.routes');
const dashboardSlideshowRoutes = require('./dashboardSlideshow.routes');
const landingWinnersRoutes = require('./landingWinners.routes');
const dailyBonusRoutes = require('./dailyBonus.routes');
const emailCampaignsRoutes = require('./emailCampaigns.routes');
const pushCampaignsRoutes = require('./pushCampaigns.routes');
const gitslotparkRoutes = require('./gitslotpark.routes');
const bonaRoutes = require('./bona.routes');
const onegamehubRoutes = require('./onegamehub.routes');
const win568Routes = require('./win568.routes');
const scorpioRoutes = require('./scorpio.routes');
const geoRoutes = require('./geo.routes');
const kycRoutes = require('./kyc.routes');
const phoneRoutes = require('./phone.routes');
const supportTicketsRoutes = require('./supportTickets.routes');

const router = express.Router();

router.use(blogSeoRoutes);

router.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Backend connected' });
});

router.get('/api/healthcheck', async (req, res) => {
  try {
    await db.sequelize.authenticate();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: err.message });
  }
});

router.use('/api/auth', authRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/wallet', walletRoutes);
router.use('/api/transactions', transactionsRoutes);
router.use('/api/affiliate', affiliateRoutes);
router.use('/api/user', userRoutes);
router.use('/api/spinwheel', spinWheelRoutes);
router.use('/api/promotions', promotionsRoutes);
router.use('/api/notifications', notificationsRoutes);
router.use('/api/vip', vipRoutes);
router.use('/api/payments', paymentsRoutes);
router.use('/api/withdraw', withdrawRoutes);
router.get('/api/games/firekirin/exclusive', authMiddlewareOptional, gamesController.firekirinExclusiveList);
router.post('/api/games/firekirin/enter', authMiddlewareWithBodyToken, gamesController.firekirinEnter);
router.use('/api/games', gamesRoutes);
router.use('/api/games', gameRoutes);
router.use('/api/cron', cronRoutes);
router.use('/api/help', helpRoutes);
router.use('/api/blog', blogRoutes);
router.use('/api/link2play', link2playRoutes);
router.use('/api/footer', footerRoutes);
router.use('/api/legal', legalRoutes);
router.use('/api/social-links', socialLinksRoutes);
router.use('/api/slot-providers', slotProvidersRoutes);
router.use('/api/landing-payment-links', landingPaymentLinksRoutes);
router.use('/api/dashboard-promo-modals', dashboardPromoModalsRoutes);
router.use('/api/deposit-bonuses', depositBonusesRoutes);
router.use('/api/deposit-packages', depositPackagesRoutes);
router.use('/api/welcome-signup-bonus', welcomeSignupBonusRoutes);
router.use('/api/dashboard-slideshow', dashboardSlideshowRoutes);
router.use('/api/landing-winners', landingWinnersRoutes);
router.use('/api/daily-bonus', dailyBonusRoutes);
router.use('/api/email-campaigns', emailCampaignsRoutes);
router.use('/api/push-campaigns', pushCampaignsRoutes);
router.use('/api/gitslotpark', gitslotparkRoutes);
router.use('/api/bona', bonaRoutes);
router.use('/api/onegamehub', onegamehubRoutes);
router.use('/api/win568', win568Routes);
router.use('/api/scorpio', scorpioRoutes);
router.use('/api/geo', geoRoutes);
router.use('/api/kyc', kycRoutes);
router.use('/api/phone', phoneRoutes);
router.use('/api/support-tickets', supportTicketsRoutes);

module.exports = router;
