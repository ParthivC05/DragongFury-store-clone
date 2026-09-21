'use strict';

const db = require('../../db/models');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');
const {
  getPlayableBalance,
  applyBalanceDelta,
  applyRollbackDelta
} = require('../gitslotpark/callbacks/gitslotparkCallbackWallet.service');
const { canUserPlayGames } = require('../games/gamePlayEligibility.service');
const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');
const { resolveBonaConfig } = require('./bona.config');
const {
  verifyXSign,
  SEAMLESS_CODE,
  seamlessOk,
  seamlessError
} = require('./bonaXSign.helpers');
const { platformTxId } = require('./bonaWallet.helpers');
const { createLogger } = require('../../libs/logger');

const log = createLogger('bonaCallback');

function headerXSign(req) {
  return (
    req.get?.('x-sign') ||
    req.headers?.['x-sign'] ||
    req.headers?.['X-Sign'] ||
    ''
  );
}

function rawBodyOf(req) {
  if (typeof req.rawBody === 'string' && req.rawBody) return req.rawBody;
  try {
    return JSON.stringify(req.body || {});
  } catch (_) {
    return '';
  }
}

function assertAuth(req) {
  const ok = verifyXSign(rawBodyOf(req), headerXSign(req));
  if (!ok) {
    log.warn('Bona X-Sign verification failed', {
      path: req.path,
      hasRawBody: Boolean(req.rawBody),
      username: req.body?.username || null,
      userId: req.body?.userId ?? null,
      transactionId: req.body?.transactionId || null
    });
    return seamlessError(SEAMLESS_CODE.VERIFICATION_FAILED);
  }
  return null;
}

async function resolvePlatformUser(body) {
  const username = body?.username != null ? String(body.username).trim() : '';
  const bonaUid = body?.userId != null ? String(body.userId).trim() : '';

  if (db.BonaUserMapping) {
    if (bonaUid) {
      const byUid = await db.BonaUserMapping.findOne({ where: { bonaUid } });
      if (byUid) return { userId: byUid.userId, mapping: byUid };
    }
    if (username) {
      const byName = await db.BonaUserMapping.findOne({ where: { bonaUsername: username } });
      if (byName) return { userId: byName.userId, mapping: byName };
    }
  }

  if (/^u\d+$/i.test(username)) {
    const userId = Number(username.slice(1));
    if (Number.isInteger(userId) && userId > 0) {
      return { userId, mapping: null };
    }
  }

  log.warn('Bona user not resolved', { username: username || null, bonaUid: bonaUid || null });
  return null;
}

async function findTx(transactionId) {
  if (!db.GitslotparkTransaction || !transactionId) return null;
  return db.GitslotparkTransaction.findOne({
    where: { transactionId: String(transactionId), provider: 'bona' }
  });
}

async function recordTx(row, transaction) {
  if (!db.GitslotparkTransaction) return;
  await db.GitslotparkTransaction.create(
    {
      provider: 'bona',
      platformTransactionId: row.platformTransactionId || platformTxId(),
      status: 'completed',
      ...row
    },
    { transaction }
  );
}

/**
 * POST Query — return playable SC balance.
 */
async function queryCallback(req) {
  const authErr = assertAuth(req);
  if (authErr) return authErr;

  const body = req.body || {};
  if (!body.username && body.userId == null) {
    return seamlessError(SEAMLESS_CODE.INVALID_PARAMS);
  }

  const resolved = await resolvePlatformUser(body);
  if (!resolved) return seamlessError(SEAMLESS_CODE.USER_NOT_FOUND);

  try {
    const balance = await getPlayableBalance(resolved.userId);
    return seamlessOk(balance, body.currency || resolveBonaConfig().currency);
  } catch (_) {
    return seamlessError(SEAMLESS_CODE.SYSTEM_ERROR);
  }
}

/**
 * POST Bet — debit `balance` (bet amount) from platform wallet.
 */
async function betCallback(req) {
  const authErr = assertAuth(req);
  if (authErr) return authErr;

  const body = req.body || {};
  const transactionId = body.transactionId != null ? String(body.transactionId).trim() : '';
  const betAmount = formatBalance(body.balance);
  const gameId = body.gameId != null ? Number(body.gameId) : null;

  if (!transactionId || !body.username) {
    return seamlessError(SEAMLESS_CODE.INVALID_PARAMS);
  }
  if (betAmount < 0) {
    return seamlessError(SEAMLESS_CODE.INVALID_PARAMS);
  }

  const resolved = await resolvePlatformUser(body);
  if (!resolved) return seamlessError(SEAMLESS_CODE.USER_NOT_FOUND);

  const canPlay = await canUserPlayGames(resolved.userId);
  if (!canPlay) return seamlessError(SEAMLESS_CODE.BETTING_NOT_ALLOWED);

  const existing = await findTx(transactionId);
  if (existing) {
    return seamlessError(SEAMLESS_CODE.DUPLICATE, formatBalance(existing.balanceAfter));
  }

  try {
    const balanceAfter = await db.sequelize.transaction(async (t) => {
      const after = await applyBalanceDelta(
        resolved.userId,
        -betAmount,
        {
          type: 'bona_bet',
          description: `Bona bet ${transactionId}`,
          metadata: {
            provider: 'bona',
            transactionId,
            gameId,
            gameRoundId: body.gameRoundId,
            token: body.token
          }
        },
        t
      );

      await recordTx(
        {
          transactionId,
          refTransactionId: body.gameRoundId ? String(body.gameRoundId) : null,
          userId: resolved.userId,
          operation: 'withdraw',
          amount: betAmount,
          betAmount,
          winAmount: null,
          balanceAfter: Number(after) || 0,
          gameId: Number.isFinite(gameId) ? gameId : null,
          roundId: body.gameRoundId ? String(body.gameRoundId) : null
        },
        t
      );

      return after;
    });

    notifyUserBalanceChanged(resolved.userId);
    return seamlessOk(balanceAfter, body.currency || resolveBonaConfig().currency);
  } catch (err) {
    if (err.code === 6 || String(err.message || '').toLowerCase().includes('insufficient')) {
      return seamlessError(SEAMLESS_CODE.BETTING_LIMIT);
    }
    return seamlessError(SEAMLESS_CODE.SYSTEM_ERROR);
  }
}

/**
 * Settlement / Activity / Fishing — credit or apply net delta.
 * type 101 = refund (credit).
 * Fishing: balance field is already net (totalPayout - bet).
 */
async function settlementCallback(req, { fishing = false, activity = false } = {}) {
  const authErr = assertAuth(req);
  if (authErr) return authErr;

  const body = req.body || {};
  const transactionId = body.transactionId != null ? String(body.transactionId).trim() : '';
  const type = Number(body.type);
  const gameId = body.gameId != null ? Number(body.gameId) : null;

  if (!transactionId || !body.username) {
    return seamlessError(SEAMLESS_CODE.INVALID_PARAMS);
  }

  const resolved = await resolvePlatformUser(body);
  if (!resolved) return seamlessError(SEAMLESS_CODE.USER_NOT_FOUND);

  const existing = await findTx(transactionId);
  if (existing) {
    return seamlessError(SEAMLESS_CODE.DUPLICATE, formatBalance(existing.balanceAfter));
  }

  // Refund: credit amount; may reverse prior bet if we find related round
  const isRefund = type === 101;
  let delta;
  let operation;
  let betAmount = null;
  let winAmount = null;

  if (fishing) {
    // Docs: use balance as net update (= totalPayout - bet)
    delta = formatBalance(body.balance);
    const bet = formatBalance(body.bet);
    const win = formatBalance(body.totalPayout);
    betAmount = bet > 0 ? bet : null;
    winAmount = win > 0 ? win : null;
    operation = bet > 0 && win > 0 ? 'betwin' : delta >= 0 ? 'deposit' : 'withdraw';
  } else if (isRefund) {
    delta = formatBalance(body.balance);
    operation = 'rollback';
  } else {
    // Normal settlement / activity: incremental credit
    delta = formatBalance(body.balance);
    winAmount = delta > 0 ? delta : null;
    operation = 'deposit';
  }

  // Schedule UI delay before wallet write so afterUpdate hooks cannot push early at 150ms.
  const WIN_BALANCE_UI_DELAY_MS = 3000;
  const shouldDelayUi = !isRefund && (Number(delta) > 0 || Number(winAmount) > 0);
  if (shouldDelayUi) {
    notifyUserBalanceChanged(resolved.userId, { delayMs: WIN_BALANCE_UI_DELAY_MS });
  }

  try {
    const balanceAfter = await db.sequelize.transaction(async (t) => {
      let after;
      if (isRefund && !fishing) {
        // Prefer stored impact rollback when a prior bet exists for same round
        const priorBet = body.gameRoundId
          ? await db.GitslotparkTransaction.findOne({
              where: {
                provider: 'bona',
                userId: resolved.userId,
                roundId: String(body.gameRoundId),
                operation: 'withdraw'
              },
              order: [['id', 'DESC']],
              transaction: t
            })
          : null;

        if (priorBet) {
          after = await applyRollbackDelta(
            resolved.userId,
            priorBet.transactionId,
            formatBalance(priorBet.amount),
            {
              type: 'bona_refund',
              description: `Bona refund ${transactionId}`,
              metadata: { transactionId, ref: priorBet.transactionId }
            },
            t
          );
          await priorBet.update({ status: 'rolled_back' }, { transaction: t });
        } else {
          after = await applyBalanceDelta(
            resolved.userId,
            Math.abs(delta),
            {
              type: 'bona_refund',
              description: `Bona refund ${transactionId}`,
              metadata: { transactionId, gameId }
            },
            t
          );
        }
      } else if (fishing && betAmount != null && winAmount != null) {
        after = await applyBalanceDelta(
          resolved.userId,
          delta,
          {
            type: 'bona_fishing',
            description: `Bona fishing ${transactionId}`,
            metadata: { transactionId, gameId, bet: betAmount, win: winAmount }
          },
          t,
          { betAmount, winAmount }
        );
      } else {
        after = await applyBalanceDelta(
          resolved.userId,
          delta,
          {
            type: activity ? 'bona_activity' : 'bona_settlement',
            description: `Bona settlement ${transactionId}`,
            metadata: {
              transactionId,
              gameId,
              type,
              activityType: body.activityType,
              fishing
            }
          },
          t
        );
      }

      await recordTx(
        {
          transactionId,
          refTransactionId: body.gameRoundId ? String(body.gameRoundId) : null,
          userId: resolved.userId,
          operation,
          amount: formatBalance(Math.abs(delta)),
          betAmount,
          winAmount,
          balanceAfter: Number(after) || 0,
          gameId: Number.isFinite(gameId) ? gameId : null,
          roundId: body.gameRoundId ? String(body.gameRoundId) : null,
          status: isRefund ? 'rolled_back' : 'completed'
        },
        t
      );

      return after;
    });

    // Wins were pre-scheduled with delay; refunds / non-wins push immediately.
    if (!shouldDelayUi) {
      notifyUserBalanceChanged(resolved.userId);
    }
    return seamlessOk(balanceAfter, body.currency || resolveBonaConfig().currency);
  } catch (err) {
    if (err.code === 6 || String(err.message || '').toLowerCase().includes('insufficient')) {
      return seamlessError(SEAMLESS_CODE.BETTING_LIMIT);
    }
    return seamlessError(SEAMLESS_CODE.SYSTEM_ERROR);
  }
}

module.exports = {
  queryCallback,
  betCallback,
  settlementCallback,
  resolvePlatformUser,
  SEAMLESS_CODE
};
