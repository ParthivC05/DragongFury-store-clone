'use strict';

const db = require('../../db/models');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');
const { resolveBonaConfig } = require('./bona.config');
const bonaClient = require('./bona.client');
const { getBonaUsernameForUser } = require('./bonaUser.helpers');
const { recordSlotsTransaction, platformTxId } = require('./bonaWallet.helpers');

function mapRecordOperation(bet, win) {
  const b = formatBalance(bet);
  const w = formatBalance(win);
  if (b > 0 && w > 0) return { operation: 'betwin', amount: formatBalance(w - b), betAmount: b, winAmount: w };
  if (b > 0) return { operation: 'withdraw', amount: b, betAmount: b, winAmount: null };
  if (w > 0) return { operation: 'deposit', amount: w, betAmount: null, winAmount: w };
  return { operation: 'betwin', amount: 0, betAmount: 0, winAmount: 0 };
}

/**
 * Sync Bona extendGameBet records into gitslotpark_transactions (provider=bona).
 */
async function syncUserGameRecords({ userId, bonaUsername = null, hoursBack = 24 } = {}) {
  if (!userId || !db.GitslotparkTransaction) {
    return { inserted: 0, skipped: 0 };
  }

  const username = bonaUsername || (await getBonaUsernameForUser(userId));
  if (!username) return { inserted: 0, skipped: 0 };

  const { currency } = resolveBonaConfig();
  const end = Date.now();
  const begin = end - Math.max(1, Number(hoursBack) || 24) * 60 * 60 * 1000;

  let pageNo = 1;
  const pageSize = 100;
  let inserted = 0;
  let skipped = 0;
  let total = Infinity;

  while ((pageNo - 1) * pageSize < total && pageNo <= 20) {
    const payload = await bonaClient.extendGameBet({
      username,
      begin,
      end,
      pageNo,
      pageSize,
      currency,
      isStop: 1
    });

    const data = payload.data || {};
    total = Number(data.total) || 0;
    const list = Array.isArray(data.list) ? data.list : [];
    if (!list.length) break;

    for (const rec of list) {
      const recordId = String(rec.recordId || '').trim();
      if (!recordId) continue;

      const transactionId = `bona_rec_${recordId}`;
      const existing = await db.GitslotparkTransaction.findOne({
        where: { transactionId }
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const mapped = mapRecordOperation(rec.bet, rec.win);
      const endScore = formatBalance(rec.endScore);
      const gameId = rec.gameId != null ? Number(rec.gameId) : null;
      const createdAt = rec.time ? new Date(Number(rec.time)) : new Date();

      await recordSlotsTransaction({
        transactionId,
        refTransactionId: rec.requestId ? String(rec.requestId) : null,
        platformTransactionId: platformTxId(),
        userId,
        operation: mapped.operation,
        amount: mapped.amount,
        betAmount: mapped.betAmount,
        winAmount: mapped.winAmount,
        balanceAfter: endScore,
        gameId: Number.isFinite(gameId) ? gameId : null,
        roundId: rec.gameRoundId ? String(rec.gameRoundId) : (rec.roundId != null ? String(rec.roundId) : null),
        provider: 'bona',
        createdAt
      });
      inserted += 1;
    }

    pageNo += 1;
  }

  return { inserted, skipped, total: Number.isFinite(total) ? total : inserted + skipped };
}

module.exports = { syncUserGameRecords, mapRecordOperation };
