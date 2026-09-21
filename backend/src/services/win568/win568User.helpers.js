'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { resolveWin568Config } = require('./win568.config');

const MIN_LENGTH = 6;
const MAX_LENGTH = 20;
const ALLOWED = /^[a-zA-Z0-9_]+$/;

/**
 * 568Win player username: 6–20 chars, letters/numbers/_ only.
 * Prefer a stable u{userId} so it stays unique and callback lookup works.
 */
function buildWin568Username(userId, platformUsername) {
  const idPart = String(userId ?? '').replace(/\D/g, '');
  if (idPart) {
    let name = `u${idPart}`;
    if (name.length < MIN_LENGTH) name = name.padEnd(MIN_LENGTH, '0');
    return name.slice(0, MAX_LENGTH);
  }

  const cleaned = String(platformUsername || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (cleaned.length >= MIN_LENGTH && cleaned.length <= MAX_LENGTH && ALLOWED.test(cleaned)) {
    return cleaned;
  }
  return null;
}

async function upsertWin568Player(userId, username) {
  const name = String(username || '').trim();
  if (!userId || !name) return null;

  const [row] = await db.Win568Player.findOrCreate({
    where: { userId },
    defaults: { userId, username: name, balance: 0 }
  });
  if (row.username !== name) {
    await row.update({ username: name });
  }
  return row;
}

/**
 * 568Win sends the player username we registered (letters/numbers, max 20).
 * Look up mapping first, then fall back to platform User.username.
 */
async function findWin568User(userName) {
  const name = String(userName || '').trim();
  if (!name) return null;

  const userFromMapping = async (mapping) => {
    if (!mapping) return null;
    return db.User.findByPk(mapping.userId, {
      attributes: ['userId', 'username', 'storeCode']
    });
  };

  const mapping = await db.Win568Player.findOne({
    where: { username: { [Op.iLike]: name } }
  });
  const mappedUser = await userFromMapping(mapping);
  if (mappedUser) return mappedUser;

  // Exact u{userId} only. SW test uses u11417_ER for "member not exist".
  if (/^u\d+$/i.test(name)) {
    const byId = await db.Win568Player.findByPk(Number(name.slice(1)));
    const uUser = await userFromMapping(byId);
    if (uUser) return uUser;
  }

  // WM/SBO display ids like 821SBO178364 — not names that already start with u{digits}.
  if (!/^u\d+/i.test(name)) {
    const digitGroups = [...new Set(name.match(/\d{3,}/g) || [])]
      .sort((a, b) => b.length - a.length);
    for (const raw of digitGroups) {
      const id = Number(raw);
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const byPk = await userFromMapping(await db.Win568Player.findByPk(id));
      if (byPk) return byPk;
      const byU = await userFromMapping(await db.Win568Player.findOne({
        where: { username: { [Op.iLike]: `u${raw}` } }
      }));
      if (byU) return byU;
    }
  }

  const { storeCode } = resolveWin568Config();
  const where = {
    username: { [Op.iLike]: name }
  };
  if (storeCode) where.storeCode = storeCode;

  const user = await db.User.findOne({
    where,
    attributes: ['userId', 'username', 'storeCode']
  });
  return user || null;
}

module.exports = {
  buildWin568Username,
  upsertWin568Player,
  findWin568User
};
