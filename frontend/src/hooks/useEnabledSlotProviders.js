import { useEffect, useState } from 'react';
import {
  DEFAULT_SLOT_PROVIDERS,
  getSlotProvidersConfig,
  normalizeSlotProviders,
} from '../api/slotProviders';

let cachedProviders = null;
let pendingPromise = null;

export async function fetchEnabledSlotProviders() {
  if (pendingPromise) return pendingPromise;
  pendingPromise = getSlotProvidersConfig()
    .then((providers) => {
      cachedProviders = normalizeSlotProviders(providers);
      return cachedProviders;
    })
    .finally(() => {
      pendingPromise = null;
    });
  return pendingPromise;
}

export function hasVisibleSlotProviders(flags = DEFAULT_SLOT_PROVIDERS) {
  const providers = normalizeSlotProviders(flags);
  return Boolean(providers.gitslotpark || providers.onegamehub || providers.bona || providers.scorpio);
}

export function useEnabledSlotProviders({ enabled = true } = {}) {
  const [providers, setProviders] = useState(cachedProviders || DEFAULT_SLOT_PROVIDERS);
  const [loaded, setLoaded] = useState(() => Boolean(cachedProviders) || !enabled);

  useEffect(() => {
    if (!enabled) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    fetchEnabledSlotProviders()
      .then((next) => {
        if (cancelled) return;
        setProviders(next);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return {
    providers,
    loaded,
    hasSlotProviders: hasVisibleSlotProviders(providers),
  };
}
