'use strict';

const db = require('../../db/models');
const { getWalletScReconciliation } = require('./getWalletScReconciliation.service');

function yesterdayUtcDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Persist yesterday's company-wide tally so the end-of-day picture is saved.
 */
async function persistYesterdayWalletScTally() {
  if (!db.WalletScDailyTally) return { saved: false };
  const tallyDate = yesterdayUtcDate();
  const summary = await getWalletScReconciliation({
    startDate: tallyDate,
    endDate: tallyDate
  });

  const existing = await db.WalletScDailyTally.findOne({
    where: { tallyDate, storeCode: null, userId: null }
  });
  const row = {
    tallyDate,
    storeCode: null,
    userId: null,
    payload: summary,
    differencePsc: summary.dailyTally.psc.difference,
    differenceBonus: summary.dailyTally.bonus.difference,
    differenceRsc: summary.dailyTally.rsc.difference
  };
  if (existing) {
    await existing.update(row);
  } else {
    await db.WalletScDailyTally.create(row);
  }
  return {
    saved: true,
    tallyDate,
    difference: {
      psc: row.differencePsc,
      bonus: row.differenceBonus,
      rsc: row.differenceRsc
    }
  };
}

module.exports = { persistYesterdayWalletScTally };
