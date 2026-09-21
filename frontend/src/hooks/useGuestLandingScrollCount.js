import { useEffect, useState } from 'react';

/** Discrete downward/any scroll gestures on the guest landing page. */
let sharedCount = 0;
const subscribers = new Set();
let listening = false;
let burstActive = false;
let idleTimer = 0;
let lastY = 0;

const MIN_DELTA_PX = 28;
const BURST_GAP_MS = 500;

export function isWelcomeLandingBlocked() {
  if (typeof document === 'undefined') return false;
  const { classList } = document.body;
  return classList.contains('welcome-modal-open') || classList.contains('welcome-modal-pending');
}

function notify() {
  subscribers.forEach((cb) => cb(sharedCount));
}

function onScroll() {
  if (isWelcomeLandingBlocked() || document.body.classList.contains('guest-spin-modal-open')) {
    lastY = window.scrollY;
    return;
  }

  const y = window.scrollY;
  const delta = Math.abs(y - lastY);
  lastY = y;
  if (delta < MIN_DELTA_PX) return;

  if (!burstActive) {
    burstActive = true;
    sharedCount += 1;
    notify();
  }

  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    burstActive = false;
  }, BURST_GAP_MS);
}

function startListening() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  lastY = window.scrollY;
  window.addEventListener('scroll', onScroll, { passive: true });
}

function stopListeningIfIdle() {
  if (subscribers.size > 0 || !listening) return;
  listening = false;
  window.removeEventListener('scroll', onScroll);
  window.clearTimeout(idleTimer);
  burstActive = false;
}

/**
 * Shared guest-landing scroll gesture count (1st scroll, 2nd, 3rd, …).
 * Multiple consumers share one window listener so counts stay in sync.
 */
export function useGuestLandingScrollCount(enabled) {
  const [count, setCount] = useState(() => sharedCount);

  useEffect(() => {
    if (!enabled) return undefined;

    startListening();
    const onUpdate = (n) => setCount(n);
    subscribers.add(onUpdate);
    setCount(sharedCount);

    return () => {
      subscribers.delete(onUpdate);
      stopListeningIfIdle();
    };
  }, [enabled]);

  return count;
}
