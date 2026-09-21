/** localStorage key — ISO timestamp (ms) of the guest's last landing-page spin. */
export const GUEST_LANDING_SPIN_STORAGE_KEY = 'guest_landing_spin_last_at';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

function readLastSpinAt() {
  try {
    const raw = localStorage.getItem(GUEST_LANDING_SPIN_STORAGE_KEY);
    const ts = Number(raw);
    return Number.isFinite(ts) && ts > 0 ? ts : null;
  } catch (_) {
    return null;
  }
}

export function getGuestLandingSpinCooldownRemainingMs() {
  const lastAt = readLastSpinAt();
  if (!lastAt) return 0;
  const remaining = COOLDOWN_MS - (Date.now() - lastAt);
  return remaining > 0 ? remaining : 0;
}

export function canGuestLandingSpin() {
  return getGuestLandingSpinCooldownRemainingMs() === 0;
}

export function markGuestLandingSpinUsed() {
  try {
    localStorage.setItem(GUEST_LANDING_SPIN_STORAGE_KEY, String(Date.now()));
  } catch (_) {
    /* ignore */
  }
}

export function formatGuestLandingSpinCooldown(remainingMs) {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return 'less than 1m';
}
