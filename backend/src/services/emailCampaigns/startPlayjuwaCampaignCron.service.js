'use strict';

const { createLogger } = require('../../libs/logger');
const { runPlayjuwaNoDepositCampaigns } = require('./runPlayjuwaNoDepositCampaign.service');

const logger = createLogger('email-campaign-inprocess-cron');

/** Fixed production interval — do not change via env. */
const INTERVAL_MINUTES = 15;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

/**
 * In-process scheduler. Always runs every 15 minutes with the API process.
 * Actual sending is gated by admin campaign `is_enabled` (and test mode / allowlist)
 * inside runPlayjuwaNoDepositCampaigns — no separate env enable flag.
 */
function startPlayjuwaCampaignCron() {
  let running = false;

  const tick = () => {
    if (running) {
      logger.warn('DragonFury campaign cron skipped — previous run still in progress');
      return;
    }
    running = true;
    runPlayjuwaNoDepositCampaigns()
      .then((result) => {
        if (result?.campaigns > 0 || result?.reason) {
          logger.info(result, 'DragonFury campaign cron finished');
        }
      })
      .catch((err) => {
        logger.error({ err: err.message }, 'DragonFury campaign cron failed');
      })
      .finally(() => {
        running = false;
      });
  };

  setTimeout(tick, 90 * 1000);
  setInterval(tick, INTERVAL_MS);

  logger.info({ everyMinutes: INTERVAL_MINUTES }, 'DragonFury campaign in-process cron started');
  return { started: true, everyMinutes: INTERVAL_MINUTES };
}

module.exports = { startPlayjuwaCampaignCron };
