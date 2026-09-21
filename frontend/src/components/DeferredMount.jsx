import { useEffect, useRef, useState } from 'react';

/**
 * Mount children only when the placeholder nears the viewport (or after
 * `rootMargin` / idle fallback). Keeps below-fold JS + images off the LCP path.
 */
export function DeferredMount({
  children,
  rootMargin = '400px 0px',
  fallback = null,
  minHeight,
  className,
}) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return undefined;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setReady(true);
      return undefined;
    }

    let idleId = 0;
    let timeoutId = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin, threshold: 0.01 },
    );
    observer.observe(node);

    // Safety: still mount eventually so content is indexed / reachable without scroll.
    const armFallback = () => setReady(true);
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(armFallback, { timeout: 8000 });
    } else {
      timeoutId = window.setTimeout(armFallback, 6000);
    }

    return () => {
      observer.disconnect();
      if (idleId && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [ready, rootMargin]);

  if (ready) return children;

  return (
    <div
      ref={ref}
      className={className}
      style={minHeight ? { minHeight } : undefined}
      aria-hidden
    >
      {fallback}
    </div>
  );
}
