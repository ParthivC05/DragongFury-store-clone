const path = require('path');
const backendRoot = path.resolve(__dirname);
require('dotenv').config({ path: path.join(backendRoot, '.env'), override: true });
const http = require('http');
const config = require('./src/configs/app.config');
const app = require('./src/rest-resources');
const db = require('./src/db/models');
const { logger, infoBlue, logEnvOnce, paymentLog, paymentErrorLog } = require('./src/libs/logger');

logEnvOnce();
if (process.env.PAYMENT_LOG_ENABLED === 'true' || process.env.PAYMENT_LOG_ENABLED === '1') {
  paymentLog('Payment API logging enabled');
}
if (process.env.PAYMENT_ERROR_LOG_ENABLED === 'true' || process.env.PAYMENT_ERROR_LOG_ENABLED === '1') {
  paymentErrorLog('Payment error logging enabled');
}

const port = config.get('port') || 8080;
const server = http.createServer(app);

async function start() {
  try {
    await db.sequelize.authenticate();
    infoBlue('Database connected');

    try {
      const { initSocket } = require('./src/services/realtime/socket.service');
      const { attachWalletBalanceHooks } = require('./src/services/realtime/walletBalanceHooks');
      initSocket(server);
      attachWalletBalanceHooks(db);
      infoBlue('Realtime wallet sockets ready');
    } catch (e) {
      logger.warn('Realtime socket init skip:', e.message);
    }

    try {
      if (db.Setting) {
        const { DEFAULTS } = require('./src/services/wallet/getWalletLimits.service');
        await db.Setting.findOrCreate({
          where: { key: 'wallet_limits', distributorCode: null, storeCode: null },
          defaults: { key: 'wallet_limits', distributorCode: null, storeCode: null, value: JSON.stringify(DEFAULTS) }
        });
        infoBlue('Wallet limits settings ready');
      }
    } catch (e) {
      logger.warn('Wallet limits seed skip:', e.message);
    }
    try {
      if (db.Setting) {
        const { DEFAULTS } = require('./src/services/affiliate/getAffiliateSettings.service');
        await db.Setting.findOrCreate({
          where: { key: 'affiliate_settings', distributorCode: null, storeCode: null },
          defaults: { key: 'affiliate_settings', distributorCode: null, storeCode: null, value: JSON.stringify(DEFAULTS) }
        });
        infoBlue('Affiliate settings ready');
      }
    } catch (e) {
      logger.warn('Affiliate settings seed skip:', e.message);
    }
    try {
      if (db.Setting) {
        const { DEFAULT_CURRENCY, CURRENCY_KEY } = require('./src/services/wallet/getCurrencySetting.service');
        await db.Setting.findOrCreate({
          where: { key: CURRENCY_KEY },
          defaults: { key: CURRENCY_KEY, value: DEFAULT_CURRENCY }
        });
        infoBlue('Currency setting ready');
      }
    } catch (e) {
      logger.warn('Currency setting seed skip:', e.message);
    }
    try {
      const { expirePendingDepositRequests } = require('./src/services/games/expirePendingDepositRequests.service');
      const { expirePendingChimeDepositRequests } = require('./src/services/wallet/expirePendingChimeDepositRequests.service');
      const { expireDailyBonusVouchers } = require('./src/services/dailyBonus/expireDailyBonusVouchers.service');
      const { syncProcessingDollarpayWithdrawals } = require('./src/services/wallet/syncProcessingDollarpayWithdrawals.service');
      const { syncProcessingXxpayWithdrawals } = require('./src/services/wallet/syncProcessingXxpayWithdrawals.service');
      const { syncProcessingXxpayDeposits } = require('./src/services/wallet/syncProcessingXxpayDeposits.service');
      const { expireOrionstarsPendingDeposits } = require('./src/services/wallet/expireOrionstarsPendingDeposits.service');
      const { syncSelfcryptoDeposits } = require('./src/services/wallet/syncSelfcryptoDeposits.service');
      const RUN_EXPIRY_INTERVAL_MS = 2 * 60 * 1000; // every 2 min; expiry is 3 hours for pending deposits
      const RUN_DOLLARPAY_PAYOUT_SYNC_MS = 5 * 60 * 1000; // every 5 min
      const RUN_XXPAY_SYNC_MS = 5 * 60 * 1000; // every 5 min (allowlisted stores only)
      const RUN_ORIONSTARSPAY_EXPIRE_MS = 2 * 60 * 1000; // every 2 min; unpaid Orion deposits expire after 24h
      const RUN_SELFCRYPTO_SYNC_MS = 30 * 1000;
      setInterval(() => {
        expirePendingDepositRequests().then((r) => {
          if (r.expired > 0) logger.info({ expired: r.expired, errors: r.errors }, 'Expired pending deposit requests');
        }).catch((e) => logger.error({ err: e }, 'Expire pending deposits job failed'));
        expirePendingChimeDepositRequests().then((r) => {
          if (r.expired > 0) logger.info({ expired: r.expired, errors: r.errors }, 'Auto-rejected pending Chime deposit requests');
        }).catch((e) => logger.error({ err: e }, 'Expire pending Chime deposits job failed'));
        expireDailyBonusVouchers().catch((e) =>
          logger.error({ err: e }, 'Expire daily bonus vouchers job failed')
        );
      }, RUN_EXPIRY_INTERVAL_MS);
      infoBlue('Expire pending deposits job started (every 2 min)');

      const runDollarpayPayoutSync = () => {
        syncProcessingDollarpayWithdrawals()
          .then((r) => {
            if (r.checked > 0) {
              logger.info(r, 'DollarPay processing withdrawals sync');
            }
          })
          .catch((e) => logger.error({ err: e }, 'DollarPay withdrawals sync job failed'));
      };
      setTimeout(runDollarpayPayoutSync, 30 * 1000);
      setInterval(runDollarpayPayoutSync, RUN_DOLLARPAY_PAYOUT_SYNC_MS);
      infoBlue('DollarPay payout status sync job started (every 5 min)');

      const runXxpaySync = () => {
        syncProcessingXxpayDeposits()
          .then((r) => {
            if (r.checked > 0) logger.info(r, 'XXPay deposits sync (allowlisted stores)');
          })
          .catch((e) => logger.error({ err: e }, 'XXPay deposits sync job failed'));
        syncProcessingXxpayWithdrawals()
          .then((r) => {
            if (r.checked > 0) logger.info(r, 'XXPay withdrawals sync (allowlisted stores)');
          })
          .catch((e) => logger.error({ err: e }, 'XXPay withdrawals sync job failed'));
      };
      setTimeout(runXxpaySync, 45 * 1000);
      setInterval(runXxpaySync, RUN_XXPAY_SYNC_MS);
      infoBlue('XXPay pay-in/payout status sync job started (every 5 min, allowlisted stores only)');

      const runOrionstarsExpire = () => {
        expireOrionstarsPendingDeposits()
          .then((r) => {
            if (r.expiredOrders > 0 || r.expiredPending > 0) {
              logger.info(r, 'Orionstars Pay unpaid deposits expired');
            }
          })
          .catch((e) => logger.error({ err: e }, 'Orionstars Pay expire deposits job failed'));
      };
      setTimeout(runOrionstarsExpire, 60 * 1000);
      setInterval(runOrionstarsExpire, RUN_ORIONSTARSPAY_EXPIRE_MS);
      infoBlue('Orionstars Pay expire unpaid deposits job started (every 2 min, 24h window)');

      const runSelfcryptoSync = () => {
        syncSelfcryptoDeposits()
          .then((r) => {
            if (r.checked > 0) logger.info(r, 'Direct crypto deposits sync');
          })
          .catch((e) => logger.error({ err: e }, 'Direct crypto deposits sync job failed'));
      };
      setTimeout(runSelfcryptoSync, 20 * 1000);
      setInterval(runSelfcryptoSync, RUN_SELFCRYPTO_SYNC_MS);
      infoBlue('Direct crypto deposit watcher started (every 30s)');

      try {
        const { startPlayjuwaCampaignCron } = require('./src/services/emailCampaigns/startPlayjuwaCampaignCron.service');
        const campaignCron = startPlayjuwaCampaignCron();
        if (campaignCron.started) {
          infoBlue(`DragonFury email campaign cron started (every ${campaignCron.everyMinutes} min)`);
        }
      } catch (e) {
        logger.warn('DragonFury campaign cron skip:', e.message);
      }
    } catch (e) {
      logger.warn('Expire pending deposits job skip:', e.message);
    }
  } catch (err) {
    logger.warn(
      `Database not connected. Wallet, auth and data will not work. Error: ${err.message}`
    );
    if (process.env.DB_SSL !== 'false') {
      logger.warn('Tip: For local PostgreSQL without SSL, set DB_SSL=false in .env');
    }
    logger.warn(
      'Check: PostgreSQL running, and .env has DB_NAME, DB_USER, DB_PASSWORD, DB_WRITE_HOST (default localhost), DB_PORT (default 5432)'
    );
  }

  server.listen(port, () => {
    infoBlue(`Backend running at http://localhost:${port}`);
    infoBlue(`Test API: http://localhost:${port}/api/status`);
    infoBlue(`Swagger docs: http://localhost:${port}/docs`);
    try {
      const selfcryptoConfig = require('./src/services/paymentProviders/selfcrypto/selfcrypto.config');
      infoBlue(
        `Direct crypto: wallet=${selfcryptoConfig.hasMnemonic() ? 'yes' : 'no'} lightning=${selfcryptoConfig.lightningConfigured() ? 'yes' : 'no'}`
      );
    } catch (_) {}
    try {
      const { warmOneGameHubGamesCache } = require('./src/services/onegamehub');
      setTimeout(() => warmOneGameHubGamesCache(), 300);
    } catch (_) {}
  });
}

start().catch((err) => {
  logger.error(err);
  process.exit(1);
});
