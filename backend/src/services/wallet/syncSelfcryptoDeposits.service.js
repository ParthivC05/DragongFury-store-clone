'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { checkPending } = require('../paymentProviders/selfcrypto/selfcrypto.watchers');
const { completeDepositFromSelfcrypto } = require('../wallet/completeDepositFromSelfcrypto.service');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');

const PROVIDER = 'selfcrypto';
const PAGE_SIZE = 25;

async function creditIfPaid(pending, result) {
  if (!result?.paid) return { credited: false, confirming: !!result?.confirming };
  await completeDepositFromSelfcrypto({
    transactionId: pending.providerSessionId,
    userId: pending.userId,
    amount: Number(pending.amount),
    cryptoCurrency: pending.targetCurrency || null,
    txHash: result.txHash || null
  });
  await pending.update({ status: 'completed' });
  return { credited: true, confirming: false };
}

/**
 * Scan open Direct Crypto invoices and credit when the chain (or Lightning) confirms.
 */
async function syncSelfcryptoDeposits() {
  const summary = { checked: 0, credited: 0, confirming: 0, expired: 0, errors: 0 };
  const now = new Date();

  const rows = await db.PaymentPendingDeposit.findAll({
    where: {
      provider: PROVIDER,
      status: { [Op.in]: ['pending', 'confirming'] }
    },
    order: [['id', 'ASC']],
    limit: PAGE_SIZE
  });

  for (const pending of rows) {
    summary.checked += 1;
    try {
      if (pending.expiresAt && new Date(pending.expiresAt).getTime() < now.getTime()) {
        const result = await checkPending(pending);
        if (result.paid) {
          const out = await creditIfPaid(pending, result);
          if (out.credited) summary.credited += 1;
        } else {
          await pending.update({ status: 'expired' });
          summary.expired += 1;
        }
        continue;
      }

      const result = await checkPending(pending);
      if (result.expired) {
        await pending.update({ status: 'expired' });
        summary.expired += 1;
        continue;
      }
      if (result.paid) {
        const out = await creditIfPaid(pending, result);
        if (out.credited) summary.credited += 1;
        continue;
      }
      if (result.confirming && pending.status !== 'confirming') {
        await pending.update({ status: 'confirming' });
        summary.confirming += 1;
      }
    } catch (err) {
      summary.errors += 1;
      paymentErrorLog('syncSelfcryptoDeposits item failed', pending.id, err.message);
    }
  }

  if (summary.checked > 0) {
    paymentLog('syncSelfcryptoDeposits', summary);
  }
  return summary;
}

module.exports = { syncSelfcryptoDeposits };
