import { useEffect, useRef, useState } from 'react';

/**
 * Mounts children after the main thread is idle (with a timeout).
 * Use for above-the-fold widgets that should not compete with LCP.
 */
export function DelayMount({
  children,
  timeoutMs = 2200,
  minHeight = 0,
  fallback = null,
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let idleId = 0;
    let timeoutId = 0;
    const reveal = () => setShow(true);

    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(reveal, { timeout: timeoutMs });
    } else {
      timeoutId = window.setTimeout(reveal, Math.min(timeoutMs, 1200));
    }

    return () => {
      if (idleId && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [timeoutMs]);

  if (show) return children;
  if (minHeight) {
    return (
      <div style={{ minHeight }} aria-hidden>
        {fallback}
      </div>
    );
  }
  return fallback;
}

/**
 * Defers mounting heavy below-the-fold UI until it is close to the viewport.
 * No time fallback — Lighthouse waits long enough that a 4s timer pulled
 * spin/footer CSS into the landing trace. Games still appear when you scroll
 * (rootMargin starts the load ~480px early).
 */
export function BelowFold({
  children,
  rootMargin = '480px 0px',
  minHeight = 120,
  fallback = null,
  force = false,
}) {
  const ref = useRef(null);
  const [show, setShow] = useState(force);

  useEffect(() => {
    if (force) {
      setShow(true);
      return undefined;
    }

    const el = ref.current;
    if (!el) return undefined;
    let cancelled = false;
    let io;

    const reveal = () => {
      if (!cancelled) setShow(true);
    };

    if (typeof IntersectionObserver === 'undefined') {
      reveal();
    } else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            reveal();
            io.disconnect();
          }
        },
        { rootMargin, threshold: 0.01 }
      );
      io.observe(el);
    }

    return () => {
      cancelled = true;
      io?.disconnect();
    };
  }, [force, rootMargin]);

  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? children : fallback}
    </div>
  );
}
