'use strict';

const db = require('../../db/models');
const { createLogger } = require('../../libs/logger');
const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');
const { isScorpioConfigured, resolveScorpioConfig } = require('./scorpio.config');
const { verifyRequestSignature } = require('./scorpio.sign');
const { findScorpioUser } = require('./scorpioUser.helpers');
const {
  money,
  getScorpioBalance,
  applyScorpioDebit,
  applyScorpioCredit,
  applyScorpioRollback
} = require('./scorpioWallet.service');

const log = createLogger('scorpioCallback');

const STATUS = {
  OK: 'OK',
  ERR_INVALID_ACCOUNT: 'ERR_INVALID_ACCOUNT',
  ERR_NOT_AUTHENTICATED: 'ERR_NOT_AUTHENTICATED',
  ERR_INVALID_PLAYER_ID: 'ERR_INVALID_PLAYER_ID',
  ERR_INTEGRITY_CHECK_FAILED: 'ERR_INTEGRITY_CHECK_FAILED',
  ERR_NOT_ENOUGH_MONEY: 'ERR_NOT_ENOUGH_MONEY',
  ERR_TRANSACTION_DOES_NOT_EXIST: 'ERR_TRANSACTION_DOES_NOT_EXIST',
  ERR_TRANSACTION_ROLLED_BACK: 'ERR_TRANSACTION_ROLLED_BACK',
  ERR_UNKNOWN: 'ERR_UNKNOWN'
};

function ok(balance) {
  return { balance: money(balance), statusCode: STATUS.OK };
}

function fail(statusCode, balance) {
  const body = { statusCode };
  if (balance != null && Number.isFinite(Number(balance))) {
    body.balance = money(balance);
  }
  return body;
}

function pick(body, ...keys) {
  if (!body || typeof body !== 'object') return undefined;
  const map = {};
  for (const key of Object.keys(body)) {
    map[String(key).toLowerCase()] = body[key];
  }
  for (const key of keys) {
    const value = map[String(key).toLowerCase()];
    if (value != null && value !== '') return value;
  }
  return undefined;
}

function parseCallback(body, commandHint) {
  const command = String(pick(body, 'command') || commandHint || '').trim().toLowerCase();
  return {
    command,
    transactionId: String(pick(body, 'transactionId', 'transaction_id') || '').trim(),
    referenceId: String(pick(body, 'referenceId', 'reference_id', 'refTransactionId') || '').trim(),
    playerId: String(pick(body, 'playerId', 'playerExternalId', 'player_id') || '').trim(),
    roundId: String(pick(body, 'roundId', 'round_id') || '').trim(),
    providerId: Number(pick(body, 'providerId', 'provider_id')),
    gameCode: String(pick(body, 'gameCode', 'game_code') || '').trim(),
    currency: String(pick(body, 'currency') || '').trim().toUpperCase(),
    amount: money(pick(body, 'amount') || 0)
  };
}

function isUniqueError(err) {
  return err && (err.name === 'SequelizeUniqueConstraintError' || err.code === '23505');
}

function headerSignature(req) {
  return req.get('x-request-signature') || req.get('X-Request-Signature') || '';
}

async function findTx(transactionId, t) {
  if (!transactionId || !db.ScorpioTransaction) return null;
  return db.ScorpioTransaction.findOne({
    where: { transactionId },
    lock: t ? t.LOCK.UPDATE : undefined,
    transaction: t
  });
}

async function findBetForCancel(parsed, t) {
  const referenceId = parsed.referenceId || parsed.transactionId;
  if (!referenceId) return null;
  const byRef = await findTx(referenceId, t);
  if (byRef && byRef.command === 'bet') return byRef;
  if (parsed.referenceId) {
    const listed = await db.ScorpioTransaction.findAll({
      where: { referenceId: parsed.referenceId },
      lock: t.LOCK.UPDATE,
      transaction: t,
      order: [['id', 'ASC']]
    });
    return listed.find((row) => row.command === 'bet') || null;
  }
  return null;
}

async function recordTx(fields, t) {
  return db.ScorpioTransaction.create(fields, { transaction: t });
}

async function handleBalance(parsed, user, t) {
  return ok(await getScorpioBalance(user.userId, t));
}

async function handleBet(parsed, user, t) {
  const existing = await findTx(parsed.transactionId, t);
  if (existing) {
    return ok(await getScorpioBalance(user.userId, t));
  }
  if (!parsed.transactionId) {
    return fail(STATUS.ERR_UNKNOWN, await getScorpioBalance(user.userId, t));
  }

  const balance = await applyScorpioDebit(
    user.userId,
    parsed.amount,
    parsed.transactionId,
    {
      roundId: parsed.roundId,
      gameCode: parsed.gameCode,
      providerId: parsed.providerId
    },
    t
  );

  try {
    await recordTx({
      userId: user.userId,
      transactionId: parsed.transactionId,
      referenceId: null,
      roundId: parsed.roundId || null,
      command: 'bet',
      amount: parsed.amount,
      gameCode: parsed.gameCode || null,
      providerId: Number.isFinite(parsed.providerId) ? parsed.providerId : null,
      status: 'completed'
    }, t);
  } catch (err) {
    if (isUniqueError(err)) {
      return ok(await getScorpioBalance(user.userId, t));
    }
    throw err;
  }

  return ok(balance);
}

async function handleWin(parsed, user, t) {
  const existing = await findTx(parsed.transactionId, t);
  if (existing) {
    return ok(await getScorpioBalance(user.userId, t));
  }
  if (!parsed.transactionId) {
    return fail(STATUS.ERR_UNKNOWN, await getScorpioBalance(user.userId, t));
  }

  const balance = await applyScorpioCredit(
    user.userId,
    parsed.amount,
    parsed.transactionId,
    {
      kind: 'win',
      roundId: parsed.roundId,
      gameCode: parsed.gameCode,
      providerId: parsed.providerId
    },
    t
  );

  try {
    await recordTx({
      userId: user.userId,
      transactionId: parsed.transactionId,
      referenceId: parsed.referenceId || null,
      roundId: parsed.roundId || null,
      command: 'win',
      amount: parsed.amount,
      gameCode: parsed.gameCode || null,
      providerId: Number.isFinite(parsed.providerId) ? parsed.providerId : null,
      status: 'completed'
    }, t);
  } catch (err) {
    if (isUniqueError(err)) {
      return ok(await getScorpioBalance(user.userId, t));
    }
    throw err;
  }

  return ok(balance);
}

async function handleCancel(parsed, user, t) {
  const existing = await findTx(parsed.transactionId, t);
  if (existing && existing.command === 'cancel') {
    return ok(await getScorpioBalance(user.userId, t));
  }

  const bet = await findBetForCancel(parsed, t);
  if (!bet) {
    return fail(STATUS.ERR_TRANSACTION_DOES_NOT_EXIST, await getScorpioBalance(user.userId, t));
  }
  if (bet.status === 'cancelled') {
    return fail(STATUS.ERR_TRANSACTION_ROLLED_BACK, await getScorpioBalance(user.userId, t));
  }

  const refund = money(parsed.amount || bet.amount || 0);
  const balance = refund > 0
    ? await applyScorpioRollback(
      user.userId,
      bet.transactionId,
      refund,
      parsed.transactionId || `cancel:${bet.transactionId}`,
      {
        kind: 'cancel',
        roundId: parsed.roundId,
        gameCode: parsed.gameCode,
        providerId: parsed.providerId,
        referenceId: bet.transactionId
      },
      t
    )
    : await getScorpioBalance(user.userId, t);

  await bet.update({ status: 'cancelled' }, { transaction: t });

  try {
    await recordTx({
      userId: user.userId,
      transactionId: parsed.transactionId || `cancel:${bet.transactionId}`,
      referenceId: bet.transactionId,
      roundId: parsed.roundId || bet.roundId || null,
      command: 'cancel',
      amount: refund,
      gameCode: parsed.gameCode || bet.gameCode || null,
      providerId: Number.isFinite(parsed.providerId) ? parsed.providerId : bet.providerId,
      status: 'completed'
    }, t);
  } catch (err) {
    if (isUniqueError(err)) {
      return ok(await getScorpioBalance(user.userId, t));
    }
    throw err;
  }

  return ok(balance);
}

async function dispatch(parsed, user) {
  return db.sequelize.transaction(async (t) => {
    if (db.User) {
      await db.User.findByPk(user.userId, { transaction: t, lock: t.LOCK.UPDATE });
    }
    if (parsed.command === 'balance') return handleBalance(parsed, user, t);
    if (parsed.command === 'bet') return handleBet(parsed, user, t);
    if (parsed.command === 'win') return handleWin(parsed, user, t);
    if (parsed.command === 'cancel') return handleCancel(parsed, user, t);
    return fail(STATUS.ERR_UNKNOWN);
  });
}

async function handleCallback(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const commandHint = req.params && req.params.command;
  const parsed = parseCallback(body, commandHint);

  if (!isScorpioConfigured()) {
    log.warn('Scorpio Play callback received but API is not configured');
    return fail(STATUS.ERR_UNKNOWN);
  }

  if (!verifyRequestSignature(body, headerSignature(req))) {
    log.warn('Scorpio Play signature mismatch', { command: parsed.command, playerId: parsed.playerId });
    return fail(STATUS.ERR_INTEGRITY_CHECK_FAILED);
  }

  if (!parsed.playerId) {
    return fail(STATUS.ERR_INVALID_PLAYER_ID);
  }

  const expectedCurrency = resolveScorpioConfig().currency;
  if (parsed.currency && parsed.currency !== expectedCurrency) {
    return fail(STATUS.ERR_INVALID_ACCOUNT);
  }

  const user = await findScorpioUser(parsed.playerId);
  if (!user) {
    return fail(STATUS.ERR_INVALID_PLAYER_ID);
  }

  try {
    const result = await dispatch(parsed, user);
    if (result && result.statusCode === STATUS.OK && parsed.command !== 'balance') {
      notifyUserBalanceChanged(user.userId);
    }
    return result;
  } catch (err) {
    if (err && (err.code === 'ERR_NOT_ENOUGH_MONEY' || err.code === 6 || err.message === 'Insufficient funds')) {
      const balance = await getScorpioBalance(user.userId);
      return fail(STATUS.ERR_NOT_ENOUGH_MONEY, balance);
    }
    log.error('Scorpio Play callback failed', {
      command: parsed.command,
      playerId: parsed.playerId,
      transactionId: parsed.transactionId,
      message: err.message
    });
    try {
      const balance = await getScorpioBalance(user.userId);
      return fail(STATUS.ERR_UNKNOWN, balance);
    } catch (_balanceErr) {
      return fail(STATUS.ERR_UNKNOWN);
    }
  }
}

module.exports = {
  handleCallback,
  STATUS
};
