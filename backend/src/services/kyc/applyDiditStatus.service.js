'use strict';

const db = require('../../db/models');
const { mapDiditStatus, isApproved } = require('./kycStatus.map');

async function applyDiditStatusToUser(user, data = {}) {
  const mapped = mapDiditStatus(data.status);
  const now = new Date();
  const patch = {
    kycStatus: mapped,
    kycProvider: 'didit',
    kycUpdatedAt: now
  };
  if (data.sessionId) patch.diditSessionId = String(data.sessionId).slice(0, 64);
  if (data.workflowId) patch.diditWorkflowId = String(data.workflowId).slice(0, 64);

  if (isApproved(mapped)) {
    patch.kycVerifiedAt = user.kycVerifiedAt || now;
    patch.kycDeclineReason = null;
  } else if (mapped === 'declined') {
    patch.kycDeclineReason = data.declineReason
      ? String(data.declineReason).slice(0, 2000)
      : user.kycDeclineReason || null;
  }

  if (typeof user.update === 'function') {
    await user.update(patch);
    return user;
  }

  await db.User.update(patch, { where: { userId: user.userId } });
  return { ...user, ...patch };
}

module.exports = { applyDiditStatusToUser };
