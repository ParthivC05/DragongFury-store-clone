import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import * as spinwheelApi from '../api/spinwheel';

const SpinWheelStatusContext = createContext(null);

export function SpinWheelStatusProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [canSpin, setCanSpin] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setCanSpin(false);
      return;
    }
    setLoading(true);
    try {
      const data = await spinwheelApi.getSpinWheelStatus();
      setCanSpin(data?.can_spin === true);
    } catch {
      setCanSpin(false);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onRefresh = () => {
      refresh();
    };
    window.addEventListener('spinwheel:refresh', onRefresh);
    return () => window.removeEventListener('spinwheel:refresh', onRefresh);
  }, [refresh]);

  return (
    <SpinWheelStatusContext.Provider value={{ canSpin, refreshSpinStatus: refresh, loading }}>
      {children}
    </SpinWheelStatusContext.Provider>
  );
}

export function useSpinWheelStatus() {
  const ctx = useContext(SpinWheelStatusContext);
  return ctx || { canSpin: false, refreshSpinStatus: () => {}, loading: false };
}
