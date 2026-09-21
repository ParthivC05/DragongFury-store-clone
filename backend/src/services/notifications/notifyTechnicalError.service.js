'use strict';

const { getTechnicalErrorNotificationEmails } = require('./getTechnicalErrorNotificationEmails.service');
const { sendTechnicalErrorEmail } = require('../../utils/email');
const { logger } = require('../../libs/logger');

/**
 * Notify all master_admin users with "technical error email notification" permission.
 * Called fire-and-forget from the global error handler; never throws.
 * @param {{ message: string, stack?: string, path?: string, method?: string }} opts
 */
async function notifyTechnicalError(opts) {
  try {
    const emails = await getTechnicalErrorNotificationEmails();
    if (!emails.length) return;
    const payload = {
      message: opts.message || 'Unknown error',
      stack: opts.stack,
      path: opts.path,
      method: opts.method
    };
    for (const to of emails) {
      try {
        await sendTechnicalErrorEmail(to, payload);
      } catch (e) {
        logger.warn({ err: e, to }, 'Failed to send technical error email to recipient');
      }
    }
  } catch (e) {
    logger.warn({ err: e }, 'Technical error notification service failed');
  }
}

module.exports = { notifyTechnicalError };
