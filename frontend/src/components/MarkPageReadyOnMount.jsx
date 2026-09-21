import { useEffect } from 'react';

/** Marks page content ready once children mount (e.g. lazy Suspense resolved). */
export function MarkPageReadyOnMount({ onReady, children }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return children;
}
