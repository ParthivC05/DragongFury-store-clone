import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'welcome_bonus_modal_dismissed';
const OPEN_DELAY_MS = 1500;
const CONFIG_WAIT_MS = 8000;
export const WELCOME_MODAL_PENDING_CLASS = 'welcome-modal-pending';

function hasSeenWelcomeModal() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomeModalSeen() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

function shouldHoldGuestScroll({ guestReady, configReady, hasImage, open, configWaitExpired }) {
  if (!guestReady || hasSeenWelcomeModal() || configWaitExpired) return false;
  return open || !configReady || hasImage;
}

/**
 * Opens the guest welcome bonus image modal shortly after landing.
 * Waits for the bonus image to finish preloading so it appears all at once.
 * Dismissed state is stored in sessionStorage for the current browser session.
 */
export function useWelcomeBonusScrollModal({
  guestReady = false,
  configReady = false,
  hasImage = false,
  imageReady = true
}) {
  const [open, setOpen] = useState(false);
  const [configWaitExpired, setConfigWaitExpired] = useState(false);
  const eligibleAtRef = useRef(null);

  const onClose = useCallback(() => {
    setOpen(false);
    markWelcomeModalSeen();
  }, []);

  useEffect(() => {
    if (!guestReady) {
      eligibleAtRef.current = null;
      setConfigWaitExpired(false);
      return undefined;
    }
    if (eligibleAtRef.current == null) eligibleAtRef.current = Date.now();
    if (configReady) {
      setConfigWaitExpired(false);
      return undefined;
    }
    const id = window.setTimeout(() => setConfigWaitExpired(true), CONFIG_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [guestReady, configReady]);

  useLayoutEffect(() => {
    const hold = shouldHoldGuestScroll({
      guestReady,
      configReady,
      hasImage,
      open,
      configWaitExpired
    });
    if (!hold) {
      document.body.classList.remove(WELCOME_MODAL_PENDING_CLASS);
      return undefined;
    }
    document.body.classList.add(WELCOME_MODAL_PENDING_CLASS);
    return () => document.body.classList.remove(WELCOME_MODAL_PENDING_CLASS);
  }, [guestReady, configReady, hasImage, open, configWaitExpired]);

  useEffect(() => {
    if (!guestReady || hasSeenWelcomeModal() || open) return undefined;
    if (!hasImage || !imageReady) return undefined;
    if (eligibleAtRef.current == null) eligibleAtRef.current = Date.now();

    const wait = Math.max(0, OPEN_DELAY_MS - (Date.now() - eligibleAtRef.current));
    const id = window.setTimeout(() => {
      if (hasSeenWelcomeModal()) return;
      if (document.body.classList.contains('guest-spin-modal-open')) return;
      setOpen(true);
    }, wait);
    return () => window.clearTimeout(id);
  }, [guestReady, hasImage, imageReady, open]);

  return { open, onClose };
}
