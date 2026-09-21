import { useEffect, useState } from 'react';

/**
 * Preloads the guest welcome bonus image so the modal can reveal it all at once.
 * Starts immediately so the timed landing modal is ready as soon as possible.
 */
export function useWelcomeBonusImagePreload(enabled, imageSrc) {
  const [ready, setReady] = useState(false);
  const src = typeof imageSrc === 'string' ? imageSrc.trim() : '';

  useEffect(() => {
    if (!enabled || !src) {
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';

    const finish = () => {
      if (!cancelled) setReady(true);
    };

    img.onload = finish;
    img.onerror = finish;
    img.src = src;

    if (img.complete) finish();

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [enabled, src]);

  return ready;
}
