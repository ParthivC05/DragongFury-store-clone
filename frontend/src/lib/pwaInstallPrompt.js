/**
 * Capture Chrome's beforeinstallprompt early — it fires once and is easy to miss
 * if listeners are only attached after the Install page mounts.
 */

const EVENT_INSTALLABLE = 'pj:installable';
const EVENT_INSTALLED = 'pj:installed';

export function getDeferredInstallPrompt() {
  if (typeof window === 'undefined') return null;
  return window.__pjPrompt ?? null;
}

export function clearDeferredInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.__pjPrompt = null;
}

export function registerPwaInstallPromptCapture() {
  if (typeof window === 'undefined') return;

  if (window.__pjPromptCaptureRegistered) return;
  window.__pjPromptCaptureRegistered = true;
  window.__pjPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Do not preventDefault — that hides Chrome's native install UI.
    window.__pjPrompt = e;
    document.dispatchEvent(new CustomEvent(EVENT_INSTALLABLE));
  });

  window.addEventListener('appinstalled', () => {
    window.__pjPrompt = null;
    document.dispatchEvent(new CustomEvent(EVENT_INSTALLED));
  });
}

/** iOS: native share sheet (Add to Home Screen is in that sheet). Android: Chrome install prompt if captured. */
export async function openNativeInstall() {
  if (typeof window === 'undefined') return false;

  const promptEvent = getDeferredInstallPrompt();
  if (promptEvent && typeof promptEvent.prompt === 'function') {
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      clearDeferredInstallPrompt();
      return choice?.outcome === 'accepted';
    } catch {
      /* Chrome may require preventDefault to keep prompt(); native install UI still works */
    }
  }

  const ua = navigator.userAgent || '';
  const isiOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isiOS && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: document.title || 'Dragon Fury',
        url: window.location.href
      });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export { EVENT_INSTALLABLE, EVENT_INSTALLED };
