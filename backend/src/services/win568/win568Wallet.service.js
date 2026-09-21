'use strict';

/**
 * 568Win seamless wallet.
 * Playable SC (PSC + spendable BSC + RSC + leftover SC) is used while the
 * 568Win view is >= 0. Rollback/settle may overdraft that view (SOP Sports-6)
 * without driving platform wallets below zero.
 */

const db = require('../../db/models');
const {
  getPlayableBalance,
  applyBalanceDelta
} = require('../gitslotpark/callbacks/gitslotparkCallbackWallet.service');
const { formatBalance } = require('../gitslotpark/gitslotparkSign.helpers');

function money(value) {
  return formatBalance(value);
}

async function lockPlayer(userId, username, transaction) {
  if (!db.Win568Player) return null;
  const lock = transaction ? { lock: transaction.LOCK.UPDATE, transaction } : {};
  let row = await db.Win568Player.findByPk(userId, lock);
  if (!row) {
    try {
      await db.Win568Player.create(
        { userId, username: username || '', balance: 0 },
        { transaction }
      );
    } catch (err) {
      if (!(err && (err.name === 'SequelizeUniqueConstraintError' || err.code === '23505'))) {
        throw err;
      }
    }
    row = await db.Win568Player.findByPk(userId, lock);
  }
  return row;
}

async function getWin568Balance(userId, username, transaction) {
  const playable = money(await getPlayableBalance(userId, transaction));
  const row = await lockPlayer(userId, username, transaction);
  if (!row) return playable;

  let current = money(row.balance);
  const patch = {};
  if (username && row.username !== username) patch.username = username;

  // Overdraft is the 568Win view. Otherwise follow playable SC.
  if (current >= -0.0001 && current !== playable) {
    current = playable;
    patch.balance = playable;
  }
  if (Object.keys(patch).length) {
    await row.update(patch, { transaction });
  }
  return current < -0.0001 ? current : playable;
}

async function applyWin568Delta(userId, delta, meta, transaction, options = {}) {
  const username = (meta && meta.metadata && meta.metadata.userName) || '';
  const adj = Number(delta || 0);
  const playable = money(await getPlayableBalance(userId, transaction));
  const row = await lockPlayer(userId, username, transaction);

  let before = playable;
  if (row && money(row.balance) < -0.0001) {
    before = money(row.balance);
  }

  const after = money(before + adj);
  if (options.requireFunds && after < -0.0001) {
    const err = new Error('Insufficient funds');
    err.code = 6;
    throw err;
  }

  const playableAfter = Math.max(0, after);
  const playableDelta = money(playableAfter - playable);
  if (Math.abs(playableDelta) >= 0.009) {
    await applyBalanceDelta(userId, playableDelta, meta, transaction);
  }

  if (row) {
    const patch = { balance: after };
    if (username && row.username !== username) patch.username = username;
    await row.update(patch, { transaction });
  }
  return after;
}

module.exports = {
  getWin568Balance,
  applyWin568Delta
};
