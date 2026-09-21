'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { sendSubscriptionExpiringSoonEmail, sendSubscriptionExpiresTomorrowEmail } = require('../../utils/email');
const { getStoreAdminEmails } = require('./getStoreAdminEmails.service');
const { createLogger } = require('../../libs/logger');

const logger = createLogger('subscriptionNotifications');

const DAYS_AHEAD = 7;

/** True if endsAt falls on the calendar day that is `daysFromNow` days from today (e.g. 1 = tomorrow). */
function isEndingOnDay(endsAt, daysFromNow) {
  const end = new Date(endsAt);
  const target = new Date();
  target.setDate(target.getDate() + daysFromNow);
  target.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end.getTime() === target.getTime();
}

/**
 * Find active store subscriptions ending within the next 7 days and send "expiring soon" or "expires tomorrow" email.
 * - Ends in 1 day: "Your subscription expires tomorrow"
 * - Ends in 2–7 days: "Your subscription is expiring soon"
 * Call from cron daily (e.g. GET /api/cron/subscription-expiring?secret=CRON_SECRET).
 * @returns {{ sent: number, errors: number }}
 */
async function runExpiringSoonEmails() {
  const now = new Date();
  const future = new Date(now);
  future.setDate(future.getDate() + DAYS_AHEAD);
  future.setHours(23, 59, 59, 999);

  const subscriptions = await db.StoreSubscription.findAll({
    where: {
      status: 'active',
      startsAt: { [Op.lte]: now },
      endsAt: {
        [Op.gte]: now,
        [Op.lte]: future
      }
    },
    include: [{ model: db.Subscription, as: 'Subscription', attributes: ['id', 'name'] }]
  });

  let sent = 0;
  let errors = 0;

  for (const row of subscriptions) {
    const planName = row.Subscription ? row.Subscription.name : 'Current';
    const emails = await getStoreAdminEmails(row.distributorCode, row.storeCode);
    const sendTomorrow = isEndingOnDay(row.endsAt, 1);
    const sendFn = sendTomorrow ? sendSubscriptionExpiresTomorrowEmail : sendSubscriptionExpiringSoonEmail;
    for (const email of emails) {
      try {
        await sendFn(email, { planName, endsAt: row.endsAt });
        sent++;
      } catch (err) {
        logger.error({ err: err.message, email, storeCode: row.storeCode }, 'Subscription expiring email failed');
        errors++;
      }
    }
  }

  if (sent > 0 || errors > 0) {
    logger.info({ sent, errors, count: subscriptions.length }, 'Subscription expiring-soon emails run');
  }
  return { sent, errors };
}

module.exports = { runExpiringSoonEmails };
