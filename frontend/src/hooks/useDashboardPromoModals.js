import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSpinWheelStatus } from '../context/SpinWheelStatusContext';
import {
  getAuthUserId,
  firstDepositModalStorageKey,
  userHasCompletedDeposit,
} from './useFirstDepositBonusModal';
import {
  isDashboardPromoBlocked,
  PROMO_DEFER_RETRY_MS,
} from './useBlockingOverlayOpen';
import { DEFAULT_DASHBOARD_PROMO_MODALS } from '../api/dashboardPromoModals';

/** @deprecated Use admin-configured delays from dashboard promo modals settings. */
export const PROMO_MODAL_STEP_MS = 5_000;
/** @deprecated Use admin-configured delays from dashboard promo modals settings. */
export const PROMO_MODAL_INITIAL_LOGIN_MS = 5_000;
/** @deprecated Use admin-configured delays from dashboard promo modals settings. */
export const PROMO_MODAL_AFTER_ONBOARDING_MS = 5_000;

const SPIN_WHEEL_MODAL_STORAGE_PREFIX = 'spin_wheel_ready_modal_dismissed_';
const INVITE_FRIENDS_MODAL_STORAGE_PREFIX = 'invite_friends_earn_modal_dismissed_';
const CUSTOM_PROMO_MODAL_STORAGE_PREFIX = 'custom_promo_modal_dismissed_';

export function spinWheelModalStorageKey(userId, stepId = '') {
  const id = String(stepId || '').trim();
  return id
    ? `${SPIN_WHEEL_MODAL_STORAGE_PREFIX}${userId}_${id}`
    : `${SPIN_WHEEL_MODAL_STORAGE_PREFIX}${userId}`;
}

export function inviteFriendsModalStorageKey(userId, stepId = '') {
  const id = String(stepId || '').trim();
  return id
    ? `${INVITE_FRIENDS_MODAL_STORAGE_PREFIX}${userId}_${id}`
    : `${INVITE_FRIENDS_MODAL_STORAGE_PREFIX}${userId}`;
}

export function customPromoModalStorageKey(userId, stepId) {
  return `${CUSTOM_PROMO_MODAL_STORAGE_PREFIX}${userId}_${stepId}`;
}

function isOnboardingPending() {
  try {
    return localStorage.getItem('onboarding_pending') === 'true';
  } catch {
    return false;
  }
}

function isDashboardPromoPath(pathname) {
  return pathname === '/';
}

function canShowPromoOnPath(pathname) {
  return isDashboardPromoPath(pathname);
}

function secondsToMs(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1000);
}

function getEnabledSteps(promoConfig) {
  const cfg = promoConfig?.enabled === false ? null : promoConfig;
  const steps = Array.isArray(cfg?.steps) ? cfg.steps : DEFAULT_DASHBOARD_PROMO_MODALS.steps;
  return steps.filter((step) => step?.enabled !== false);
}

/**
 * Dashboard promo modal sequence.
 * Delay = gap AFTER the user closes a modal (from that modal's delaySeconds).
 * Skipped / ineligible modals add no delay.
 */
export function useDashboardPromoModals({
  isAuthenticated,
  authLoading,
  user,
  depositBonusEligibility,
  promoConfig,
  promoConfigLoading = false,
  dailyBonusPromo,
}) {
  const { pathname } = useLocation();
  const { canSpin, loading: spinStatusLoading } = useSpinWheelStatus();
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const [firstDepositModalOpen, setFirstDepositModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [customModalStep, setCustomModalStep] = useState(null);

  const spinStepIdRef = useRef(null);
  const inviteStepIdRef = useRef(null);
  const spinOpenRef = useRef(false);
  const depositOpenRef = useRef(false);
  const inviteOpenRef = useRef(false);
  const customOpenRef = useRef(false);
  const depositEligibleRef = useRef(false);
  const canSpinRef = useRef(canSpin);
  const spinStatusLoadingRef = useRef(spinStatusLoading);
  const pathnameRef = useRef(pathname);
  const promoTimersRef = useRef([]);
  const promoChainTokenRef = useRef(0);
  const promoChainStartedForUserRef = useRef(null);
  const postOnboardingPromoPendingRef = useRef(false);
  const promoConfigRef = useRef(promoConfig);
  const dailyBonusPromoRef = useRef(dailyBonusPromo);
  const depositEligibilityRef = useRef(depositBonusEligibility);
  const chainActiveRef = useRef(false);
  const userId = getAuthUserId(user);

  useEffect(() => {
    promoConfigRef.current = promoConfig;
  }, [promoConfig]);

  useEffect(() => {
    dailyBonusPromoRef.current = dailyBonusPromo;
  }, [dailyBonusPromo]);

  useEffect(() => {
    depositEligibilityRef.current = depositBonusEligibility;
  }, [depositBonusEligibility]);

  useEffect(() => {
    canSpinRef.current = canSpin;
  }, [canSpin]);

  useEffect(() => {
    spinStatusLoadingRef.current = spinStatusLoading;
  }, [spinStatusLoading]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const clearPromoTimers = useCallback(() => {
    promoTimersRef.current.forEach((id) => window.clearTimeout(id));
    promoTimersRef.current = [];
  }, []);

  const hideAllPromoModals = useCallback(() => {
    spinOpenRef.current = false;
    depositOpenRef.current = false;
    inviteOpenRef.current = false;
    customOpenRef.current = false;
    setSpinModalOpen(false);
    setFirstDepositModalOpen(false);
    setInviteModalOpen(false);
    setCustomModalStep(null);
  }, []);

  const closeAllPromoModals = useCallback(() => {
    if (chainActiveRef.current) return;
    hideAllPromoModals();
  }, [hideAllPromoModals]);

  const closeInviteModal = useCallback(() => {
    inviteOpenRef.current = false;
    setInviteModalOpen(false);
    if (userId != null) {
      localStorage.setItem(inviteFriendsModalStorageKey(userId, inviteStepIdRef.current), '1');
    }
    inviteStepIdRef.current = null;
  }, [userId]);

  const closeFirstDepositModal = useCallback(() => {
    depositOpenRef.current = false;
    setFirstDepositModalOpen(false);
    if (userId != null) {
      localStorage.setItem(firstDepositModalStorageKey(userId), '1');
    }
  }, [userId]);

  const closeFirstDepositForDeposit = useCallback(() => {
    closeFirstDepositModal();
  }, [closeFirstDepositModal]);

  const closeSpinModal = useCallback(() => {
    spinOpenRef.current = false;
    setSpinModalOpen(false);
    if (userId != null) {
      localStorage.setItem(spinWheelModalStorageKey(userId, spinStepIdRef.current), '1');
    }
    spinStepIdRef.current = null;
  }, [userId]);

  const closeSpinModalForSpin = useCallback(() => {
    closeSpinModal();
  }, [closeSpinModal]);

  const closeCustomModal = useCallback(() => {
    customOpenRef.current = false;
    setCustomModalStep((current) => {
      if (userId != null && current?.id) {
        localStorage.setItem(customPromoModalStorageKey(userId, current.id), '1');
      }
      return null;
    });
  }, [userId]);

  const startPromoModalChain = useCallback(
    (initialDelayMs) => {
      if (userId == null) return () => {};
      if (promoChainStartedForUserRef.current === userId) return () => {};

      const config = promoConfigRef.current;
      if (config?.enabled === false) return () => {};

      const enabledSteps = getEnabledSteps(config);
      if (enabledSteps.length === 0) return () => {};

      const chainToken = promoChainTokenRef.current + 1;
      promoChainTokenRef.current = chainToken;
      promoChainStartedForUserRef.current = userId;
      chainActiveRef.current = true;

      let cancelled = false;

      const isActiveChain = () => !cancelled && promoChainTokenRef.current === chainToken;

      const schedule = (delayMs, fn) => {
        const id = window.setTimeout(() => {
          if (isActiveChain()) fn();
        }, Math.max(0, delayMs));
        promoTimersRef.current.push(id);
      };

      const onAllowedPath = () =>
        canShowPromoOnPath(pathnameRef.current) && !isOnboardingPending();

      const whenClearToShowPromo = (fn) => {
        let attempts = 0;
        const tryOpen = () => {
          if (!isActiveChain()) return;
          if (!onAllowedPath()) return;
          attempts += 1;
          // Don't stall forever behind a leftover overlay (exit animations, etc.).
          if (attempts < 20 && isDashboardPromoBlocked(pathnameRef.current)) {
            schedule(PROMO_DEFER_RETRY_MS, tryOpen);
            return;
          }
          fn();
        };
        tryOpen();
      };

      const finishChain = () => {
        if (promoChainTokenRef.current === chainToken) {
          chainActiveRef.current = false;
        }
      };

      const isDismissed = (key) => {
        try {
          return Boolean(localStorage.getItem(key));
        } catch {
          return false;
        }
      };

      const isStepEligible = (step) => {
        if (!step || step.enabled === false) return false;
        if (step.type === 'daily_bonus') return true;
        if (step.type === 'spin_wheel') {
          if (isDismissed(spinWheelModalStorageKey(userId, step.id))) return false;
          return canSpinRef.current === true;
        }
        if (step.type === 'first_deposit') {
          if (!depositEligibleRef.current) return false;
          if (isDismissed(firstDepositModalStorageKey(userId))) return false;
          return true;
        }
        if (step.type === 'invite_friends') {
          if (isDismissed(inviteFriendsModalStorageKey(userId, step.id))) return false;
          return true;
        }
        if (step.type === 'custom') {
          if (!step.imageUrl) return false;
          if (isDismissed(customPromoModalStorageKey(userId, step.id))) return false;
          return true;
        }
        return false;
      };

      const waitForModalClose = (isOpenFn, onDone) => {
        let painted = false;
        const poll = () => {
          if (!isActiveChain()) return;
          if (isOpenFn()) {
            painted = true;
            schedule(PROMO_DEFER_RETRY_MS, poll);
            return;
          }
          // Avoid treating "not painted yet" as closed.
          if (!painted) {
            schedule(PROMO_DEFER_RETRY_MS, poll);
            return;
          }
          onDone();
        };
        schedule(PROMO_DEFER_RETRY_MS, poll);
      };

      const afterClosed = (step, nextIndex) => {
        const gapMs = secondsToMs(step?.delaySeconds);
        schedule(gapMs, () => {
          if (!isActiveChain()) return;
          advanceFrom(nextIndex);
        });
      };

      const openSpin = (step, index) => {
        whenClearToShowPromo(() => {
          hideAllPromoModals();
          spinStepIdRef.current = step.id || null;
          spinOpenRef.current = true;
          setSpinModalOpen(true);
          waitForModalClose(() => spinOpenRef.current, () => afterClosed(step, index + 1));
        });
      };

      const openDeposit = (step, index) => {
        whenClearToShowPromo(() => {
          hideAllPromoModals();
          depositOpenRef.current = true;
          setFirstDepositModalOpen(true);
          waitForModalClose(() => depositOpenRef.current, () => afterClosed(step, index + 1));
        });
      };

      const openInvite = (step, index) => {
        whenClearToShowPromo(() => {
          hideAllPromoModals();
          inviteStepIdRef.current = step.id || null;
          inviteOpenRef.current = true;
          setInviteModalOpen(true);
          waitForModalClose(() => inviteOpenRef.current, () => afterClosed(step, index + 1));
        });
      };

      const openCustom = (step, index) => {
        whenClearToShowPromo(() => {
          hideAllPromoModals();
          customOpenRef.current = true;
          setCustomModalStep(step);
          waitForModalClose(() => customOpenRef.current, () => afterClosed(step, index + 1));
        });
      };

      const openDaily = async (step, index) => {
        const daily = dailyBonusPromoRef.current;
        if (!daily?.tryAutoOpen) {
          advanceFrom(index + 1);
          return;
        }
        whenClearToShowPromo(async () => {
          const opened = await daily.tryAutoOpen();
          if (!isActiveChain()) return;
          if (!opened) {
            advanceFrom(index + 1);
            return;
          }
          waitForModalClose(
            () => dailyBonusPromoRef.current?.isOpen?.() === true,
            () => afterClosed(step, index + 1),
          );
        });
      };

      const showStep = (step, index) => {
        if (step.type === 'daily_bonus') {
          openDaily(step, index);
          return;
        }
        if (step.type === 'spin_wheel') {
          openSpin(step, index);
          return;
        }
        if (step.type === 'first_deposit') {
          openDeposit(step, index);
          return;
        }
        if (step.type === 'invite_friends') {
          openInvite(step, index);
          return;
        }
        if (step.type === 'custom') {
          openCustom(step, index);
          return;
        }
        advanceFrom(index + 1);
      };

      /** Skip ineligible steps with zero delay; show the next eligible one immediately. */
      const advanceFrom = (index) => {
        if (!isActiveChain() || !onAllowedPath()) return;
        let i = index;
        while (i < enabledSteps.length) {
          const step = enabledSteps[i];
          if (isStepEligible(step)) {
            showStep(step, i);
            return;
          }
          i += 1;
        }
        finishChain();
      };

      (async () => {
        const hasDeposit = await userHasCompletedDeposit();
        if (!isActiveChain()) return;

        const eligibility = depositEligibilityRef.current;
        const inProgram = eligibility?.in_program === true;
        const completed = Number(eligibility?.completed_deposits) || 0;
        const eligibleForModal =
          inProgram &&
          completed < 3 &&
          (!eligibility?.expires_at || new Date(eligibility.expires_at).getTime() > Date.now());

        depositEligibleRef.current =
          eligibleForModal && !isDismissed(firstDepositModalStorageKey(userId));

        if ((hasDeposit && completed >= 3) || !eligibleForModal) {
          if (userId != null) localStorage.setItem(firstDepositModalStorageKey(userId), '1');
        }

        schedule(Math.max(0, initialDelayMs), () => {
          if (!isActiveChain() || !onAllowedPath()) return;
          advanceFrom(0);
        });
      })();

      return () => {
        cancelled = true;
      };
    },
    [userId, hideAllPromoModals],
  );

  const getInitialLoginDelayMs = useCallback(() => {
    const cfg = promoConfigRef.current ?? DEFAULT_DASHBOARD_PROMO_MODALS;
    return secondsToMs(cfg.initialLoginDelaySeconds ?? DEFAULT_DASHBOARD_PROMO_MODALS.initialLoginDelaySeconds);
  }, []);

  const getAfterOnboardingDelayMs = useCallback(() => {
    const cfg = promoConfigRef.current ?? DEFAULT_DASHBOARD_PROMO_MODALS;
    return secondsToMs(cfg.afterOnboardingDelaySeconds ?? DEFAULT_DASHBOARD_PROMO_MODALS.afterOnboardingDelaySeconds);
  }, []);

  useEffect(() => {
    if (!canShowPromoOnPath(pathname) || isOnboardingPending()) {
      if (!chainActiveRef.current) hideAllPromoModals();
      return undefined;
    }

    if (!isAuthenticated || authLoading || userId == null || spinStatusLoading || promoConfigLoading) {
      return undefined;
    }

    if (user?.onboardingCompleted === false) {
      return undefined;
    }

    if (promoChainStartedForUserRef.current === userId) {
      return undefined;
    }

    startPromoModalChain(getInitialLoginDelayMs());
    return undefined;
  }, [
    pathname,
    isAuthenticated,
    authLoading,
    userId,
    user?.onboardingCompleted,
    spinStatusLoading,
    promoConfigLoading,
    promoConfig,
    startPromoModalChain,
    getInitialLoginDelayMs,
    hideAllPromoModals,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      promoChainStartedForUserRef.current = null;
      promoChainTokenRef.current = 0;
      postOnboardingPromoPendingRef.current = false;
      chainActiveRef.current = false;
      clearPromoTimers();
      hideAllPromoModals();
    }
  }, [isAuthenticated, clearPromoTimers, hideAllPromoModals]);

  useEffect(() => {
    if (!isAuthenticated || userId == null) return undefined;

    const schedulePostOnboardingPromos = () => {
      clearPromoTimers();
      promoChainStartedForUserRef.current = null;
      chainActiveRef.current = false;
      hideAllPromoModals();
      postOnboardingPromoPendingRef.current = true;

      const id = window.setTimeout(() => {
        postOnboardingPromoPendingRef.current = false;
        if (!isAuthenticated || userId == null) return;
        if (!canShowPromoOnPath(pathnameRef.current)) return;
        if (spinStatusLoadingRef.current) {
          postOnboardingPromoPendingRef.current = true;
          return;
        }
        startPromoModalChain(0);
      }, getAfterOnboardingDelayMs());
      promoTimersRef.current.push(id);
    };

    window.addEventListener('onboarding:ended', schedulePostOnboardingPromos);
    return () => window.removeEventListener('onboarding:ended', schedulePostOnboardingPromos);
  }, [
    isAuthenticated,
    userId,
    clearPromoTimers,
    hideAllPromoModals,
    startPromoModalChain,
    getAfterOnboardingDelayMs,
  ]);

  useEffect(() => {
    if (!postOnboardingPromoPendingRef.current) return undefined;
    if (!isAuthenticated || authLoading || userId == null || spinStatusLoading || promoConfigLoading) {
      return undefined;
    }
    if (!canShowPromoOnPath(pathname)) {
      return undefined;
    }

    postOnboardingPromoPendingRef.current = false;
    promoChainStartedForUserRef.current = null;
    startPromoModalChain(0);
    return undefined;
  }, [pathname, isAuthenticated, authLoading, userId, spinStatusLoading, promoConfigLoading, startPromoModalChain]);

  useEffect(() => () => clearPromoTimers(), [clearPromoTimers]);

  useEffect(() => {
    if (!isAuthenticated || userId == null) return undefined;

    const recheck = async () => {
      const hasDeposit = await userHasCompletedDeposit();
      const eligibility = depositEligibilityRef.current;
      const inProgram = eligibility?.in_program === true;
      const completed = Number(eligibility?.completed_deposits) || 0;
      if (hasDeposit && (!inProgram || completed >= 3)) {
        depositEligibleRef.current = false;
        depositOpenRef.current = false;
        setFirstDepositModalOpen(false);
        localStorage.setItem(firstDepositModalStorageKey(userId), '1');
      }
    };

    window.addEventListener('wallet:refresh', recheck);
    return () => window.removeEventListener('wallet:refresh', recheck);
  }, [isAuthenticated, userId]);

  return {
    spinModalOpen,
    firstDepositModalOpen,
    inviteModalOpen,
    customModalOpen: customModalStep != null,
    customModalStep,
    closeSpinModal,
    closeSpinModalForSpin,
    closeFirstDepositModal,
    closeFirstDepositForDeposit,
    closeInviteModal,
    closeCustomModal,
    closeAllPromoModals,
  };
}
