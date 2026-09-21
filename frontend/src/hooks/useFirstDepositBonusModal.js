import { useState, useEffect, useCallback } from 'react';
import * as transactionsApi from '../api/transactions';
import * as walletApi from '../api/wallet';

export const FIRST_DEPOSIT_MODAL_DELAY_MS = 30_000;
const STORAGE_PREFIX = 'first_deposit_bonus_modal_dismissed_';

export function getAuthUserId(user) {
  if (!user) return null;
  return user.userId ?? user.id ?? null;
}

export function firstDepositModalStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId}`;
}

export async function userHasCompletedDeposit() {
  try {
    const txRes = await transactionsApi.getTransactions({
      category: 'deposit',
      limit: 1,
      page: 1,
    });
    if ((txRes?.total ?? 0) > 0) return true;

    const depRes = await walletApi.getDeposits({ limit: 20 });
    const list = depRes?.deposits ?? [];
    return list.some((d) => String(d.status || '').toLowerCase() === 'completed');
  } catch {
    return false;
  }
}

/**
 * @deprecated Use useDashboardPromoModals for coordinated spin + first-deposit flow.
 */
export function useFirstDepositBonusModal({ isAuthenticated, authLoading, user }) {
  const [open, setOpen] = useState(false);
  const userId = getAuthUserId(user);

  const close = useCallback(() => {
    setOpen(false);
    if (userId != null) {
      localStorage.setItem(firstDepositModalStorageKey(userId), '1');
    }
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated || authLoading || userId == null) {
      setOpen(false);
      return undefined;
    }

    if (localStorage.getItem(firstDepositModalStorageKey(userId))) {
      return undefined;
    }

    let cancelled = false;
    let timerId;

    (async () => {
      const hasDeposit = await userHasCompletedDeposit();
      if (cancelled || hasDeposit) return;

      timerId = window.setTimeout(() => {
        if (!cancelled) setOpen(true);
      }, FIRST_DEPOSIT_MODAL_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timerId != null) window.clearTimeout(timerId);
    };
  }, [isAuthenticated, authLoading, userId]);

  useEffect(() => {
    if (!isAuthenticated || userId == null) return undefined;

    const recheck = async () => {
      const hasDeposit = await userHasCompletedDeposit();
      if (hasDeposit) {
        setOpen(false);
        localStorage.setItem(firstDepositModalStorageKey(userId), '1');
      }
    };

    window.addEventListener('wallet:refresh', recheck);
    return () => window.removeEventListener('wallet:refresh', recheck);
  }, [isAuthenticated, userId]);

  return { open, close };
}
