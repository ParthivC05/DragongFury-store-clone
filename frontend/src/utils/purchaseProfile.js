/** Purchase is gated on verified phone only (when the store requires it). */
export function needsPhoneVerification(user) {
  if (!user) return false;
  // Already verified — never gate (also guards against stale needsVerification flags).
  if (user.isPhoneVerified === true) return false;
  // Admin toggle off (or missing required flag with explicit false) — never gate or show OTP UI.
  if (user.phoneVerification && user.phoneVerification.required === false) {
    return false;
  }
  return Boolean(
    user.phoneVerificationRequired || user.phoneVerification?.needsVerification
  );
}

/** True when the store has phone OTP enabled in admin. */
export function storeRequiresPhoneVerification(user) {
  if (!user) return false;
  if (user.phoneVerification && typeof user.phoneVerification.required === 'boolean') {
    return user.phoneVerification.required === true;
  }
  // Legacy / partial payloads: only treat as required when needsVerification is set.
  return Boolean(user.phoneVerificationRequired || user.phoneVerification?.needsVerification);
}

/** True when phone is verified (or store does not require phone OTP). */
export function isPurchaseProfileComplete(user) {
  if (!user) return false;
  return !needsPhoneVerification(user);
}

export const SETTINGS_RETURN_DEPOSIT = '/settings?returnTo=deposit';
