import { GUEST_LANDING_SPIN_WIN_SC } from './guestSpinWheelConfig';

/** localStorage key — pending guest spin win awaiting signup claim. */
export const GUEST_LANDING_SPIN_PENDING_KEY = 'guest_landing_spin_pending';

export function saveGuestPendingSpinWin(amountSc = GUEST_LANDING_SPIN_WIN_SC) {
  const amount = Number(amountSc);
  if (!Number.isFinite(amount) || amount <= 0) return;
  try {
    localStorage.setItem(
      GUEST_LANDING_SPIN_PENDING_KEY,
      JSON.stringify({
        amountSc: amount,
        wonAt: Date.now(),
        claimed: false
      })
    );
  } catch (_) {
    /* ignore */
  }
}

export function getGuestPendingSpinWin() {
  try {
    const raw = localStorage.getItem(GUEST_LANDING_SPIN_PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.claimed) return null;
    const amountSc = Number(data.amountSc);
    const wonAt = Number(data.wonAt);
    if (!Number.isFinite(amountSc) || amountSc <= 0) return null;
    if (!Number.isFinite(wonAt) || wonAt <= 0) return null;
    return { amountSc, wonAt, claimed: false };
  } catch (_) {
    return null;
  }
}

export function getGuestSpinClaimPayload() {
  const pending = getGuestPendingSpinWin();
  if (!pending) return {};
  return {
    guestSpinWonAt: pending.wonAt,
    guestSpinAmountSc: pending.amountSc
  };
}

export function clearGuestPendingSpinWin() {
  try {
    localStorage.removeItem(GUEST_LANDING_SPIN_PENDING_KEY);
  } catch (_) {
    /* ignore */
  }
}

export function finalizeGuestSpinClaimOnAuthSuccess(res) {
  const claimed = res?.guest_spin_claimed === true;
  if (!claimed) return false;

  clearGuestPendingSpinWin();
  window.dispatchEvent(new Event('wallet:refresh'));
  window.dispatchEvent(new CustomEvent('spinwheel:refresh'));
  return true;
}

export function getGuestSpinClaimSuccessMessage(res) {
  if (res?.guest_spin_claimed !== true) return null;
  const amount = Number(res.guest_spin_amount_sc);
  if (!Number.isFinite(amount) || amount <= 0) return 'Your spin bonus has been added to your account!';
  return `Your ${amount} SC spin bonus has been added to your account!`;
}
