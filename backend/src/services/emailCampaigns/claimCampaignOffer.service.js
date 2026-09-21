'use strict';

const crypto = require('crypto');
const db = require('../../db/models');
const { EMAIL_CAMPAIGN_STORE_CODE, normalizeStoreCode } = require('./constants');
const { userHasCompletedDeposit } = require('./runPlayjuwaNoDepositCampaign.service');

function err(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function consumeClaimToken() {
  return `used_${crypto.randomBytes(24).toString('hex')}`.slice(0, 64);
}

function discountLabel(valueType, value) {
  const n = Number(value);
  if (valueType === 'percentage') {
    return `${n}% off deposit amount`;
  }
  return `$${n} off deposit amount`;
}

/**
 * Claim offer from email link (token). User must be logged in as the recipient.
 * Link is one-time: after claim the token is rotated so it cannot be reused
 * by the same user again or by any other user.
 * Does NOT auto-apply the code — user must type it in the Apply Code modal.
 */
async function claimOffer(req, token) {
  const claimToken = String(token || '').trim();
  if (!claimToken) throw err('Invalid claim token.');
  if (claimToken.startsWith('used_')) {
    throw err('This claim link has already been used.', 410);
  }

  const userId = req.user?.userId;
  const storeCode = normalizeStoreCode(req.user?.storeCode);
  if (!userId) throw err('Unauthorized.', 401);
  if (storeCode !== EMAIL_CAMPAIGN_STORE_CODE) {
    throw err('This offer is only available on DragonFury.', 403);
  }

  const send = await db.EmailCampaignSend.findOne({
    where: { claimToken },
    include: [{ model: db.EmailCampaign, as: 'Campaign' }]
  });
  if (!send || !send.Campaign) {
    throw err('This claim link is invalid or has already been used.', 404);
  }
  if (send.Campaign.storeCode !== EMAIL_CAMPAIGN_STORE_CODE) {
    throw err('Offer not found.', 404);
  }
  if (send.userId !== userId) {
    throw err('This offer is only for the account that received the email. Please log in with that account.', 403);
  }
  if (send.status === 'failed' || send.status === 'failed_final' || send.status === 'skipped') {
    throw err('This offer is no longer available.', 400);
  }
  if (send.status === 'pending' || send.status === 'pending_retry') {
    throw err('This offer email has not been delivered yet.', 400);
  }

  const ttlDays = Math.max(1, Number(send.Campaign.claimTokenTtlDays) || 7);
  const sentAt = send.sentAt ? new Date(send.sentAt).getTime() : Date.now();
  if (Date.now() - sentAt > ttlDays * 24 * 60 * 60 * 1000) {
    await send.update({ claimStatus: 'expired', claimToken: consumeClaimToken() });
    throw err('This offer has expired.', 400);
  }

  if (await userHasCompletedDeposit(userId)) {
    throw err('This offer is for users who have not deposited yet.', 400);
  }

  if (send.claimStatus === 'claimed' || send.claimStatus === 'expired') {
    throw err('This claim link has already been used.', 410);
  }

  const discountCode = send.discountCodeSnapshot || send.Campaign.discountCode;
  const [affected] = await db.EmailCampaignSend.update(
    {
      claimStatus: 'claimed',
      claimedAt: new Date(),
      claimToken: consumeClaimToken()
    },
    {
      where: {
        id: send.id,
        claimToken,
        claimStatus: 'unclaimed'
      }
    }
  );

  if (!affected) {
    throw err('This claim link has already been used.', 410);
  }

  return {
    claimed: true,
    alreadyClaimed: false,
    discountCode,
    message:
      'Offer claimed. Open Deposit → Apply code and type your discount code to attach the bonus.'
  };
}

/**
 * User types code manually after claiming. Binds signupBonusCodeId for deposit apply.
 * Credits percentage or fixed SC via existing applySignupBonusCodeOnDeposit on deposit.
 */
async function applyDiscountCode(req, rawCode) {
  const userId = req.user?.userId;
  const storeCode = normalizeStoreCode(req.user?.storeCode);
  if (!userId) throw err('Unauthorized.', 401);
  if (storeCode !== EMAIL_CAMPAIGN_STORE_CODE) {
    throw err('Discount codes from email campaigns are only for DragonFury.', 403);
  }

  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) throw err('Discount code is required.');

  if (await userHasCompletedDeposit(userId)) {
    throw err('This discount is only for users who have not deposited yet.', 400);
  }

  const send = await db.EmailCampaignSend.findOne({
    where: {
      userId,
      claimStatus: 'claimed',
      discountCodeSnapshot: code
    },
    include: [{ model: db.EmailCampaign, as: 'Campaign' }],
    order: [['claimedAt', 'DESC']]
  });

  if (!send || !send.Campaign) {
    throw err('Claim this offer from your email first, then enter the code.', 400);
  }

  const campaign = send.Campaign;
  if (!campaign.bonusCodeId) {
    throw err('Offer is misconfigured. Contact support.', 500);
  }

  const bonus = await db.BonusCode.findOne({
    where: {
      id: campaign.bonusCodeId,
      storeCode: EMAIL_CAMPAIGN_STORE_CODE,
      isActive: true
    }
  });
  if (!bonus || String(bonus.code).toUpperCase() !== code) {
    throw err('Invalid or inactive discount code.', 400);
  }

  const valueType = String(bonus.valueType || campaign.discountValueType || 'fixed').toLowerCase();
  const normalizedType = valueType === 'percent' || valueType === 'percentage' ? 'percentage' : 'fixed';
  const discountValue = Number(bonus.value != null ? bonus.value : campaign.discountValue) || 0;
  const label = discountLabel(normalizedType, discountValue);

  const user = await db.User.findByPk(userId);
  if (!user || normalizeStoreCode(user.storeCode) !== EMAIL_CAMPAIGN_STORE_CODE) {
    throw err('User not found.', 404);
  }

  // Already redeemed on a completed deposit.
  if (db.UserBonusCodeGrant) {
    const used = await db.UserBonusCodeGrant.count({
      where: { userId, bonusCodeId: bonus.id }
    });
    if (used >= 1) {
      throw err('This offer code was already used on a deposit.', 400);
    }
  }

  if (send.codeAppliedAt) {
    return {
      applied: true,
      alreadyApplied: true,
      discountCode: code,
      discountValueType: normalizedType,
      discountValue,
      label,
      appliesTo: 'all_packages',
      message: `Code already applied (${label}). Your pay amount is reduced on any package or amount.`
    };
  }

  // Pay-amount discount only — do not attach signup SC bonus.
  await send.update({ codeAppliedAt: new Date() });
  if (user.signupBonusCodeId === bonus.id) {
    await user.update({ signupBonusCodeId: null });
  }

  return {
    applied: true,
    alreadyApplied: false,
    discountCode: code,
    discountValueType: normalizedType,
    discountValue,
    label,
    appliesTo: 'all_packages',
    message: `Code applied: ${label} on any package or custom amount.`
  };
}

/**
 * Current applied email-campaign discount for the logged-in user (if any).
 */
async function getAppliedDiscountCode(req) {
  const userId = req.user?.userId;
  const storeCode = normalizeStoreCode(req.user?.storeCode);
  if (!userId) throw err('Unauthorized.', 401);
  if (storeCode !== EMAIL_CAMPAIGN_STORE_CODE) {
    throw err('Not available for this store.', 403);
  }

  const {
    getActiveCampaignPayDiscount
  } = require('./applyCampaignPayDiscount.service');
  const active = await getActiveCampaignPayDiscount(userId);
  if (!active) return { applied: false };

  return {
    applied: true,
    discountCode: active.code,
    discountValueType: active.valueType,
    discountValue: active.value,
    label: discountLabel(active.valueType, active.value),
    appliesTo: 'all_packages',
    codeAppliedAt: true
  };
}

/**
 * Remove applied campaign code so it will not discount pay.
 * User may re-apply later (still requires prior claim).
 */
async function removeDiscountCode(req) {
  const userId = req.user?.userId;
  const storeCode = normalizeStoreCode(req.user?.storeCode);
  if (!userId) throw err('Unauthorized.', 401);
  if (storeCode !== EMAIL_CAMPAIGN_STORE_CODE) {
    throw err('Not available for this store.', 403);
  }

  const send = await db.EmailCampaignSend.findOne({
    where: { userId, claimStatus: 'claimed' },
    include: [{ model: db.EmailCampaign, as: 'Campaign' }],
    order: [['claimedAt', 'DESC']]
  });

  if (!send?.codeAppliedAt) {
    throw err('No email offer code is applied.', 400);
  }

  const bonusCodeId = send.Campaign?.bonusCodeId || null;
  if (bonusCodeId && db.UserBonusCodeGrant) {
    const used = await db.UserBonusCodeGrant.count({
      where: { userId, bonusCodeId }
    });
    if (used >= 1) {
      throw err('This offer was already used on a deposit and cannot be removed.', 400);
    }
  }

  await send.update({ codeAppliedAt: null });

  const user = await db.User.findByPk(userId);
  if (user && bonusCodeId && user.signupBonusCodeId === bonusCodeId) {
    await user.update({ signupBonusCodeId: null });
  }

  return {
    removed: true,
    message: 'Offer code removed. You can apply it again before depositing.'
  };
}

async function unapplyAppliedCode(userId) {
  if (!userId || !db.EmailCampaignSend) return;
  const send = await db.EmailCampaignSend.findOne({
    where: { userId, claimStatus: 'claimed' },
    include: [{ model: db.EmailCampaign, as: 'Campaign' }],
    order: [['claimedAt', 'DESC']]
  });
  if (!send?.codeAppliedAt) return;

  const bonusCodeId = send.Campaign?.bonusCodeId || null;
  if (bonusCodeId && db.UserBonusCodeGrant) {
    const used = await db.UserBonusCodeGrant.count({
      where: { userId, bonusCodeId }
    });
    if (used >= 1) return;
  }

  await send.update({ codeAppliedAt: null });
}

async function getClaimPreview(token) {
  const claimToken = String(token || '').trim();
  if (!claimToken || claimToken.startsWith('used_')) {
    throw err('This claim link is invalid or has already been used.', 404);
  }
  const send = await db.EmailCampaignSend.findOne({
    where: { claimToken },
    include: [{ model: db.EmailCampaign, as: 'Campaign', attributes: ['name', 'discountCode', 'storeCode'] }]
  });
  if (!send || !send.Campaign || send.Campaign.storeCode !== EMAIL_CAMPAIGN_STORE_CODE) {
    throw err('This claim link is invalid or has already been used.', 404);
  }
  if (send.claimStatus === 'claimed' || send.claimStatus === 'expired') {
    throw err('This claim link has already been used.', 410);
  }
  const email = String(send.email || '');
  const at = email.indexOf('@');
  const maskedEmail =
    at > 1 ? `${email.slice(0, 2)}***${email.slice(at)}` : email ? '***' : null;
  return {
    email: maskedEmail,
    claimStatus: send.claimStatus,
    status: send.status,
    // Do not expose the code on a shareable preview URL; user sees it in the email / after claim.
    discountCodeHint: null
  };
}

module.exports = {
  claimOffer,
  applyDiscountCode,
  getAppliedDiscountCode,
  removeDiscountCode,
  unapplyAppliedCode,
  getClaimPreview
};
