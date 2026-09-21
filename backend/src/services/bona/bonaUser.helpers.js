'use strict';

const db = require('../../db/models');

/** Bona usernames: letters + numbers only, max 64. */
function buildBonaUsername(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id < 1) return null;
  return `u${id}`;
}

function newRequestId(prefix) {
  const crypto = require('crypto');
  const p = String(prefix || 'b').slice(0, 6);
  const rand = crypto.randomBytes(8).toString('hex');
  return `${p}${rand}`.slice(0, 32);
}

function toBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

async function upsertBonaUserMapping(userId, bonaUsername, extras = {}) {
  if (!db.BonaUserMapping) return null;
  const existing = await db.BonaUserMapping.findOne({ where: { userId } });
  const patch = {
    bonaUsername,
    ...(extras.bonaUid ? { bonaUid: String(extras.bonaUid) } : {}),
    ...(extras.lastToken ? { lastToken: String(extras.lastToken) } : {}),
    ...(extras.walletMode != null ? { walletMode: Number(extras.walletMode) } : {})
  };

  if (existing) {
    await existing.update(patch);
    return existing;
  }
  return db.BonaUserMapping.create({
    userId,
    ...patch,
    walletInitialized: false,
    walletMode: extras.walletMode != null ? Number(extras.walletMode) : 2
  });
}

async function getBonaUsernameForUser(userId) {
  if (db.BonaUserMapping) {
    const row = await db.BonaUserMapping.findOne({ where: { userId } });
    if (row && row.bonaUsername) return String(row.bonaUsername);
  }
  return buildBonaUsername(userId);
}

module.exports = {
  buildBonaUsername,
  newRequestId,
  toBase64Url,
  upsertBonaUserMapping,
  getBonaUsernameForUser
};
