/**
 * Run after `window` load, then idle. Keeps canvas/ticker rAF off the LCP/TBT window.
 */
export function scheduleAfterLoad(fn, idleTimeoutMs = 6000) {
  let cancelled = false;
  let idleId = 0;
  let timeoutId = 0;

  const run = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(
        () => {
          if (!cancelled) fn();
        },
        { timeout: idleTimeoutMs },
      );
      return;
    }
    timeoutId = window.setTimeout(() => {
      if (!cancelled) fn();
    }, idleTimeoutMs);
  };

  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener('load', run);
    if (idleId && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId);
    }
    if (timeoutId) window.clearTimeout(timeoutId);
  };
}
