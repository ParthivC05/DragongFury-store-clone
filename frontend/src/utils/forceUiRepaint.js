/**
 * Force the browser to recomposite layers after a background tab resumes.
 * Chromium/WebKit can leave backdrop-filter / canvas / visibility-toggled
 * layers painted black until a layout+paint cycle runs while visible.
 */
export function forceUiRepaint() {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  // Read layout to flush pending style, then toggle a harmless compositing hint.
  void root.offsetHeight;
  root.classList.add('ui-force-repaint');
  void root.offsetHeight;
  requestAnimationFrame(() => {
    root.classList.remove('ui-force-repaint');
    window.dispatchEvent(new Event('resize'));
  });
}

/** Subscribe once: repaint whenever the tab becomes visible again. */
export function startTabResumeRepaint() {
  if (typeof document === 'undefined') return () => {};

  let scheduled = false;
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      forceUiRepaint();
    });
  };

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
  };
}
