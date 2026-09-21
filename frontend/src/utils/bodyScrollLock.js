/**
 * Shared, reference-counted body scroll lock.
 *
 * Every modal/overlay that needs to freeze page scrolling should call
 * `lockBodyScroll()` and invoke the returned release function on cleanup.
 *
 * Why ref-counting: the previous approach had each modal independently save
 * `document.body.style.overflow`, set it to `'hidden'`, and restore its own
 * saved value on close. When two modals overlapped, the second captured the
 * first's `'hidden'` as its "previous" value and restored `'hidden'` on close,
 * leaving the whole page permanently unscrollable. Here the body styles are
 * captured only when the lock count goes 0 -> 1 and restored only when it goes
 * back to 0, so overlapping locks can never stomp each other.
 */

let lockCount = 0;
let saved = null;

function applyLock(options) {
  const body = document.body;
  const html = document.documentElement;

  saved = {
    lockHtml: Boolean(options.lockHtml),
    reserveScrollPosition: Boolean(options.reserveScrollPosition),
    bodyOverflow: body.style.overflow,
    htmlOverflow: html.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyWidth: body.style.width,
    scrollY: window.scrollY,
  };

  body.style.overflow = 'hidden';
  if (saved.lockHtml) html.style.overflow = 'hidden';
  if (saved.reserveScrollPosition) {
    body.style.position = 'fixed';
    body.style.top = `-${saved.scrollY}px`;
    body.style.width = '100%';
  }

  // Signal that a modal/overlay is open so global chrome (e.g. support chat)
  // can hide itself while any popup is visible. App-specific class name
  // avoids collisions with third-party libs that toggle a generic `modal-open`.
  body.classList.add('app-modal-open');
}

function restoreLock() {
  if (!saved) return;
  const body = document.body;
  const html = document.documentElement;

  body.style.overflow = saved.bodyOverflow;
  if (saved.lockHtml) html.style.overflow = saved.htmlOverflow;
  if (saved.reserveScrollPosition) {
    body.style.position = saved.bodyPosition;
    body.style.top = saved.bodyTop;
    body.style.width = saved.bodyWidth;
    window.scrollTo(0, saved.scrollY);
  }
  body.classList.remove('app-modal-open');
  saved = null;
}

/**
 * Lock body scrolling. Returns an idempotent release function.
 *
 * @param {Object} [options]
 * @param {boolean} [options.lockHtml] Also set `overflow: hidden` on <html>.
 * @param {boolean} [options.reserveScrollPosition] Pin the body with
 *   `position: fixed` and restore the scroll position on release (prevents the
 *   iOS background-scroll bleed used by full-screen payment/game overlays).
 * @returns {() => void} release function (safe to call multiple times).
 */
export function lockBodyScroll(options = {}) {
  if (typeof document === 'undefined') return () => {};

  lockCount += 1;
  if (lockCount === 1) {
    applyLock(options);
  }

  let released = false;
  return function releaseBodyScroll() {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      restoreLock();
    }
  };
}
