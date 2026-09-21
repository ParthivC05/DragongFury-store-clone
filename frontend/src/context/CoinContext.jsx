import { createContext, useCallback, useContext, useState } from 'react';
import { persistCoinType, readStoredCoinType } from '../lib/coinType';

const CoinContext = createContext(null);

export function CoinProvider({ children }) {
  const [coinType, setCoinTypeState] = useState(() => readStoredCoinType());

  const setCoinType = useCallback((next) => {
    const saved = persistCoinType(next);
    setCoinTypeState(saved);
  }, []);

  return (
    <CoinContext.Provider value={{ coinType, setCoinType }}>
      {children}
    </CoinContext.Provider>
  );
}

export function useCoinType() {
  const ctx = useContext(CoinContext);
  if (!ctx) {
    return {
      coinType: 'SC',
      setCoinType: () => {},
    };
  }
  return ctx;
}
