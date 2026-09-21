/**
 * Register the root service worker immediately so:
 * - Chrome Android can offer native Install
 * - iOS Home Screen web apps can request notification permission
 * Same SW is reused for Firebase Cloud Messaging.
 */
export function registerPwaServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }).catch(() => {
      /* ignore — install menu may still work with manifest alone on some browsers */
    });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
