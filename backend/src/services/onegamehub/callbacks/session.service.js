'use strict';

const crypto = require('crypto');
const db = require('../../../db/models');
const { SESSION_PREFIX, SESSION_TTL_MS } = require('../onegamehub.constants');

function makePlayerId(userId) {
  const suffix = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  return `${SESSION_PREFIX}${userId}_${suffix}`.slice(0, 32);
}

async function createSession({ userId, storeCode, gameId, currency }) {
  const playerId = makePlayerId(userId);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.OneGameHubSession.create({
    playerId,
    userId,
    storeCode: storeCode || '',
    gameId: String(gameId),
    currency,
    expiresAt
  });

  return { playerId, expiresAt };
}

async function getActiveSession(playerId) {
  if (!playerId) return null;
  const session = await db.OneGameHubSession.findByPk(String(playerId));
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }
  return session;
}

module.exports = { createSession, getActiveSession, makePlayerId };
