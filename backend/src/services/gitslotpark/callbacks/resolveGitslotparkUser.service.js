'use strict';

const db = require('../../../db/models');
const { buildGitslotparkUserId } = require('../gitslotparkUserId.helpers');

async function upsertGitslotparkUserMapping(userId, gitslotparkUserId) {
  if (!db.GitslotparkUserMapping || !userId || !gitslotparkUserId) return;

  const existing = await db.GitslotparkUserMapping.findOne({
    where: { gitslotparkUserId }
  });

  if (existing) {
    if (existing.userId !== userId) {
      await existing.update({ userId });
    }
    return;
  }

  await db.GitslotparkUserMapping.create({ userId, gitslotparkUserId }).catch(async (err) => {
    if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    await db.GitslotparkUserMapping.update(
      { userId },
      { where: { gitslotparkUserId } }
    );
  });
}

async function resolveUserIdFromGitslotparkUserId(gitslotparkUserId) {
  if (!gitslotparkUserId) return null;

  if (db.GitslotparkUserMapping) {
    const mapping = await db.GitslotparkUserMapping.findOne({
      where: { gitslotparkUserId },
      attributes: ['userId']
    });
    if (mapping) return mapping.userId;
  }

  const users = await db.User.findAll({
    attributes: ['userId', 'username'],
    raw: true
  });

  for (const user of users) {
    const built = buildGitslotparkUserId(user.username, user.userId);
    if (built === gitslotparkUserId) {
      await upsertGitslotparkUserMapping(user.userId, gitslotparkUserId);
      return user.userId;
    }
  }

  return null;
}

module.exports = {
  upsertGitslotparkUserMapping,
  resolveUserIdFromGitslotparkUserId
};
