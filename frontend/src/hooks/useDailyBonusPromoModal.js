import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAuthUserId } from './useFirstDepositBonusModal';
import {
  isPromoDeferOverlayOpen,
  PROMO_DEFER_RETRY_MS,
} from './useBlockingOverlayOpen';
import * as dailyBonusApi from '../api/dailyBonus';

/** @deprecated Use admin-configured delay from dashboard promo modals settings. */
export const DAILY_BONUS_PROMO_DELAY_MS = 5_000;

const STORAGE_PREFIX = 'daily_bonus_tracker_modal_shown_';

export function dailyBonusPromoStorageKey(userId, dayKey) {
  return `${STORAGE_PREFIX}${userId}_${dayKey}`;
}

function todayKeyUTC() {
  return new Date().toISOString().slice(0, 10);
}

function isOnboardingPending() {
  try {
    return localStorage.getItem('onboarding_pending') === 'true';
  } catch {
    return false;
  }
}

function isDashboardHome(pathname) {
  return pathname === '/';
}

/**
 * Daily Bonus modal — manual open via sidebar; auto-open is driven by dashboard promo sequence.
 */
export function useDailyBonusPromoModal({ isAuthenticated, authLoading, user }) {
  const { pathname } = useLocation();
  const userId = getAuthUserId(user);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [claimingDay, setClaimingDay] = useState(null);
  const manualOpenRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const markShownToday = useCallback(() => {
    if (userId == null) return;
    try {
      localStorage.setItem(dailyBonusPromoStorageKey(userId, todayKeyUTC()), '1');
    } catch (_) {
      /* ignore */
    }
  }, [userId]);

  const close = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    markShownToday();
    manualOpenRef.current = false;
  }, [markShownToday]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await dailyBonusApi.getDailyBonusStatus({ start: true });
      setStatus(data);
      return data;
    } catch {
      setStatus(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const openManual = useCallback(async () => {
    const data = await loadStatus();
    // Store admin disabled / not configured → never open the empty modal.
    if (!data?.available) {
      manualOpenRef.current = false;
      return;
    }
    manualOpenRef.current = true;
    setOpen(true);
  }, [loadStatus]);

  const refreshSilent = useCallback(async () => {
    try {
      const data = await dailyBonusApi.getDailyBonusStatus({ start: true });
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const tryAutoOpen = useCallback(async () => {
    if (!isAuthenticated || authLoading || userId == null) return false;
    if (!isDashboardHome(pathname) || isOnboardingPending()) return false;
    if (user?.onboardingCompleted === false) return false;

    const dayKey = todayKeyUTC();
    try {
      if (localStorage.getItem(dailyBonusPromoStorageKey(userId, dayKey))) return false;
    } catch (_) {
      /* continue */
    }

    const data = await loadStatus();
    if (!data?.available) {
      markShownToday();
      return false;
    }
    if (data.permanently_done) {
      markShownToday();
      return false;
    }
    if (data.claimed_today) {
      markShownToday();
      return false;
    }

    manualOpenRef.current = false;
    openRef.current = true;
    setOpen(true);
    return true;
  }, [isAuthenticated, authLoading, userId, pathname, user?.onboardingCompleted, loadStatus, markShownToday]);

  const isOpen = useCallback(() => openRef.current, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setOpen(false);
      setStatus(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const onOpen = () => {
      openManual();
    };
    window.addEventListener('daily-bonus:open', onOpen);
    return () => window.removeEventListener('daily-bonus:open', onOpen);
  }, [openManual]);

  useEffect(() => {
    if (!open) return undefined;
    const hideIfBusy = () => {
      // Sidebar / route opens must stay until the user closes them.
      if (manualOpenRef.current) return;
      // Claim-result overlay sits on top of the tracker — don't dismiss the tracker.
      if (document.getElementById('db-claim-result-title')) return;
      if (isPromoDeferOverlayOpen(pathname)) close();
    };
    hideIfBusy();
    const id = window.setInterval(hideIfBusy, PROMO_DEFER_RETRY_MS);
    return () => window.clearInterval(id);
  }, [open, pathname, close]);

  return {
    open,
    close,
    openManual,
    tryAutoOpen,
    isOpen,
    status,
    loading,
    claimingDay,
    setClaimingDay,
    refreshSilent,
    loadStatus,
  };
}
