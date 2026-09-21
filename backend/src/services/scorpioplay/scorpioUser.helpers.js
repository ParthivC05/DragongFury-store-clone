'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { buildPlayerExternalId } = require('./scorpio.config');

async function upsertScorpioPlayer(userId, { playerExternalId, playerCode } = {}) {
  const externalId = String(playerExternalId || buildPlayerExternalId(userId) || '').trim();
  if (!userId || !externalId || !db.ScorpioPlayer) return null;

  const [row] = await db.ScorpioPlayer.findOrCreate({
    where: { userId },
    defaults: {
      userId,
      playerExternalId: externalId,
      playerCode: playerCode != null ? playerCode : null
    }
  });

  const patch = {};
  if (row.playerExternalId !== externalId) patch.playerExternalId = externalId;
  if (playerCode != null && String(row.playerCode || '') !== String(playerCode)) {
    patch.playerCode = playerCode;
  }
  if (Object.keys(patch).length) await row.update(patch);
  return row;
}

async function findScorpioUser(playerId) {
  const id = String(playerId || '').trim();
  if (!id) return null;

  if (db.ScorpioPlayer) {
    const mapping = await db.ScorpioPlayer.findOne({
      where: { playerExternalId: { [Op.iLike]: id } }
    });
    if (mapping) {
      const user = await db.User.findByPk(mapping.userId, {
        attributes: ['userId', 'username', 'storeCode']
      });
      if (user) return user;
    }
  }

  if (/^\d+$/.test(id)) {
    const userId = Number(id);
    if (Number.isSafeInteger(userId) && userId > 0) {
      return db.User.findByPk(userId, {
        attributes: ['userId', 'username', 'storeCode']
      });
    }
  }

  return null;
}

module.exports = {
  upsertScorpioPlayer,
  findScorpioUser,
  buildPlayerExternalId
};
