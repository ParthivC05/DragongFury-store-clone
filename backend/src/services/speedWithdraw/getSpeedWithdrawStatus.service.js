'use strict';

const db = require('../../db/models');

/**
 * Get status of a Speed withdraw-request by our local id.
 * User can only fetch their own.
 * @param {number} withdrawId - Our speed_withdraw_requests.id
 * @param {number} userId - Current user (must own the request)
 * @returns {Promise<{ withdrawId, provider, status, expiresAt, isExpired, completedAt, claimedAt } | null>}
 */
async function getSpeedWithdrawStatus(withdrawId, userId) {
  const id = parseInt(withdrawId, 10);
  if (!Number.isInteger(id) || id < 1) return null;

  const row = await db.SpeedWithdrawRequest.findOne({
    where: { id, userId },
    attributes: ['id', 'userId', 'provider', 'providerReference', 'status', 'expiresAt', 'completedAt', 'claimedAt', 'deactivatedAt', 'createdAt']
  });

  if (!row) return null;

  const expiresAt = row.expiresAt;
  const now = new Date();
  const isExpired = expiresAt ? now > new Date(expiresAt) : false;

  return {
    withdrawId: row.id,
    provider: row.provider,
    status: row.status,
    expiresAt: row.expiresAt,
    isExpired,
    completedAt: row.completedAt,
    claimedAt: row.claimedAt
  };
}

module.exports = { getSpeedWithdrawStatus };
