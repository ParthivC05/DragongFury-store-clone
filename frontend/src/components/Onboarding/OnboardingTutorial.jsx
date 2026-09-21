import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import * as authApi from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { site } from '../../config/site';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

function onboardingWelcomeSeenKey(userId) {
  return `onboarding_welcome_seen_${userId}`;
}

/** Deposit steps need page scroll; other steps lock body scroll behind the overlay. */
const DEPOSIT_ONBOARDING_SCROLL_STEPS = new Set([
  'focus_package_selection',
  'focus_payment_methods',
  'focus_amount_selection',
  'focus_deposit_submit',
]);

const TOPUP_MODAL_ONBOARDING_STEPS = new Set([
  'focus_balance_modal',
  'focus_topup_amount',
  'focus_topup_submit',
]);

const WITHDRAW_MODAL_ONBOARDING_STEPS = new Set([
  'focus_withdraw_amount',
  'focus_withdraw_submit',
]);

const WALLET_ONBOARDING_SCROLL_STEPS = new Set([
  'focus_wallet_icon',
  'focus_sc_info',
  'focus_rsc_info',
]);

const GAMES_ONBOARDING_SCROLL_STEPS = new Set([
  'focus_game',
  'focus_topup',
  'focus_withdraw_btn',
]);

function measureBottomBarHeight() {
  const bar = document.querySelector('.onboarding-bottom-bar');
  if (!bar || window.getComputedStyle(bar).display === 'none') return 0;
  return Math.ceil(bar.getBoundingClientRect().height);
}

function measureNavBottom() {
  const nav = document.querySelector('.dash-nav, .onboarding-navbar, header[class*="dash-nav"]');
  if (nav) return Math.ceil(nav.getBoundingClientRect().bottom);
  const navH = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--dash-nav-h') || '56',
    10
  );
  return Number.isFinite(navH) ? navH : 56;
}

/** Space reserved below the focused UI (bottom guide dock + tab bar on mobile). */
function measureBottomChrome(isMobile) {
  if (!isMobile) return 28;
  const dock = document.querySelector('.onb-guide-dock-amount');
  if (dock) {
    const top = dock.getBoundingClientRect().top;
    if (top > 0 && top < window.innerHeight) {
      return window.innerHeight - top + 16;
    }
  }
  const guide = document.querySelector('.onb-guide-dock-amount .onb-guide, .onb-guide');
  const guideH = guide ? Math.ceil(guide.getBoundingClientRect().height) : 200;
  return measureBottomBarHeight() + guideH + 20;
}

function scrollWindowTo(top, behavior = 'auto') {
  const y = Math.max(0, top);
  window.scrollTo({ top: y, left: 0, behavior });
  document.documentElement.scrollTop = y;
  document.body.scrollTop = y;
}

/**
 * Vertically place `element` in the visible band between nav and bottom onboarding chrome.
 */
function scrollIntoOnboardingViewportBand(element, { preferCenter = true, behavior = 'auto' } = {}) {
  if (!element) return;

  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const topPad = measureNavBottom() + (isMobile ? 20 : 24);
  const bottomChrome = measureBottomChrome(isMobile);
  const rect = element.getBoundingClientRect();
  const vh = window.innerHeight;
  const avail = Math.max(120, vh - topPad - bottomChrome);

  const targetTopInViewport =
    preferCenter && rect.height < avail
      ? topPad + (avail - rect.height) / 2
      : topPad + 16;

  scrollWindowTo(window.scrollY + rect.top - targetTopInViewport, behavior);
}

function amountSelectionSpotlightNodes(section) {
  if (!section) return [];
  return [
    section.querySelector('.dash-panel-title'),
    section.querySelector('.dash-amount-grid'),
    section.querySelector('.mb-4'),
  ].filter(Boolean);
}

function scrollPackageSelectionIntoView() {
  const section = document.querySelector('.onboarding-package-selection');
  scrollIntoOnboardingViewportBand(section, { preferCenter: true });
}

function scrollAmountSelectionIntoView() {
  const section = document.querySelector('.onboarding-amount-selection');
  scrollIntoOnboardingViewportBand(section, { preferCenter: true });
}

function paymentMethodsSpotlightNodes(section) {
  if (!section) return [];
  const grid = section.querySelector('.dash-pay-grid');
  return grid ? [grid] : [section];
}

function scrollPaymentMethodsIntoView() {
  const section = document.querySelector('.onboarding-payment-methods');
  if (!section) return;
  const grid = section.querySelector('.dash-pay-grid');
  const target = grid || section;

  const align = () => {
    scrollIntoOnboardingViewportBand(target, { preferCenter: true, behavior: 'auto' });
  };

  scrollWindowTo(0, 'auto');
  requestAnimationFrame(() => {
    requestAnimationFrame(align);
  });
}

function scrollDepositSubmitIntoView() {
  const btn = document.querySelector('.onboarding-deposit-btn-final');
  if (!btn) return;

  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  if (isMobile) {
    const bottomChrome = measureBottomChrome(true);
    const vh = window.innerHeight;
    const rect = btn.getBoundingClientRect();
    const targetY = window.scrollY + rect.bottom - (vh - bottomChrome) + 12;
    window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    return;
  }

  scrollIntoOnboardingViewportBand(btn, { preferCenter: true });
}

/** First game card that still has a register / login action (skips already-registered games). */
function findFocusGameTarget(userType) {
  const btnSelector = userType === 'existing' ? '.onboarding-login-btn' : '.onboarding-register-btn';
  const buttons = document.querySelectorAll(btnSelector);
  for (const btn of buttons) {
    if (btn.disabled) continue;
    const card = btn.closest('.onboarding-game-card');
    if (card) return { card, btn };
  }
  const fallbackCard = document.querySelector('.onboarding-game-card');
  return { card: fallbackCard, btn: null };
}

function scrollFocusGameCardIntoView(card) {
  if (!card) return;
  scrollIntoOnboardingViewportBand(card, { preferCenter: true, behavior: 'smooth' });
}

export function OnboardingTutorial() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [step, setStep] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('onboarding_step') || 'tutorial_prompt';
    }
    return 'tutorial_prompt';
  });
  
  const [userType, setUserType] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('onboarding_user_type') || 'new';
    }
    return 'new';
  });

  const [isVisible, setIsVisible] = useState(false);
  /** Matches Tailwind `md` (768px): mobile layout for guide + modals stays ≤767px. */
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  const [isBoxAtTop, setIsBoxAtTop] = useState(false);
  /** Cutout rect for spotlight overlay (portal sits above page — hole reveals focused UI). */
  const [spotlightRect, setSpotlightRect] = useState(null);
  /** Game card from focus_game — reused so focus_topup targets the same card after register. */
  const focusedGameCardRef = useRef(null);
  const depositRedirectRef = useRef(null);
  /** Skip revert-to-deposit-flow when View Packages just closed the purchase modal. */
  const viewPackagesClickedRef = useRef(false);
  /** Avoid re-scrolling the Chime submit button on every highlight poll. */
  const chimeSubmitScrolledRef = useRef(false);

  useEffect(() => {
    if (step === 'focus_game') {
      focusedGameCardRef.current = null;
    }
    if (step !== 'focus_chime_form') {
      chimeSubmitScrolledRef.current = false;
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'deposit_flow_prompt' && step !== 'focus_toast_error') return;
    try {
      window.dispatchEvent(new CustomEvent('onboarding:close-game-modals'));
    } catch (_) {}
  }, [step]);

  const goToDepositTutorial = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent('onboarding:close-game-modals'));
    } catch (_) {}
    setStep('deposit_flow_prompt');
  }, []);

  const handleDepositPromptYes = useCallback(() => {
    if (pathname !== '/') {
      navigate('/');
    }
    setStep('focus_deposit_flow');
  }, [pathname, navigate]);

  // During deposit tutorial step, Deposit / Buy SC opens the welcome-bonus packages modal when required.
  useEffect(() => {
    if (!isVisible || step !== 'focus_deposit_flow') return undefined;

    const onDepositNavClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        window.dispatchEvent(new CustomEvent('onboarding:request-deposit-packages'));
      } catch {
        /* ignore */
      }
    };

    const bind = () => {
      const buttons = document.querySelectorAll('.onboarding-deposit-btn, .onboarding-buy-sc-btn');
      buttons.forEach((btn) => btn.addEventListener('click', onDepositNavClick, true));
      return buttons;
    };

    let buttons = bind();
    const interval = window.setInterval(() => {
      buttons.forEach((btn) => btn.removeEventListener('click', onDepositNavClick, true));
      buttons = bind();
    }, 500);

    return () => {
      window.clearInterval(interval);
      buttons.forEach((btn) => btn.removeEventListener('click', onDepositNavClick, true));
    };
  }, [isVisible, step]);

  const skipToCompletionFlow = useCallback(() => {
    if (pathname !== '/') {
      navigate('/');
    }
    setStep('focus_wallet_icon');
  }, [pathname, navigate]);

  useEffect(() => {
    if (!isVisible || step === 'none' || step === 'payment_waiting') return undefined;
    const onDepositPage = pathname === '/deposit' || pathname.startsWith('/deposit/');
    const allowPageScroll =
      onDepositPage ||
      DEPOSIT_ONBOARDING_SCROLL_STEPS.has(step) ||
      WALLET_ONBOARDING_SCROLL_STEPS.has(step) ||
      GAMES_ONBOARDING_SCROLL_STEPS.has(step);
    if (allowPageScroll) return undefined;
    const releaseScrollLock = lockBodyScroll({ lockHtml: true });
    return () => {
      releaseScrollLock();
    };
  }, [isVisible, step, pathname]);

  useEffect(() => {
    const pending = localStorage.getItem('onboarding_pending');
    if (pending === 'true') {
      setIsVisible(true);
    }

    const mql = window.matchMedia('(max-width: 767px)');
    const handler = () => setIsMobile(mql.matches);
    const startHandler = (e) => {
      if (e?.detail?.restart === true) {
        try {
          const nextStep = localStorage.getItem('onboarding_step') || 'tutorial_prompt';
          const nextUserType = localStorage.getItem('onboarding_user_type') || 'new';
          setStep(nextStep);
          setUserType(nextUserType);
        } catch (_) {
          /* ignore */
        }
        setSpotlightRect(null);
      }
      setIsVisible(true);
    };
    
    mql.addEventListener('change', handler);
    window.addEventListener('onboarding:start', startHandler);
    
    return () => {
      mql.removeEventListener('change', handler);
      window.removeEventListener('onboarding:start', startHandler);
    };
  }, []);

  // After first login, do not show the welcome modal again for this account (survives logout via storageUtils).
  useLayoutEffect(() => {
    if (!isVisible || !user?.userId || step !== 'welcome') return;
    try {
      if (localStorage.getItem(onboardingWelcomeSeenKey(user.userId)) === '1') {
        setStep('focus_game');
        setUserType(localStorage.getItem('onboarding_user_type') || 'new');
      }
    } catch {
      /* ignore */
    }
  }, [isVisible, user?.userId, step]);

  // Persist step and userType to localStorage
  useEffect(() => {
    if (isVisible) {
      localStorage.setItem('onboarding_step', step);
      localStorage.setItem('onboarding_user_type', userType);
      try {
        window.dispatchEvent(new CustomEvent('onboarding:updated'));
      } catch (_) {}
    }
  }, [step, userType, isVisible]);

  const clearHighlights = useCallback(() => {
    document.querySelectorAll('.onboarding-highlight').forEach(el => {
      el.classList.remove('onboarding-highlight');
      el.style.pointerEvents = '';
    });
    document.querySelectorAll('.onboarding-wallet-highlight').forEach(el => {
      el.classList.remove('onboarding-wallet-highlight');
      el.style.pointerEvents = '';
    });
    document.querySelectorAll('.onboarding-card-highlight').forEach(el => el.classList.remove('onboarding-card-highlight'));
  }, []);

  const finishTutorial = useCallback((shouldRedirect = false) => {
    localStorage.removeItem('onboarding_pending');
    localStorage.removeItem('onboarding_step');
    localStorage.removeItem('onboarding_user_type');
    
    // Persist completion to backend
    authApi.completeOnboarding().catch(() => {});

    setIsVisible(false);
    setStep('none');
    clearHighlights();
    try {
      window.dispatchEvent(new CustomEvent('onboarding:ended'));
    } catch (_) {}
    if (shouldRedirect) {
      window.location.href = '/';
    }
  }, [clearHighlights]);

  const handleTutorialYes = useCallback(() => {
    setStep('welcome');
  }, []);

  const handleTutorialNo = useCallback(() => {
    finishTutorial();
  }, [finishTutorial]);

  // Effect to maintain highlights even when React re-renders the target components
  useEffect(() => {
    if (
      step === 'tutorial_prompt' ||
      step === 'welcome' ||
      step === 'deposit_flow_prompt' ||
      step === 'none' ||
      step === 'payment_waiting' ||
      step === 'congratulations' ||
      !isVisible
    ) {
      clearHighlights();
      setSpotlightRect(null);
      return;
    }

    const updateSpotlight = (el, padOverride) => {
      const pad =
        padOverride ??
        (step === 'focus_topup' ? 14 : step === 'focus_game' ? 10 : 6);

      const nodes = Array.isArray(el) ? el.filter((n) => n && document.contains(n)) : el ? [el] : [];
      if (!nodes.length) {
        setSpotlightRect(null);
        return;
      }

      let top = Infinity;
      let left = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      nodes.forEach((node) => {
        const r = node.getBoundingClientRect();
        top = Math.min(top, r.top);
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
        bottom = Math.max(bottom, r.bottom);
      });

      setSpotlightRect({
        top: top - pad,
        left: left - pad,
        width: right - left + pad * 2,
        height: bottom - top + pad * 2,
        radius:
          step === 'focus_topup'
            ? 9999
            : step === 'focus_deposit_submit'
              ? 14
              : step === 'focus_game'
                ? 16
                : 12,
      });
    };

    const applyHighlights = () => {
      let targetClass = '';
      let cardClass = '.onboarding-game-card';

      if (step === 'focus_chime_copy') targetClass = '.onboarding-chime-copy-btn';
      else if (step === 'focus_game') {
        targetClass = userType === 'existing' ? '.onboarding-login-btn' : '.onboarding-register-btn';
      }
      else if (step === 'focus_link_username') targetClass = '.onboarding-link-username';
      else if (step === 'focus_link_submit') targetClass = '.onboarding-link-submit';
      else if (step === 'focus_topup') targetClass = '.onboarding-topup-btn';
      else if (step === 'focus_topup_amount') targetClass = '.onboarding-topup-amount-input';
      else if (step === 'focus_topup_submit') targetClass = '.onboarding-topup-submit-btn';
      else if (step === 'focus_withdraw_btn') targetClass = '.onboarding-withdraw-btn';
      else if (step === 'focus_withdraw_amount') targetClass = '.onboarding-withdraw-amount-input';
      else if (step === 'focus_withdraw_submit') targetClass = '.onboarding-withdraw-submit-btn';
      else if (step === 'focus_balance_modal') targetClass = '.onboarding-get-sc-btn';
      else if (step === 'focus_deposit_flow') targetClass = isMobile ? '.onboarding-buy-sc-btn' : '.onboarding-deposit-btn';
      else if (step === 'focus_view_packages') targetClass = '.onboarding-view-packages-btn';
      else if (step === 'focus_package_selection') targetClass = '.onboarding-package-selection';
      else if (step === 'focus_payment_methods') targetClass = '.onboarding-payment-methods';
      else if (step === 'focus_amount_selection') targetClass = '.onboarding-amount-selection';
      else if (step === 'focus_deposit_submit') targetClass = '.onboarding-deposit-btn-final';
      else if (step === 'focus_toast_error') targetClass = '.onboarding-game-transfer-error, .dash-toast';
      else if (step === 'focus_wallet_icon') targetClass = '.onboarding-navbar-wallet';
      else if (step === 'focus_sc_info') targetClass = '.onboarding-sc-info';
      else if (step === 'focus_rsc_info') targetClass = '.onboarding-rsc-info';

      if (step === 'focus_chime_form') {
        const nameInput = document.querySelector('.onboarding-chime-name-input');
        const submitEl = document.querySelector('.onboarding-chime-submit');
        const hasName = nameInput && (nameInput.value || '').trim().length >= 1;

        if (hasName) {
          if (nameInput) nameInput.classList.remove('onboarding-highlight');
          if (submitEl) {
            if (!submitEl.classList.contains('onboarding-highlight')) {
              submitEl.classList.add('onboarding-highlight');
            }
            submitEl.style.pointerEvents = 'auto';
            if (!chimeSubmitScrolledRef.current) {
              chimeSubmitScrolledRef.current = true;
              try {
                submitEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              } catch {
                /* ignore */
              }
            }
          }
          setIsBoxAtTop(true);
        } else {
          chimeSubmitScrolledRef.current = false;
          if (submitEl) {
            submitEl.classList.remove('onboarding-highlight');
            submitEl.style.pointerEvents = '';
          }
          if (nameInput) {
            if (!nameInput.classList.contains('onboarding-highlight')) {
              nameInput.classList.add('onboarding-highlight');
            }
            nameInput.style.pointerEvents = 'auto';
          }
          setIsBoxAtTop(true);
        }
      } else if (
        targetClass &&
        step !== 'focus_game' &&
        step !== 'focus_topup' &&
        step !== 'focus_withdraw_btn' &&
        step !== 'focus_deposit_submit' &&
        step !== 'focus_wallet_icon' &&
        step !== 'focus_toast_error' &&
        step !== 'focus_package_selection'
      ) {
        const target = document.querySelector(targetClass);
        if (target) {
          if (step === 'focus_payment_methods') {
            target.classList.remove('onboarding-highlight');
            const payGrid = target.querySelector('.dash-pay-grid');
            if (payGrid && !payGrid.classList.contains('onboarding-highlight')) {
              payGrid.classList.add('onboarding-highlight');
            }
          } else if (!target.classList.contains('onboarding-highlight')) {
            target.classList.add('onboarding-highlight');
          }

          // Position detection for the instruction box
          const rect = target.getBoundingClientRect();
          const threshold = window.innerHeight * 0.55; 
          
          // EXCEPTIONS: Steps that must stay at the bottom to avoid covering Toasts or specific UI areas
          const mustStayBottom =
            step === 'focus_link_submit' ||
            step === 'focus_chime_copy' ||
            step === 'focus_chime_form' ||
            step === 'focus_toast_error';
          
          if (step === 'focus_deposit_flow') {
            setIsBoxAtTop(true);
          } else if (step === 'focus_view_packages') {
            setIsBoxAtTop(true);
          } else if (step === 'focus_payment_methods') {
            setIsBoxAtTop(!isMobile);
          } else if (step === 'focus_amount_selection' || step === 'focus_deposit_submit') {
            setIsBoxAtTop(false);
          } else if (rect.top > threshold && !mustStayBottom) {
            setIsBoxAtTop(true);
          } else {
            setIsBoxAtTop(false);
          }

          // Disable pointer events for purely informational steps
          if (step === 'focus_sc_info' || step === 'focus_rsc_info') {
            target.style.pointerEvents = 'none';
          } else {
            target.style.pointerEvents = 'auto';
          }
        }
      }

      let spotlightEl = null;

      if (step === 'focus_game') {
        const btnSelector = userType === 'existing' ? '.onboarding-login-btn' : '.onboarding-register-btn';
        // Stick to the first targeted card so Register click cannot retarget a lower game
        // while the register button unmounts and findFocusGameTarget would pick the next one.
        const lockedCard =
          focusedGameCardRef.current && document.contains(focusedGameCardRef.current)
            ? focusedGameCardRef.current
            : null;
        let card = lockedCard;
        let registerBtn = lockedCard ? lockedCard.querySelector(btnSelector) : null;
        if (!card) {
          const found = findFocusGameTarget(userType);
          card = found.card;
          registerBtn = found.btn;
          if (card) focusedGameCardRef.current = card;
        }

        document.querySelectorAll('.onboarding-game-card.onboarding-card-highlight').forEach((el) => {
          if (el !== card) el.classList.remove('onboarding-card-highlight');
        });
        document.querySelectorAll('.onboarding-register-btn.onboarding-highlight, .onboarding-login-btn.onboarding-highlight').forEach((el) => {
          if (el !== registerBtn) {
            el.classList.remove('onboarding-highlight');
            el.style.pointerEvents = '';
          }
        });
        if (card) {
          if (!card.classList.contains('onboarding-card-highlight')) {
            card.classList.add('onboarding-card-highlight');
          }
        }
        if (registerBtn) {
          if (!registerBtn.classList.contains('onboarding-highlight')) {
            registerBtn.classList.add('onboarding-highlight');
          }
          registerBtn.style.pointerEvents = 'auto';
        }
        setIsBoxAtTop(false);
        spotlightEl = card;
      } else if (step === 'focus_topup') {
        setIsBoxAtTop(false);
        const storedCard =
          focusedGameCardRef.current && document.contains(focusedGameCardRef.current)
            ? focusedGameCardRef.current
            : null;
        const card =
          storedCard ||
          document.querySelector('.onboarding-game-card.onboarding-card-highlight') ||
          document.querySelector('.onboarding-topup-btn')?.closest('.onboarding-game-card') ||
          document.querySelector(cardClass);
        const topupBtn =
          card?.querySelector('.onboarding-topup-btn') ||
          document.querySelector('.onboarding-topup-btn');

        if (card && !card.classList.contains('onboarding-card-highlight')) {
          card.classList.add('onboarding-card-highlight');
        }
        if (topupBtn) {
          if (!topupBtn.classList.contains('onboarding-highlight')) {
            topupBtn.classList.add('onboarding-highlight');
          }
          topupBtn.style.pointerEvents = 'auto';
          spotlightEl = topupBtn;
        } else if (card) {
          spotlightEl = card;
        }
      } else if (step === 'focus_withdraw_btn') {
        setIsBoxAtTop(false);
        const storedCard =
          focusedGameCardRef.current && document.contains(focusedGameCardRef.current)
            ? focusedGameCardRef.current
            : null;
        const card =
          storedCard ||
          document.querySelector('.onboarding-game-card.onboarding-card-highlight') ||
          document.querySelector('.onboarding-withdraw-btn')?.closest('.onboarding-game-card') ||
          document.querySelector(cardClass);
        const withdrawBtn =
          card?.querySelector('.onboarding-withdraw-btn') ||
          document.querySelector('.onboarding-withdraw-btn');

        if (card && !card.classList.contains('onboarding-card-highlight')) {
          card.classList.add('onboarding-card-highlight');
        }
        if (withdrawBtn) {
          if (!withdrawBtn.classList.contains('onboarding-highlight')) {
            withdrawBtn.classList.add('onboarding-highlight');
          }
          withdrawBtn.style.pointerEvents = 'auto';
          spotlightEl = withdrawBtn;
        } else if (card) {
          spotlightEl = card;
        }
      } else if (step === 'focus_toast_error') {
        setIsBoxAtTop(true);
        const toastEl =
          document.querySelector('.onboarding-game-transfer-error') ||
          document.querySelector('.dash-toast');
        if (toastEl) {
          if (!toastEl.classList.contains('onboarding-highlight')) {
            toastEl.classList.add('onboarding-highlight');
          }
          toastEl.style.pointerEvents = 'auto';
          updateSpotlight(toastEl, 10);
        } else {
          setSpotlightRect(null);
        }
        spotlightEl = null;
      } else if (step === 'focus_package_selection') {
        const section = document.querySelector('.onboarding-package-selection');
        updateSpotlight(section, 10);
        spotlightEl = null;
      } else if (step === 'focus_chime_form') {
        spotlightEl =
          document.querySelector('.onboarding-chime-submit.onboarding-highlight') ||
          document.querySelector('.onboarding-chime-name-input.onboarding-highlight');
      } else if (step === 'focus_wallet_icon') {
        setIsBoxAtTop(!isMobile);
        const walletBtn = document.querySelector('.onboarding-navbar-wallet');
        if (walletBtn) {
          if (!walletBtn.classList.contains('onboarding-wallet-highlight')) {
            walletBtn.classList.add('onboarding-wallet-highlight');
          }
          walletBtn.style.pointerEvents = 'auto';
        }
        setSpotlightRect(null);
        spotlightEl = null;
      } else if (step === 'focus_payment_methods') {
        const section = document.querySelector('.onboarding-payment-methods');
        const nodes = paymentMethodsSpotlightNodes(section);
        updateSpotlight(nodes.length ? nodes : section, 10);
        spotlightEl = null;
      } else if (step === 'focus_amount_selection') {
        const section = document.querySelector('.onboarding-amount-selection');
        const nodes = amountSelectionSpotlightNodes(section);
        updateSpotlight(nodes.length ? nodes : section, 8);
        spotlightEl = null;
      } else if (step === 'focus_deposit_submit') {
        setIsBoxAtTop(!isMobile);
        const submitBtn = document.querySelector('.onboarding-deposit-btn-final');
        if (submitBtn) {
          if (!submitBtn.classList.contains('onboarding-highlight')) {
            submitBtn.classList.add('onboarding-highlight');
          }
          submitBtn.style.pointerEvents = 'auto';
          updateSpotlight(submitBtn, 14);
        } else {
          setSpotlightRect(null);
        }
        spotlightEl = null;
      } else {
        spotlightEl = document.querySelector('.onboarding-highlight');
      }

      if (spotlightEl !== null) updateSpotlight(spotlightEl);
    };

    applyHighlights();
    const interval = setInterval(applyHighlights, 500);
    const onChimeNameInput = () => applyHighlights();
    const onLayoutChange = () => applyHighlights();
    const onDepositPaymentLayout = () => {
      if (step !== 'focus_payment_methods') return;
      scrollPaymentMethodsIntoView();
      requestAnimationFrame(() => {
        requestAnimationFrame(applyHighlights);
      });
    };
    window.addEventListener('onboarding:chime-name-input', onChimeNameInput);
    window.addEventListener('onboarding:deposit-payment-focused', onDepositPaymentLayout);
    window.addEventListener('scroll', onLayoutChange, true);
    window.addEventListener('resize', onLayoutChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener('onboarding:chime-name-input', onChimeNameInput);
      window.removeEventListener('onboarding:deposit-payment-focused', onDepositPaymentLayout);
      window.removeEventListener('scroll', onLayoutChange, true);
      window.removeEventListener('resize', onLayoutChange);
      clearHighlights();
      setSpotlightRect(null);
    };
  }, [step, userType, isVisible, isMobile, clearHighlights]);

  const amountGuideMobileDock = step === 'focus_amount_selection' && isMobile;
  const paymentGuideMobileDock = step === 'focus_payment_methods' && isMobile;
  const depositSubmitGuideMobileDock = step === 'focus_deposit_submit' && isMobile;
  const walletGuideMobileDock = step === 'focus_wallet_icon' && isMobile;
  // Package grid is the focus — dock guide below it so cards stay readable (not pinned under the nav).
  const packageGuideBottomDock = step === 'focus_package_selection';
  const isDepositScrollStep = DEPOSIT_ONBOARDING_SCROLL_STEPS.has(step);
  const isGamesScrollStep = GAMES_ONBOARDING_SCROLL_STEPS.has(step);
  const depositBottomDock =
    packageGuideBottomDock ||
    amountGuideMobileDock ||
    paymentGuideMobileDock ||
    depositSubmitGuideMobileDock ||
    walletGuideMobileDock;
  const depositGuideAtTop =
    step === 'focus_deposit_flow' ||
    step === 'focus_view_packages' ||
    (step === 'focus_payment_methods' && !isMobile) ||
    (step === 'focus_deposit_submit' && !isMobile);

  useEffect(() => {
    if (step === 'focus_topup' || depositBottomDock) {
      setIsBoxAtTop(false);
    } else if (depositGuideAtTop) setIsBoxAtTop(true);
  }, [step, depositGuideAtTop, depositBottomDock]);

  // Keep deposit panels centered in the visible band (re-run after guide dock lays out).
  useLayoutEffect(() => {
    if (!isVisible || step !== 'focus_game') return undefined;

    const scrollToTarget = () => {
      const { card } = findFocusGameTarget(userType);
      scrollFocusGameCardIntoView(card);
    };

    scrollToTarget();
    const raf = requestAnimationFrame(scrollToTarget);
    const t1 = window.setTimeout(scrollToTarget, 200);
    const t2 = window.setTimeout(scrollToTarget, 600);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step, isVisible, userType, isMobile]);

  useLayoutEffect(() => {
    if (!isVisible || step !== 'focus_package_selection') return undefined;

    scrollPackageSelectionIntoView();
    const raf = requestAnimationFrame(scrollPackageSelectionIntoView);
    const t1 = window.setTimeout(scrollPackageSelectionIntoView, 350);
    const t2 = window.setTimeout(scrollPackageSelectionIntoView, 750);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step, isVisible, isMobile]);

  useLayoutEffect(() => {
    if (!isVisible || step !== 'focus_payment_methods') return undefined;

    scrollPaymentMethodsIntoView();
    const raf = requestAnimationFrame(scrollPaymentMethodsIntoView);
    const t1 = window.setTimeout(scrollPaymentMethodsIntoView, 350);
    const t2 = window.setTimeout(scrollPaymentMethodsIntoView, 750);
    const t3 = window.setTimeout(scrollPaymentMethodsIntoView, 1200);
    const t4 = window.setTimeout(scrollPaymentMethodsIntoView, 1800);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [step, isVisible, paymentGuideMobileDock, isMobile]);

  // Wallet step: leave deposit page so the top navbar balance is the clear target.
  useEffect(() => {
    if (!isVisible || step !== 'focus_wallet_icon') return undefined;

    if (pathname !== '/') {
      navigate('/');
    }
    scrollWindowTo(0, 'auto');
    const t1 = window.setTimeout(() => scrollWindowTo(0, 'auto'), 150);
    const t2 = window.setTimeout(() => scrollWindowTo(0, 'auto'), 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step, isVisible, pathname, navigate]);

  useLayoutEffect(() => {
    if (!isVisible || step !== 'focus_wallet_icon') return undefined;

    const sync = () => {
      scrollWindowTo(0, 'auto');
      const walletBtn = document.querySelector('.onboarding-navbar-wallet');
      if (walletBtn) {
        walletBtn.classList.add('onboarding-wallet-highlight');
        walletBtn.style.pointerEvents = 'auto';
      }
    };
    sync();
    const raf = requestAnimationFrame(sync);
    const t = window.setTimeout(sync, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [step, isVisible, walletGuideMobileDock, isMobile]);

  useEffect(() => {
    if (!isVisible) return undefined;

    const scrollPanel = () => {
      if (step === 'focus_package_selection') {
        scrollPackageSelectionIntoView();
      } else if (step === 'focus_amount_selection') {
        scrollAmountSelectionIntoView();
      } else if (step === 'focus_deposit_submit') {
        scrollDepositSubmitIntoView();
      }
    };

    if (step === 'focus_package_selection' || step === 'focus_amount_selection' || step === 'focus_deposit_submit') {
      scrollPanel();
      const t1 = window.setTimeout(scrollPanel, 200);
      const t2 = window.setTimeout(scrollPanel, 500);
      const t3 = window.setTimeout(scrollPanel, 1000);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        window.clearTimeout(t3);
      };
    }

    return undefined;
  }, [step, isVisible]);

  const handleNewUser = () => {
    try {
      if (user?.userId) localStorage.setItem(onboardingWelcomeSeenKey(user.userId), '1');
    } catch {
      /* ignore */
    }
    setUserType('new');
    setStep('focus_game');
    const gamesSection = document.getElementById('games');
    if (gamesSection) {
      gamesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleExistingUser = () => {
    try {
      if (user?.userId) localStorage.setItem(onboardingWelcomeSeenKey(user.userId), '1');
    } catch {
      /* ignore */
    }
    setUserType('existing');
    setStep('focus_game');
    const gamesSection = document.getElementById('games');
    if (gamesSection) {
      gamesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    const handleRegistered = () => setStep('focus_topup');
    const handleTopupOpen = (e) => {
      const balance = Number(e.detail?.balanceSc ?? 0);
      const next = balance > 0 ? 'focus_topup_amount' : 'focus_balance_modal';
      try {
        if (localStorage.getItem('onboarding_pending') === 'true') {
          localStorage.setItem('onboarding_step', next);
        }
      } catch {
        /* ignore */
      }
      setStep(next);
    };
    const handleTopupAmountEntered = () => setStep('focus_topup_submit');
    const handleTopupSuccess = () => setStep('focus_withdraw_btn');
    const handleWithdrawBalanceReady = (e) => {
      const redeemable = Number(e.detail?.redeemableBalance ?? 0);
      if (redeemable > 0) setStep('focus_withdraw_amount');
      else goToDepositTutorial();
    };
    const handleWithdrawAmountEntered = () => setStep('focus_withdraw_submit');
    const handleWithdrawSuccess = () => goToDepositTutorial();
    const handleGameTransferError = () => {
      setStep('focus_toast_error');
      if (depositRedirectRef.current) window.clearTimeout(depositRedirectRef.current);
      depositRedirectRef.current = window.setTimeout(() => {
        depositRedirectRef.current = null;
        goToDepositTutorial();
      }, 2500);
    };
    const handleNeedsBalance = () => goToDepositTutorial();
    const handleDepositRequiredModalOpened = () => setStep('focus_view_packages');
    const handleDepositRequiredModalClosed = () => {
      if (viewPackagesClickedRef.current) {
        viewPackagesClickedRef.current = false;
        return;
      }
      setStep((current) => (current === 'focus_view_packages' ? 'focus_deposit_flow' : current));
    };
    const handleViewPackagesClicked = () => {
      viewPackagesClickedRef.current = true;
      setStep((current) =>
        current === 'focus_view_packages' || current === 'focus_deposit_flow'
          ? 'focus_package_selection'
          : current
      );
    };
    const handleDepositPageEntered = (e) => {
      const usePackage = e.detail?.usePackageFlow === true;
      setStep((current) => {
        if (current === 'deposit_flow_prompt' || current === 'focus_toast_error') return current;
        if (
          current === 'focus_view_packages' ||
          current === 'focus_deposit_flow' ||
          current === 'focus_package_selection'
        ) {
          return usePackage ? 'focus_package_selection' : 'focus_payment_methods';
        }
        return usePackage ? 'focus_package_selection' : 'focus_payment_methods';
      });
    };
    const handlePackageSelected = () => setStep('focus_payment_methods');
    const handlePaymentSelected = (e) => {
      const usePackage = e.detail?.usePackageFlow === true;
      setStep(usePackage ? 'focus_deposit_submit' : 'focus_amount_selection');
    };
    const handleAmountSelected = () => setStep('focus_deposit_submit');
    const handlePaymentStarted = () => setStep('payment_waiting');
    const handlePaymentClosed = () => setStep('focus_wallet_icon');
    const handleWalletOpened = () => setStep('focus_sc_info');
    const handleLinkModalOpened = () => setStep('focus_link_username');
    const handleLinkUsernameReady = () => setStep('focus_link_submit');
    const handleFinished = () => finishTutorial();
    const handleChimeModalOpened = () => setStep('focus_chime_copy');
    const handleChimeCopyDone = () => setStep('focus_chime_form');

    window.addEventListener('onboarding:game-registered', handleRegistered);
    window.addEventListener('onboarding:topup-open', handleTopupOpen);
    window.addEventListener('onboarding:topup-amount-entered', handleTopupAmountEntered);
    window.addEventListener('onboarding:topup-success', handleTopupSuccess);
    window.addEventListener('onboarding:withdraw-balance-ready', handleWithdrawBalanceReady);
    window.addEventListener('onboarding:withdraw-amount-entered', handleWithdrawAmountEntered);
    window.addEventListener('onboarding:withdraw-success', handleWithdrawSuccess);
    window.addEventListener('onboarding:game-transfer-error', handleGameTransferError);
    window.addEventListener('onboarding:needs-balance', handleNeedsBalance);
    window.addEventListener('onboarding:deposit-required-modal-opened', handleDepositRequiredModalOpened);
    window.addEventListener('onboarding:deposit-required-modal-closed', handleDepositRequiredModalClosed);
    window.addEventListener('onboarding:view-packages-clicked', handleViewPackagesClicked);
    window.addEventListener('onboarding:deposit-page-entered', handleDepositPageEntered);
    window.addEventListener('onboarding:package-selected', handlePackageSelected);
    window.addEventListener('onboarding:payment-selected', handlePaymentSelected);
    window.addEventListener('onboarding:amount-selected', handleAmountSelected);
    window.addEventListener('onboarding:payment-started', handlePaymentStarted);
    window.addEventListener('onboarding:payment-modal-closed', handlePaymentClosed);
    window.addEventListener('onboarding:wallet-opened', handleWalletOpened);
    window.addEventListener('onboarding:link-modal-opened', handleLinkModalOpened);
    window.addEventListener('onboarding:link-username-ready', handleLinkUsernameReady);
    window.addEventListener('onboarding:finished', handleFinished);
    window.addEventListener('onboarding:chime-modal-opened', handleChimeModalOpened);
    window.addEventListener('onboarding:chime-copy-done', handleChimeCopyDone);

    return () => {
      window.removeEventListener('onboarding:game-registered', handleRegistered);
      window.removeEventListener('onboarding:topup-open', handleTopupOpen);
      window.removeEventListener('onboarding:topup-amount-entered', handleTopupAmountEntered);
      window.removeEventListener('onboarding:topup-success', handleTopupSuccess);
      window.removeEventListener('onboarding:withdraw-balance-ready', handleWithdrawBalanceReady);
      window.removeEventListener('onboarding:withdraw-amount-entered', handleWithdrawAmountEntered);
      window.removeEventListener('onboarding:withdraw-success', handleWithdrawSuccess);
      window.removeEventListener('onboarding:game-transfer-error', handleGameTransferError);
      window.removeEventListener('onboarding:needs-balance', handleNeedsBalance);
      window.removeEventListener('onboarding:deposit-required-modal-opened', handleDepositRequiredModalOpened);
      window.removeEventListener('onboarding:deposit-required-modal-closed', handleDepositRequiredModalClosed);
      window.removeEventListener('onboarding:view-packages-clicked', handleViewPackagesClicked);
      window.removeEventListener('onboarding:deposit-page-entered', handleDepositPageEntered);
      window.removeEventListener('onboarding:package-selected', handlePackageSelected);
      window.removeEventListener('onboarding:payment-selected', handlePaymentSelected);
      window.removeEventListener('onboarding:amount-selected', handleAmountSelected);
      window.removeEventListener('onboarding:payment-started', handlePaymentStarted);
      window.removeEventListener('onboarding:payment-modal-closed', handlePaymentClosed);
      window.removeEventListener('onboarding:wallet-opened', handleWalletOpened);
      window.removeEventListener('onboarding:link-modal-opened', handleLinkModalOpened);
      window.removeEventListener('onboarding:link-username-ready', handleLinkUsernameReady);
      window.removeEventListener('onboarding:finished', handleFinished);
      window.removeEventListener('onboarding:chime-modal-opened', handleChimeModalOpened);
      window.removeEventListener('onboarding:chime-copy-done', handleChimeCopyDone);
      if (depositRedirectRef.current) {
        window.clearTimeout(depositRedirectRef.current);
        depositRedirectRef.current = null;
      }
    };
  }, [finishTutorial, goToDepositTutorial, navigate]);

  // Deposit page sets the correct onboarding step via `onboarding:deposit-page-entered` once catalog loads.
  useEffect(() => {
    if (pathname !== '/deposit') return;
    try {
      if (localStorage.getItem('onboarding_pending') !== 'true') return;
    } catch {
      return;
    }
  }, [pathname, isVisible]);

  // Focus Chime modal controls when onboarding sub-step changes (modal listens and focuses copy / name field).
  useEffect(() => {
    if (!isVisible) return;
    if (step === 'focus_chime_copy') {
      window.dispatchEvent(new CustomEvent('onboarding:chime-focus-copy'));
    } else if (step === 'focus_chime_form') {
      window.dispatchEvent(new CustomEvent('onboarding:chime-focus-form'));
    }
  }, [step, isVisible]);

  if (!isVisible || step === 'none' || step === 'payment_waiting') return null;

  const getInstruction = () => {
    switch (step) {
      case 'focus_game': 
        return userType === 'existing' 
          ? 'Click on the login button to link your existing account' 
          : 'Click on the register button to create account in game';
      case 'focus_link_username': return 'Enter your game username here.';
      case 'focus_link_submit': return 'Great! Now click on "Connect Account" to finish.';
      case 'focus_topup': return 'Great! Now click Recharge to move SC from your wallet into the game.';
      case 'focus_balance_modal': return 'Check your wallet balance here. If it is 0.00 SC, you will need to get more SC.';
      case 'focus_topup_amount': return 'You have SC in your wallet! Enter how much SC you want to recharge this game with.';
      case 'focus_topup_submit': return 'Perfect! Click Recharge to move SC from your wallet into the game.';
      case 'focus_withdraw_btn': return 'Nice! Now click Redeem to move SC back from the game to your wallet.';
      case 'focus_withdraw_amount': return 'Enter how much SC you want to redeem from this game.';
      case 'focus_withdraw_submit': return 'Click Redeem to move SC back to your wallet.';
      case 'focus_toast_error': return 'Something went wrong. Next we can walk you through buying more SC.';
      case 'focus_deposit_flow': return isMobile 
        ? 'You need SC to play! Click on the "Buy SC" button in the bottom menu' 
        : 'You need SC to play! Click on the "Deposit" icon in the navigation bar';
      case 'focus_view_packages':
        return 'Tap View Packages on this popup to choose a coin package and continue your first purchase.';
      case 'focus_package_selection': return 'Choose a package to buy more SC.';
      case 'focus_payment_methods': return 'Select your preferred payment method to continue.';
      case 'focus_amount_selection': return 'Choose an amount or enter a custom one.';
      case 'focus_deposit_submit': return 'Ready! Click here to complete your deposit session.';
      case 'focus_chime_copy':
        return 'Tap copy to copy the pay-to account. Open the Chime app and send your deposit amount to that account.';
      case 'focus_chime_form':
        return 'Enter your Chime send-from name, then tap Submit request at the bottom of this popup.';
      case 'focus_wallet_icon':
        return isMobile
          ? 'Tap your SC balance at the top of the screen to view your wallet.'
          : 'Click your SC balance in the top navigation bar to view your wallet.';
      case 'focus_sc_info': return 'This is your Standard Sweepcoin (SC). You can use this coin to play games and recharge games.';
      case 'focus_rsc_info': return 'This is your Redeemable SC. This SC you can withdraw into your bank.';
      default: return '';
    }
  };


  const handleNext = (e) => {
    e.stopPropagation();
    if (step === 'focus_sc_info') setStep('focus_rsc_info');
    else if (step === 'focus_rsc_info') setStep('congratulations');
  };

  // Adjust instruction box position
  const isChimeOnboardingStep = step === 'focus_chime_copy' || step === 'focus_chime_form';
  const isViewPackagesStep = step === 'focus_view_packages';
  /** Mobile: Chime guide at top so it never covers Submit request. Desktop: side dock. */
  const chimeMobileTopDock = isChimeOnboardingStep && isMobile;
  const guideDesktopModalSideDock =
    !isMobile &&
    (isChimeOnboardingStep ||
      isViewPackagesStep ||
      TOPUP_MODAL_ONBOARDING_STEPS.has(step) ||
      WITHDRAW_MODAL_ONBOARDING_STEPS.has(step));
  const isInfoStep = (step === 'focus_sc_info' || step === 'focus_rsc_info');
  // Keep the dim overlay under the purchase modal (z 25000); only the guide sits above it.
  const tutorialLayerZ = isChimeOnboardingStep ? 'z-[10060]' : 'z-[9998]';
  const guideLayerZ = isViewPackagesStep
    ? 'z-[25010]'
    : isChimeOnboardingStep
      ? 'z-[10061]'
      : 'z-[10061]';
  const bottomGuideClass = 'bottom-6 sm:bottom-10';
  /** Deposit steps: guide at top so panels + bottom bar stay visible. */
  const guidePinnedTop =
    depositGuideAtTop ||
    (step !== 'focus_topup' &&
      step !== 'focus_package_selection' &&
      step !== 'focus_amount_selection' &&
      step !== 'focus_payment_methods' &&
      step !== 'focus_deposit_submit' &&
      step !== 'focus_wallet_icon' &&
      isBoxAtTop &&
      !isChimeOnboardingStep);

  const guidePanel = (
    <div
      className={`onb-guide ${
        chimeMobileTopDock
          ? 'onb-guide--chime-compact max-h-[min(34vh,220px)] overflow-y-auto'
          : guideDesktopModalSideDock
            ? 'max-h-[min(88vh,520px)] overflow-y-auto'
            : ''
      }`}
    >
      <div className="onb-guide-accent" aria-hidden />
      <div className="onb-guide-head">
        <p className="onb-guide-eyebrow">Onboarding Guide</p>
        <span className="onb-guide-pulse" aria-hidden />
      </div>
      <p className="onb-guide-text">{getInstruction()}</p>
      <div className="onb-guide-actions">
        {step === 'focus_chime_copy' && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('onboarding:chime-copy-done'))}
            className="onb-btn-next pointer-events-auto"
          >
            Next: enter your Chime name
          </button>
        )}
        {isInfoStep ? (
          <button type="button" onClick={handleNext} className="onb-btn-next pointer-events-auto">
            {step === 'focus_rsc_info' ? 'GOT IT!' : 'NEXT STEP'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => finishTutorial()}
            className="onb-btn-skip pointer-events-auto"
          >
            Skip Tutorial
          </button>
        )}
      </div>
    </div>
  );

  const overlay = (
    <div className="onb-portal-root">
      {/* Background & Backdrop Layer (Lower Stack) */}
      <div className="fixed inset-0 z-[100] pointer-events-none">
        {spotlightRect && !isInfoStep ? (
          <div
            className="onb-spotlight"
            style={{
              top: spotlightRect.top,
              left: spotlightRect.left,
              width: spotlightRect.width,
              height: spotlightRect.height,
              borderRadius: spotlightRect.radius,
            }}
            aria-hidden
          />
        ) : isDepositScrollStep || isGamesScrollStep ? (
          <div className="absolute inset-0 z-[101] onb-backdrop-overlay pointer-events-none" aria-hidden />
        ) : (
          <div
            className={`absolute inset-0 z-[101] transition-colors duration-500 pointer-events-auto ${
              step === 'welcome'
                ? 'onb-backdrop-overlay onb-backdrop-overlay--welcome'
                : step === 'tutorial_prompt' || step === 'deposit_flow_prompt'
                  ? 'onb-backdrop-overlay onb-backdrop-overlay--deposit-prompt'
                : step === 'congratulations'
                  ? 'onb-backdrop-overlay onb-backdrop-overlay--congrats'
                  : isInfoStep
                    ? 'bg-transparent'
                    : 'onb-backdrop-overlay'
            }`}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        )}
      </div>

      {/* Interface Layer (Highest Stack) */}
      <div className={`fixed inset-0 ${tutorialLayerZ} pointer-events-none`}>
        {step === 'congratulations' && (
          <div className="onb-congrats-scene fixed inset-0 z-[10070] flex items-center justify-center p-4 pointer-events-auto">
            <div className="onb-congrats-particles" aria-hidden>
              <span className="onb-congrats-particle onb-congrats-particle--1" />
              <span className="onb-congrats-particle onb-congrats-particle--2" />
              <span className="onb-congrats-particle onb-congrats-particle--3" />
              <span className="onb-congrats-particle onb-congrats-particle--4" />
              <span className="onb-congrats-particle onb-congrats-particle--5" />
              <span className="onb-congrats-particle onb-congrats-particle--6" />
            </div>
            <div
              className="onb-modal onb-modal--congrats onb-congrats-enter w-full max-w-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="onb-congrats-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="onb-glow-ring onb-glow-ring--congrats" aria-hidden />
              <div className="onb-congrats-shine" aria-hidden />
              <div className="onb-sparkles onb-sparkles--congrats" aria-hidden>
                <span className="onb-spark onb-spark-1">✦</span>
                <span className="onb-spark onb-spark-2">★</span>
                <span className="onb-spark onb-spark-3">✦</span>
                <span className="onb-spark onb-spark-4">◆</span>
                <span className="onb-spark onb-spark-5">★</span>
              </div>
              <div className="onb-inner onb-inner--congrats">
                <div className="onb-icon-wrap onb-congrats-stagger onb-congrats-stagger-1" aria-hidden>
                  <span className="onb-icon-glow onb-icon-glow--congrats" />
                  <span className="onb-icon onb-icon--congrats">🎉</span>
                </div>
                <h2 id="onb-congrats-title" className="onb-title onb-title--congrats onb-congrats-stagger onb-congrats-stagger-2">
                  Congratulations!
                </h2>
                <p className="onb-desc onb-congrats-stagger onb-congrats-stagger-3">
                  You&apos;re all set on {site.platformName}. Play games, deposit funds, and start winning.
                </p>
                <div className="onb-congrats-chips onb-congrats-stagger onb-congrats-stagger-4" aria-hidden>
                  <span className="onb-congrats-chip">🎮 Games</span>
                  <span className="onb-congrats-chip">💰 Deposit</span>
                  <span className="onb-congrats-chip">⭐ Wins</span>
                </div>
                <button
                  type="button"
                  onClick={() => finishTutorial(true)}
                  className="onb-btn-primary onb-btn-primary--congrats onb-congrats-stagger onb-congrats-stagger-5 pointer-events-auto"
                >
                  <span className="onb-congrats-btn-shine" aria-hidden />
                  Let&apos;s go
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'tutorial_prompt' && (
          <div className="onb-deposit-prompt-scene fixed inset-0 z-[10070] flex items-center justify-center p-4 pointer-events-auto">
            <div
              className="onb-modal onb-modal--deposit-prompt onb-deposit-prompt-enter w-full max-w-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="onb-tutorial-prompt-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="onb-inner onb-inner--deposit-prompt">
                <div className="onb-deposit-prompt-icon" aria-hidden>
                  🧭
                </div>
                <h2 id="onb-tutorial-prompt-title" className="onb-title onb-title--deposit-prompt">
                  Take a quick tour?
                </h2>
                <p className="onb-desc onb-desc--deposit-prompt">
                  We can walk you through linking games, moving SC, and using your wallet. It only takes a couple of minutes.
                </p>
                <div className="onb-path-grid onb-path-grid--deposit-prompt">
                  <button type="button" onClick={handleTutorialYes} className="onb-path-card onb-path-card--new">
                    <span className="onb-path-icon" aria-hidden>✓</span>
                    <span className="onb-path-label">Yes, start tutorial</span>
                    <span className="onb-path-hint">Guided walkthrough</span>
                  </button>
                  <button type="button" onClick={handleTutorialNo} className="onb-path-card onb-path-card--existing">
                    <span className="onb-path-icon" aria-hidden>→</span>
                    <span className="onb-path-label">No thanks</span>
                    <span className="onb-path-hint">Explore on my own</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'deposit_flow_prompt' && (
          <div className="onb-deposit-prompt-scene fixed inset-0 z-[10070] flex items-center justify-center p-4 pointer-events-auto">
            <div
              className="onb-modal onb-modal--deposit-prompt onb-deposit-prompt-enter w-full max-w-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="onb-deposit-prompt-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="onb-inner onb-inner--deposit-prompt">
                <div className="onb-deposit-prompt-icon" aria-hidden>
                  💰
                </div>
                <h2 id="onb-deposit-prompt-title" className="onb-title onb-title--deposit-prompt">
                  Buy more SC?
                </h2>
                <p className="onb-desc onb-desc--deposit-prompt">
                  Would you like a quick walkthrough of how to buy SC and add funds to your wallet?
                </p>
                <div className="onb-path-grid onb-path-grid--deposit-prompt">
                  <button type="button" onClick={handleDepositPromptYes} className="onb-path-card onb-path-card--new">
                    <span className="onb-path-icon" aria-hidden>✓</span>
                    <span className="onb-path-label">Yes, show me</span>
                    <span className="onb-path-hint">Buy SC walkthrough</span>
                  </button>
                  <button type="button" onClick={skipToCompletionFlow} className="onb-path-card onb-path-card--existing">
                    <span className="onb-path-icon" aria-hidden>→</span>
                    <span className="onb-path-label">No thanks</span>
                    <span className="onb-path-hint">Finish tutorial</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'welcome' && (
          <div className="onb-welcome-scene fixed inset-0 z-[10070] flex items-center justify-center p-4 pointer-events-auto">
            <div className="onb-welcome-particles" aria-hidden>
              <span className="onb-welcome-particle onb-welcome-particle--1" />
              <span className="onb-welcome-particle onb-welcome-particle--2" />
              <span className="onb-welcome-particle onb-welcome-particle--3" />
              <span className="onb-welcome-particle onb-welcome-particle--4" />
              <span className="onb-welcome-particle onb-welcome-particle--5" />
            </div>
            <div
              className="onb-modal onb-modal--welcome onb-welcome-enter w-full max-w-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="onb-welcome-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="onb-glow-ring onb-glow-ring--welcome" aria-hidden />
              <div className="onb-welcome-shine" aria-hidden />
              <div className="onb-sparkles onb-sparkles--welcome" aria-hidden>
                <span className="onb-spark onb-spark-1">✦</span>
                <span className="onb-spark onb-spark-2">★</span>
                <span className="onb-spark onb-spark-3">✦</span>
                <span className="onb-spark onb-spark-4">◆</span>
                <span className="onb-spark onb-spark-5">★</span>
              </div>
              <div className="onb-inner onb-inner--welcome">
                <div className="onb-icon-wrap onb-welcome-stagger onb-welcome-stagger-1" aria-hidden>
                  <span className="onb-icon-glow onb-icon-glow--welcome" />
                  <span className="onb-icon onb-icon--welcome">🎮</span>
                </div>
                <h2 id="onb-welcome-title" className="onb-title onb-title--welcome onb-welcome-stagger onb-welcome-stagger-2">
                  Welcome to {site.platformName}!
                </h2>
                <p className="onb-desc onb-welcome-stagger onb-welcome-stagger-3">
                  Pick your path and unlock the full experience — games, deposits, and wins await.
                </p>
                <p className="onb-question onb-welcome-stagger onb-welcome-stagger-4">Choose your player type</p>
                <div className="onb-path-grid onb-welcome-stagger onb-welcome-stagger-5">
                  <button type="button" onClick={handleNewUser} className="onb-path-card onb-path-card--new">
                    <span className="onb-path-icon" aria-hidden>🆕</span>
                    <span className="onb-path-label">New Player</span>
                    <span className="onb-path-hint">Create a game account</span>
                  </button>
                  <button type="button" onClick={handleExistingUser} className="onb-path-card onb-path-card--existing">
                    <span className="onb-path-icon" aria-hidden>🔗</span>
                    <span className="onb-path-label">Existing</span>
                    <span className="onb-path-hint">Link your game login</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step !== 'tutorial_prompt' &&
          step !== 'welcome' &&
          step !== 'deposit_flow_prompt' &&
          step !== 'congratulations' &&
          step !== 'none' &&
          step !== 'payment_waiting' &&
          step !== 'focus_chime_copy' &&
          step !== 'focus_chime_form' && (
            <div
              className={
                chimeMobileTopDock
                  ? `fixed left-1/2 -translate-x-1/2 top-[max(0.65rem,env(safe-area-inset-top))] ${guideLayerZ} w-full max-w-[min(100vw-1.5rem,360px)] sm:max-w-xs px-3 transition-all duration-300 pointer-events-auto animate-in slide-in-from-top`
                  : depositBottomDock
                  ? `onb-guide-dock-amount onb-guide-dock-default fixed left-1/2 -translate-x-1/2 ${guideLayerZ} w-full max-w-[min(100vw-1.5rem,360px)] sm:max-w-xs px-3 transition-all duration-300 pointer-events-auto animate-in slide-in-from-bottom`
                  : guideDesktopModalSideDock
                  ? `fixed right-2 sm:right-4 md:right-6 top-1/2 -translate-y-1/2 left-auto ${guideLayerZ} w-[min(18.5rem,calc(100vw-1.25rem))] max-w-sm transition-all duration-300 pointer-events-auto animate-in slide-in-from-right`
                  : `onb-guide-dock-default fixed left-1/2 -translate-x-1/2 w-full max-w-[min(100vw-1.5rem,360px)] sm:max-w-xs px-3 transition-all duration-300 pointer-events-auto ${guideLayerZ} ${
                      guidePinnedTop ? 'top-10 bottom-auto' : bottomGuideClass
                    } ${guidePinnedTop ? 'animate-in slide-in-from-top' : 'animate-in slide-in-from-bottom'}`
              }
            >
              {guidePanel}
            </div>
          )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
}
