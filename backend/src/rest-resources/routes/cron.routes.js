'use strict';

const express = require('express');
const config = require('../../configs/app.config');
const { runExpiringSoonEmails } = require('../../services/subscriptionNotifications/runExpiringSoonEmails.service');
const { expirePendingDepositRequests } = require('../../services/games/expirePendingDepositRequests.service');
const { expirePendingChimeDepositRequests } = require('../../services/wallet/expirePendingChimeDepositRequests.service');
const { creditDueGiveGetReferralRewards } = require('../../services/affiliate/creditGiveGetReferralReward.service');
const { syncProcessingDollarpayWithdrawals } = require('../../services/wallet/syncProcessingDollarpayWithdrawals.service');
const { syncProcessingDollarpayDeposits } = require('../../services/wallet/syncProcessingDollarpayDeposits.service');
const { syncProcessingXxpayWithdrawals } = require('../../services/wallet/syncProcessingXxpayWithdrawals.service');
const { syncProcessingXxpayDeposits } = require('../../services/wallet/syncProcessingXxpayDeposits.service');
const { expireOrionstarsPendingDeposits } = require('../../services/wallet/expireOrionstarsPendingDeposits.service');
const { runPlayjuwaNoDepositCampaigns } = require('../../services/emailCampaigns/runPlayjuwaNoDepositCampaign.service');
const { createLogger } = require('../../libs/logger');

const logger = createLogger('cron');
const router = express.Router();

function checkCronSecret(req) {
  const secret = (config.get('cron.secret') || '').trim();
  // Fail closed when secret is configured; when unset, allow only non-production for local/dev.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') return false;
    return true;
  }
  const provided = req.query.secret || req.headers['x-cron-secret'] || '';
  return provided === secret;
}

router.get('/subscription-expiring', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await runExpiringSoonEmails();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron subscription-expiring failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Expire pending deposit requests older than 3 hours: refund amount + 1 SC and notify user. */
router.get('/expire-pending-deposits', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await expirePendingDepositRequests();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron expire-pending-deposits failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Auto-reject pending Chime deposit requests older than 3 hours and notify the user. */
router.get('/expire-pending-chime-deposits', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await expirePendingChimeDepositRequests();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron expire-pending-chime-deposits failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Credit Dragon Fury Give 15 / Get 15 referral rewards after playthrough + 24h delay. */
router.get('/credit-referral-rewards', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await creditDueGiveGetReferralRewards();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron credit-referral-rewards failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Sync DollarPay processing withdrawals via payout query (backup to webhook). */
router.get('/sync-dollarpay-withdrawals', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await syncProcessingDollarpayWithdrawals();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron sync-dollarpay-withdrawals failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Reconcile open DollarPay deposits across all stores (backup to webhook).
 * Schedule every 1–2 minutes so missed webhooks still credit SC within ~5 minutes.
 * Example: GET /api/cron/sync-dollarpay-deposits?secret=CRON_SECRET
 */
router.get('/sync-dollarpay-deposits', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await syncProcessingDollarpayDeposits();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron sync-dollarpay-deposits failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Reconcile open XXPay deposits for allowlisted stores only (backup to webhook).
 * Schedule every 1–2 minutes alongside DollarPay deposit sync.
 * Example: GET /api/cron/sync-xxpay-deposits?secret=CRON_SECRET
 */
router.get('/sync-xxpay-deposits', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await syncProcessingXxpayDeposits();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron sync-xxpay-deposits failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Sync XXPay processing withdrawals via transfer query (allowlisted stores only).
 * Example: GET /api/cron/sync-xxpay-withdrawals?secret=CRON_SECRET
 */
router.get('/sync-xxpay-withdrawals', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await syncProcessingXxpayWithdrawals();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron sync-xxpay-withdrawals failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Expire unpaid Orionstars Pay deposits older than 24h (newest first, batched).
 * Already expired rows are skipped. Schedule every 1–5 minutes for large backlogs.
 * Example: GET /api/cron/expire-orionstarspay-deposits?secret=CRON_SECRET
 */
router.get('/expire-orionstarspay-deposits', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await expireOrionstarsPendingDeposits();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron expire-orionstarspay-deposits failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * DragonFury only: enqueue + batch-send no-deposit reengagement emails.
 * In-process cron runs every 15 min; sending gated by admin is_enabled.
 * Manual: GET /api/cron/dragonfury-no-deposit-campaigns?secret=CRON_SECRET
 */
router.get('/dragonfury-no-deposit-campaigns', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const result = await runPlayjuwaNoDepositCampaigns();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron dragonfury-no-deposit-campaigns failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/sync-selfcrypto-deposits', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const { syncSelfcryptoDeposits } = require('../../services/wallet/syncSelfcryptoDeposits.service');
    const result = await syncSelfcryptoDeposits();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron sync-selfcrypto-deposits failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** Save yesterday's PSC / Bonus / RSC end-of-day story. */
router.get('/wallet-sc-daily-tally', async (req, res) => {
  if (!checkCronSecret(req)) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  try {
    const { persistYesterdayWalletScTally } = require('../../services/adminWalletScReconciliation/persistYesterdayWalletScTally.service');
    const result = await persistYesterdayWalletScTally();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err: err.message }, 'Cron wallet-sc-daily-tally failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
