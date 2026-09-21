import { useCallback, useEffect, useState } from 'react';
import {
  canGuestLandingSpin,
  formatGuestLandingSpinCooldown,
  getGuestLandingSpinCooldownRemainingMs,
  markGuestLandingSpinUsed,
} from '../components/SpinWheel/guestLandingSpinCooldown';

export function useGuestLandingSpinCooldown() {
  const [remainingMs, setRemainingMs] = useState(() => getGuestLandingSpinCooldownRemainingMs());

  useEffect(() => {
    const tick = () => setRemainingMs(getGuestLandingSpinCooldownRemainingMs());
    tick();
    const intervalId = window.setInterval(tick, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const markSpinUsed = useCallback(() => {
    markGuestLandingSpinUsed();
    setRemainingMs(getGuestLandingSpinCooldownRemainingMs());
  }, []);

  return {
    canSpin: remainingMs === 0,
    remainingMs,
    cooldownLabel: remainingMs > 0 ? formatGuestLandingSpinCooldown(remainingMs) : '',
    markSpinUsed,
    refreshCooldown: () => setRemainingMs(getGuestLandingSpinCooldownRemainingMs()),
  };
}

export { canGuestLandingSpin };
