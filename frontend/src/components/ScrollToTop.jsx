import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { scrollToTop } from '../utils/scrollToTop';

/**
 * Scroll to top on pathname changes so each page opens from the top.
 * Skips when a hash is present so anchors (e.g. /#games, settings sections) still work.
 * useLayoutEffect avoids a one-frame flash of the previous scroll position.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash) return;
    scrollToTop();
  }, [pathname, hash]);

  return null;
}
