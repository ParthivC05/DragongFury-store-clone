/**
 * Site-wide pinch-zoom lock for Safari / iOS (and other touch browsers).
 * Complements viewport maximum-scale=1 + CSS touch-action: pan-x pan-y.
 * Safe to call multiple times — installs listeners once.
 */

let unlockZoom = null;

function installZoomLock() {
  const canTouch =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 ||
      window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  if (!canTouch) return () => {};

  const preventGesture = (event) => {
    event.preventDefault();
  };
  const preventMultiTouchZoom = (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  };

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
  document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false });

  return () => {
    document.removeEventListener('gesturestart', preventGesture);
    document.removeEventListener('gesturechange', preventGesture);
    document.removeEventListener('gestureend', preventGesture);
    document.removeEventListener('touchmove', preventMultiTouchZoom);
  };
}

/** Lock pinch / multi-touch zoom app-wide. Idempotent. */
export function lockPlayPageZoom() {
  if (!unlockZoom) {
    unlockZoom = installZoomLock();
  }
  return () => {};
}

/** Boot-time install (main.jsx). Same lock as lockPlayPageZoom. */
export function lockAppZoom() {
  return lockPlayPageZoom();
}
