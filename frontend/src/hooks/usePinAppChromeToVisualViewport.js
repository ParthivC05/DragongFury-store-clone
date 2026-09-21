import { useEffect } from 'react';

function syncAppViewportChrome() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) {
    root.style.setProperty('--app-vv-top', '0px');
    root.style.setProperty('--app-vv-bottom', '0px');
    return;
  }
  const top = Math.max(0, vv.offsetTop || 0);
  const bottom = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
  root.style.setProperty('--app-vv-top', `${top}px`);
  root.style.setProperty('--app-vv-bottom', `${bottom}px`);
}

/** Pin fixed navbar/footer to the visible viewport (iOS Chrome URL bar). */
export function usePinAppChromeToVisualViewport() {
  useEffect(() => {
    syncAppViewportChrome();
    const vv = window.visualViewport;
    window.addEventListener('resize', syncAppViewportChrome);
    window.addEventListener('orientationchange', syncAppViewportChrome);
    vv?.addEventListener('resize', syncAppViewportChrome);
    vv?.addEventListener('scroll', syncAppViewportChrome);
    return () => {
      window.removeEventListener('resize', syncAppViewportChrome);
      window.removeEventListener('orientationchange', syncAppViewportChrome);
      vv?.removeEventListener('resize', syncAppViewportChrome);
      vv?.removeEventListener('scroll', syncAppViewportChrome);
    };
  }, []);
}
