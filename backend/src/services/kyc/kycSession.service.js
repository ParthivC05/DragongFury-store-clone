'use strict';

const db = require('../../db/models');
const diditClient = require('./didit.client');
const { getKycSettingsForStore, isKycRequiredForWithdraw } = require('./kycSettings.service');
const { canStartSession, isApproved, mapDiditStatus } = require('./kycStatus.map');
const { applyDiditStatusToUser } = require('./applyDiditStatus.service');

/**
 * Didit return URL for the player's store site (same flow for every store).
 * Falls back to FRONTEND_URL when the store has no userSiteUrl.
 */
async function resolveCallbackUrl(storeCode) {
  const { getResolvedUserSiteBaseUrl } = require('../store/userSiteUrl.service');
  const base = String((await getResolvedUserSiteBaseUrl(storeCode)) || '').replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/kyc/callback`;
}

async function getKycStatusForUser(userId, { refresh = false } = {}) {
  const cfg = diditClient.getDiditConfig();
  const configured = Boolean(cfg.apiKey && cfg.workflowId);

  const user = await db.User.findByPk(userId, {
    attributes: [
      'userId',
      'storeCode',
      'kycStatus',
      'kycProvider',
      'diditSessionId',
      'diditWorkflowId',
      'kycVerifiedAt',
      'kycUpdatedAt',
      'kycDeclineReason'
    ]
  });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const settings = await getKycSettingsForStore(user.storeCode);
  const required = await isKycRequiredForWithdraw(user.storeCode);

  if (refresh && user.diditSessionId && !isApproved(user.kycStatus) && configured) {
    try {
      const session = await diditClient.retrieveSession(user.diditSessionId);
      const status = session?.status || session?.session?.status;
      if (status) {
        await applyDiditStatusToUser(user, {
          status,
          sessionId: session.session_id || user.diditSessionId,
          workflowId: session.workflow_id || user.diditWorkflowId
        });
        await user.reload();
      }
    } catch {
      /* keep local status */
    }
  }

  const kycStatus = user.kycStatus || 'not_started';
  return {
    required,
    enabled: settings.enabled,
    configured,
    storeCode: user.storeCode || null,
    kycStatus,
    kycProvider: user.kycProvider || null,
    verifiedAt: user.kycVerifiedAt || null,
    updatedAt: user.kycUpdatedAt || null,
    declineReason: user.kycDeclineReason || null,
    canStart: required && canStartSession(kycStatus),
    approved: isApproved(kycStatus)
  };
}

async function startKycSession(userId) {
  const user = await db.User.findByPk(userId, {
    attributes: [
      'userId',
      'storeCode',
      'kycStatus',
      'diditSessionId',
      'diditWorkflowId',
      'kycVerifiedAt',
      'kycDeclineReason'
    ]
  });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const required = await isKycRequiredForWithdraw(user.storeCode);
  if (!required) {
    const err = new Error('KYC verification is not required for your store.');
    err.statusCode = 400;
    throw err;
  }

  const cfg = diditClient.assertConfigured();

  if (isApproved(user.kycStatus)) {
    return {
      alreadyApproved: true,
      kycStatus: 'approved',
      url: null,
      sessionId: user.diditSessionId || null
    };
  }

  if (!canStartSession(user.kycStatus)) {
    const err = new Error(
      'Your verification is under review. You cannot start a new session until it completes.'
    );
    err.statusCode = 400;
    throw err;
  }

  if (user.diditSessionId && (user.kycStatus === 'pending' || user.kycStatus === 'not_started')) {
    try {
      const existing = await diditClient.retrieveSession(user.diditSessionId);
      const status = existing?.status;
      const mapped = mapDiditStatus(status);
      if (mapped === 'pending' && (existing.url || existing.session_url)) {
        return {
          alreadyApproved: false,
          kycStatus: 'pending',
          url: existing.url || existing.session_url,
          sessionId: existing.session_id || user.diditSessionId,
          reused: true
        };
      }
      if (mapped === 'approved' || mapped === 'declined' || mapped === 'in_review') {
        await applyDiditStatusToUser(user, {
          status,
          sessionId: existing.session_id || user.diditSessionId
        });
        if (mapped === 'approved') {
          return {
            alreadyApproved: true,
            kycStatus: 'approved',
            url: null,
            sessionId: user.diditSessionId
          };
        }
        if (mapped === 'in_review') {
          const err = new Error('Your verification is under review.');
          err.statusCode = 400;
          throw err;
        }
      }
    } catch (err) {
      if (err.statusCode === 400) throw err;
    }
  }

  const callback = await resolveCallbackUrl(user.storeCode);
  const session = await diditClient.createSession({
    vendorData: String(userId),
    callback: callback || undefined,
    metadata: { user_id: String(userId), store_code: user.storeCode || null }
  });

  const sessionId = session.session_id || session.sessionId;
  const url = session.url || session.session_url;
  if (!sessionId || !url) {
    const err = new Error('Didit did not return a verification URL. Please try again.');
    err.statusCode = 502;
    throw err;
  }

  await applyDiditStatusToUser(user, {
    status: session.status || 'In Progress',
    sessionId,
    workflowId: session.workflow_id || cfg.workflowId
  });

  return {
    alreadyApproved: false,
    kycStatus: 'pending',
    url,
    sessionId,
    reused: false
  };
}

module.exports = {
  getKycStatusForUser,
  startKycSession,
  resolveCallbackUrl,
  isKycRequiredForWithdraw
};
