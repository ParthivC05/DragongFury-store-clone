import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as vipApi from '../api/vip';
import { useAuth } from './AuthContext';

const VipStatusContext = createContext(null);

export function VipStatusProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshVipStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await vipApi.getVipStatus();
      setStatus(data);
      return data;
    } catch {
      setStatus(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshVipStatus();
    } else {
      setStatus(null);
    }
  }, [isAuthenticated, refreshVipStatus]);

  useEffect(() => {
    const onRefresh = () => refreshVipStatus();
    window.addEventListener('vip:refresh', onRefresh);
    return () => window.removeEventListener('vip:refresh', onRefresh);
  }, [refreshVipStatus]);

  const value = {
    vipStatus: status,
    vipLoading: loading,
    refreshVipStatus
  };

  return (
    <VipStatusContext.Provider value={value}>
      {children}
    </VipStatusContext.Provider>
  );
}

export function useVipStatus() {
  const ctx = useContext(VipStatusContext);
  return ctx || { vipStatus: null, vipLoading: false, refreshVipStatus: () => {} };
}
