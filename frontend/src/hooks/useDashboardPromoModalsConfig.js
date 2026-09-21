import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_DASHBOARD_PROMO_MODALS,
  getDashboardPromoModalsConfig,
  invalidateDashboardPromoModalsCache,
} from '../api/dashboardPromoModals';

export function useDashboardPromoModalsConfig({ enabled = true } = {}) {
  const [config, setConfig] = useState(DEFAULT_DASHBOARD_PROMO_MODALS);
  const [loading, setLoading] = useState(Boolean(enabled));

  const refresh = useCallback(async (force = false) => {
    if (!enabled) {
      invalidateDashboardPromoModalsCache();
      setConfig(DEFAULT_DASHBOARD_PROMO_MODALS);
      setLoading(false);
      return DEFAULT_DASHBOARD_PROMO_MODALS;
    }
    setLoading(true);
    try {
      const data = await getDashboardPromoModalsConfig({ force });
      setConfig(data);
      return data;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  return { config, loading, refresh };
}
