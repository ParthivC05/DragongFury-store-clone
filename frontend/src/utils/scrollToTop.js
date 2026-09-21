/**
 * Reset window / document scroll to the top.
 * Instant (`behavior: 'auto'`) for reliable Safari / Chrome / Firefox behavior.
 * Optional delayed pass wins races against modal unlock restoring a prior Y.
 */
export function scrollToTop({ behavior = 'auto', defer = false } = {}) {
  if (typeof window === 'undefined') return;

  const go = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }
    const scroller = document.scrollingElement || document.documentElement;
    if (scroller) scroller.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  go();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(go);
  }
  if (defer) {
    window.setTimeout(go, 0);
  }
}

/** True while the deposit onboarding tutorial is controlling scroll position. */
export function isOnboardingScrollActive() {
  try {
    return localStorage.getItem('onboarding_pending') === 'true';
  } catch {
    return false;
  }
}
