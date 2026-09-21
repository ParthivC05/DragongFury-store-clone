import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import * as gamesApi from '../api/games';
import { DEPOSIT_ELIGIBILITY_CHANGED_EVENT } from '../utils/depositRequired';

const ELIGIBILITY_CACHE_MS = 5000;
let eligibilityInflight = null;
let eligibilityInflightUserId = null;
let eligibilityCache = {
  at: 0,
  userId: null,
  hasDeposit: false,
  hasCompletedPurchase: false,
  activationBonusType: null
};

function resolveAuthUserId(user) {
  if (!user) return null;
  const id = user.userId ?? user.id;
  if (id == null) return null;
  const parsed = parseInt(id, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseEligibilityPayload(res) {
  const payload = res?.data && typeof res.data === 'object' ? res.data : res;
  // Prefer explicit has_deposit for "already purchased". can_play_games also unlocks
  // legacy users who never received a signup activation bonus.
  const hasCompletedPurchase = payload?.has_deposit === true;
  const canPlay = payload?.can_play_games === true || hasCompletedPurchase;
  return {
    hasDeposit: canPlay,
    hasCompletedPurchase,
    activationBonusType:
      payload?.activation_bonus_type === 'referral' || payload?.activation_bonus_type === 'welcome'
        ? payload.activation_bonus_type
        : null
  };
}

async function fetchGamePlayEligibilityCached(userId, { force = false } = {}) {
  const cacheKey = userId != null ? String(userId) : '';
  const now = Date.now();

  if (
    !force &&
    eligibilityCache.userId === cacheKey &&
    now - eligibilityCache.at < ELIGIBILITY_CACHE_MS
  ) {
    return {
      hasDeposit: eligibilityCache.hasDeposit,
      hasCompletedPurchase: eligibilityCache.hasCompletedPurchase === true,
      activationBonusType: eligibilityCache.activationBonusType
    };
  }

  if (force) {
    eligibilityInflight = null;
    eligibilityInflightUserId = null;
  }

  if (!eligibilityInflight || eligibilityInflightUserId !== cacheKey) {
    eligibilityInflightUserId = cacheKey;
    eligibilityInflight = gamesApi
      .getGamePlayEligibility()
      .then((res) => {
        const parsed = parseEligibilityPayload(res);
        eligibilityCache = {
          at: Date.now(),
          userId: cacheKey,
          hasDeposit: parsed.hasDeposit,
          hasCompletedPurchase: parsed.hasCompletedPurchase,
          activationBonusType: parsed.activationBonusType
        };
        return parsed;
      })
      .finally(() => {
        eligibilityInflight = null;
        eligibilityInflightUserId = null;
      });
  }

  return eligibilityInflight;
}

export function invalidateGamePlayEligibilityCache() {
  eligibilityCache = {
    at: 0,
    userId: null,
    hasDeposit: false,
    hasCompletedPurchase: false,
    activationBonusType: null
  };
  eligibilityInflight = null;
  eligibilityInflightUserId = null;
}

/**
 * Whether the user has completed at least one wallet deposit and can play slots
 * or top up / redeem platform games.
 */
export function useGamePlayEligibility({ enabled = true } = {}) {
  const { isAuthenticated, authLoading, user } = useAuth();
  const userId = resolveAuthUserId(user);
  const gateActive = enabled && isAuthenticated && userId != null;
  const gateActiveRef = useRef(gateActive);
  const [hasDeposit, setHasDeposit] = useState(() => !gateActive);
  const [activationBonusType, setActivationBonusType] = useState(null);
  const [loading, setLoading] = useState(() => gateActive);
  const hasDepositRef = useRef(!gateActive);

  const refresh = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!gateActive) {
        setHasDeposit(true);
        hasDepositRef.current = true;
        setActivationBonusType(null);
        setLoading(false);
        return true;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        if (force) invalidateGamePlayEligibilityCache();
        const parsed = await fetchGamePlayEligibilityCached(userId, { force });
        setHasDeposit(parsed.hasDeposit);
        hasDepositRef.current = parsed.hasDeposit;
        setActivationBonusType(parsed.activationBonusType);
        return parsed.hasDeposit;
      } catch {
        if (silent && hasDepositRef.current) {
          return true;
        }
        setHasDeposit(false);
        hasDepositRef.current = false;
        setActivationBonusType(null);
        return false;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [gateActive, userId]
  );

  useEffect(() => {
    hasDepositRef.current = hasDeposit;
  }, [hasDeposit]);

  useEffect(() => {
    if (gateActiveRef.current !== gateActive) {
      gateActiveRef.current = gateActive;
      const nextHasDeposit = !gateActive;
      setHasDeposit(nextHasDeposit);
      hasDepositRef.current = nextHasDeposit;
      setActivationBonusType(null);
      setLoading(gateActive);
    }
  }, [gateActive]);

  useEffect(() => {
    invalidateGamePlayEligibilityCache();
  }, [userId]);

  useEffect(() => {
    if (authLoading) return undefined;
    refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (!gateActive) return undefined;

    // Only re-check on explicit deposit completion — not on every wallet:refresh
    // (slot/wallet polls were forcing this API for every logged-in user).
    const onDepositEligibilityChanged = () => {
      invalidateGamePlayEligibilityCache();
      refresh({ silent: true, force: true });
    };

    const onAuthUnauthorized = () => {
      invalidateGamePlayEligibilityCache();
      setHasDeposit(false);
      hasDepositRef.current = false;
      setActivationBonusType(null);
      setLoading(false);
    };

    window.addEventListener(DEPOSIT_ELIGIBILITY_CHANGED_EVENT, onDepositEligibilityChanged);
    window.addEventListener('auth:unauthorized', onAuthUnauthorized);
    return () => {
      window.removeEventListener(DEPOSIT_ELIGIBILITY_CHANGED_EVENT, onDepositEligibilityChanged);
      window.removeEventListener('auth:unauthorized', onAuthUnauthorized);
    };
  }, [gateActive, refresh]);

  return {
    hasDeposit,
    canPlayGames: hasDeposit,
    activationBonusType,
    loading,
    refresh
  };
}

/**
 * Gate game play / balance actions behind a completed wallet deposit.
 */
export function useDepositRequiredGate({ enabled = true } = {}) {
  const { hasDeposit, activationBonusType, loading, refresh } = useGamePlayEligibility({ enabled });
  const [modalOpen, setModalOpen] = useState(false);
  const hasDepositRef = useRef(hasDeposit);

  useEffect(() => {
    hasDepositRef.current = hasDeposit;
  }, [hasDeposit]);

  const notifyOnboardingModalOpened = useCallback(() => {
    try {
      if (localStorage.getItem('onboarding_pending') === 'true') {
        window.dispatchEvent(new CustomEvent('onboarding:deposit-required-modal-opened'));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const notifyOnboardingModalClosed = useCallback(() => {
    try {
      if (localStorage.getItem('onboarding_pending') === 'true') {
        window.dispatchEvent(new CustomEvent('onboarding:deposit-required-modal-closed'));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const openDepositRequiredModal = useCallback(() => {
    // Re-verify from server before showing — covers Chime/package credits mid-session.
    void (async () => {
      let deposited = hasDepositRef.current;
      if (!deposited) {
        deposited = await refresh({ silent: true, force: true });
      }
      if (deposited) {
        setModalOpen(false);
        return;
      }
      setModalOpen(true);
      notifyOnboardingModalOpened();
    })();
  }, [refresh, notifyOnboardingModalOpened]);

  const closeDepositRequiredModal = useCallback(() => {
    setModalOpen(false);
    notifyOnboardingModalClosed();
  }, [notifyOnboardingModalClosed]);

  const requireDeposit = useCallback(
    async (action) => {
      if (!enabled) {
        if (typeof action === 'function') action();
        return true;
      }

      let deposited = hasDeposit;
      // Always re-check before blocking — SPA state can stay stale after Chime/package approval.
      if (!deposited || loading) {
        deposited = await refresh({ force: !deposited });
      }

      if (!deposited) {
        openDepositRequiredModal();
        return false;
      }

      setModalOpen(false);
      if (typeof action === 'function') action();
      return true;
    },
    [enabled, hasDeposit, loading, refresh, openDepositRequiredModal]
  );

  return {
    hasDeposit,
    activationBonusType,
    loading,
    refresh,
    requireDeposit,
    depositRequiredModalOpen: modalOpen,
    openDepositRequiredModal,
    closeDepositRequiredModal,
  };
}
