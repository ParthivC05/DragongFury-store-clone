'use strict';

const db = require('../../db/models');
const { isGcCoinsStore, isGcPlayProvider } = require('../../constants/gcCoins.js');
const { normalizePlayCoinType } = require('../../lib/normalizePlayCoinType');

function normalizeProvider(provider) {
  const raw = String(provider || '').trim().toLowerCase();
  if (raw === '1gamehub') return 'onegamehub';
  if (raw === '568win') return 'win568';
  return raw.slice(0, 32) || 'gitslotpark';
}

function normalizeGameId(gameId) {
  return String(gameId == null ? '' : gameId).trim().slice(0, 64);
}

async function storeCodeForUser(userId, transaction) {
  const user = await db.User.findByPk(userId, {
    attributes: ['storeCode'],
    transaction
  });
  return user?.storeCode || '';
}

/**
 * Remember the coin chosen at launch so seamless callbacks debit the same wallet.
 */
async function rememberPlayCoin({ userId, provider, gameId, coinType, transaction } = {}) {
  if (!userId || !db.PlayCoinSession) return 'SC';

  const providerKey = normalizeProvider(provider);
  let coin = normalizePlayCoinType(coinType);
  if (
    coin === 'GC' &&
    (!isGcPlayProvider(providerKey) || !isGcCoinsStore(await storeCodeForUser(userId, transaction)))
  ) {
    coin = 'SC';
  }
  const gameKey = normalizeGameId(gameId);

  const existing = await db.PlayCoinSession.findOne({
    where: { userId, provider: providerKey, gameId: gameKey },
    transaction
  });

  if (existing) {
    await existing.update({ coinType: coin }, { transaction });
    return coin;
  }

  try {
    await db.PlayCoinSession.create(
      { userId, provider: providerKey, gameId: gameKey, coinType: coin },
      { transaction }
    );
  } catch (err) {
    if (err.name !== 'SequelizeUniqueConstraintError' && err.code !== '23505') throw err;
    await db.PlayCoinSession.update(
      { coinType: coin },
      { where: { userId, provider: providerKey, gameId: gameKey }, transaction }
    );
  }

  return coin;
}

async function resolvePlayCoin({ userId, provider, gameId, transaction } = {}) {
  if (!userId || !db.PlayCoinSession) return 'SC';
  const providerKey = normalizeProvider(provider);
  if (
    !isGcPlayProvider(providerKey) ||
    !isGcCoinsStore(await storeCodeForUser(userId, transaction))
  ) {
    return 'SC';
  }

  const gameKey = normalizeGameId(gameId);

  if (gameKey) {
    const exact = await db.PlayCoinSession.findOne({
      where: { userId, provider: providerKey, gameId: gameKey },
      transaction
    });
    if (exact?.coinType) return normalizePlayCoinType(exact.coinType);
  }

  const latest = await db.PlayCoinSession.findOne({
    where: { userId, provider: providerKey },
    order: [['updatedAt', 'DESC'], ['id', 'DESC']],
    transaction
  });
  return normalizePlayCoinType(latest?.coinType);
}

module.exports = {
  rememberPlayCoin,
  resolvePlayCoin,
  normalizeProvider
};
