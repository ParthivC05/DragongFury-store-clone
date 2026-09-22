import { lazy, Suspense, useEffect, useState } from 'react';
import { checkGeoAccess, getGeoBlockCode, hideHtmlLcpSlideshow, isGeoBlockError } from '../api/geo';

const GeoBlocker = lazy(() =>
  import('./GeoBlocker').then((m) => ({ default: m.GeoBlocker }))
);

function GeoBlockFallback() {
  useEffect(() => {
    hideHtmlLcpSlideshow();
  }, []);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        minHeight: '100vh',
        background: '#04060a'
      }}
      aria-busy="true"
      aria-label="Checking region"
    />
  );
}

/**
 * App-wide geo gate. Paint the app immediately (LCP), then swap to the blocker
 * only on an explicit geo/VPN denial. Fail-open on network / infra errors.
 * GeoBlocker (and geo-blocker.webp) load only after a real block.
 */
export function GeoWrapper({ children }) {
  const [blocked, setBlocked] = useState(false);
  const [errorCode, setErrorCode] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        await checkGeoAccess();
      } catch (error) {
        if (cancelled) return;
        if (isGeoBlockError(error)) {
          hideHtmlLcpSlideshow();
          setBlocked(true);
          setErrorCode(getGeoBlockCode(error));
        } else {
          console.warn(
            '[GeoWrapper] geo check failed but was not a geo block; allowing access:',
            error?.message || error
          );
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (blocked) hideHtmlLcpSlideshow();
  }, [blocked]);

  if (blocked) {
    return (
      <Suspense fallback={<GeoBlockFallback />}>
        <GeoBlocker errorCode={errorCode} />
      </Suspense>
    );
  }

  return children;
}
