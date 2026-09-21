import { createContext, useCallback, useContext, useState } from 'react';
import { CoinSelectorModal } from '../components/Games/CoinSelectorModal';
import { shouldPromptPlayCoin } from '../config/gcCoins';
import { useCoinType } from './CoinContext';

const CoinLaunchContext = createContext(null);

export function CoinLaunchProvider({ children }) {
  const { setCoinType } = useCoinType();
  const [pending, setPending] = useState(null);

  const requestPlayCoin = useCallback((game, provider) => {
    if (!shouldPromptPlayCoin(provider || game?.provider)) {
      return Promise.resolve('SC');
    }
    return new Promise((resolve, reject) => {
      setPending({ game, resolve, reject });
    });
  }, []);

  const closePending = useCallback(() => {
    if (pending?.reject) pending.reject(new Error('cancelled'));
    setPending(null);
  }, [pending]);

  const confirmPending = useCallback((mode) => {
    const coin = mode === 'gc' ? 'GC' : 'SC';
    setCoinType(coin);
    pending?.resolve?.(coin);
    setPending(null);
  }, [pending, setCoinType]);

  return (
    <CoinLaunchContext.Provider value={{ requestPlayCoin }}>
      {children}
      {pending ? (
        <CoinSelectorModal
          game={pending.game}
          onClose={closePending}
          onLaunch={confirmPending}
        />
      ) : null}
    </CoinLaunchContext.Provider>
  );
}

export function useCoinLaunch() {
  const ctx = useContext(CoinLaunchContext);
  if (!ctx) {
    return {
      requestPlayCoin: async () => 'SC',
    };
  }
  return ctx;
}
