import {
  getGuestSpinClaimPayload,
  finalizeGuestSpinClaimOnAuthSuccess,
  getGuestSpinClaimSuccessMessage
} from '../components/SpinWheel/guestLandingSpinPendingWin';

export function buildAuthPayloadWithGuestSpin(extra = {}) {
  return {
    ...extra,
    ...getGuestSpinClaimPayload()
  };
}

export function handleGuestSpinAfterAuthSuccess(res, toast) {
  const claimed = finalizeGuestSpinClaimOnAuthSuccess(res);
  const message = getGuestSpinClaimSuccessMessage(res);
  if (claimed && message && toast?.success) {
    toast.success(message);
  }
  return claimed;
}

export function getWelcomeBonusSuccessMessage(res) {
  if (res?.welcome_bonus_granted !== true) return null;
  const amount = Number(res.welcome_bonus_amount_sc);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Your welcome signup bonus has been added to your account!';
  }
  return `Your ${amount} SC welcome bonus has been added to your account!`;
}

export function handleWelcomeBonusAfterAuthSuccess(res, toast) {
  const message = getWelcomeBonusSuccessMessage(res);
  if (!message || !toast?.success) return false;
  toast.success(message);
  if (res?.welcome_bonus_granted === true) {
    window.dispatchEvent(new Event('wallet:refresh'));
  }
  return true;
}

export function getReferralFriendBonusSuccessMessage(res) {
  if (res?.referral_friend_bonus_granted !== true) return null;
  const amount = Number(res.referral_friend_bonus_amount_sc);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Your referral signup bonus has been added to your account!';
  }
  return `You got ${amount} SC for joining with a friend's link!`;
}

export function handleReferralFriendBonusAfterAuthSuccess(res, toast) {
  const message = getReferralFriendBonusSuccessMessage(res);
  if (!message || !toast?.success) return false;
  toast.success(message);
  if (res?.referral_friend_bonus_granted === true) {
    window.dispatchEvent(new Event('wallet:refresh'));
  }
  return true;
}

export function handleSignupBonusesAfterAuthSuccess(res, toast) {
  handleGuestSpinAfterAuthSuccess(res, toast);
  handleWelcomeBonusAfterAuthSuccess(res, toast);
  handleReferralFriendBonusAfterAuthSuccess(res, toast);
}
