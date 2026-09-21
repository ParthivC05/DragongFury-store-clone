import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as authApi from '../api/auth';
import * as phoneApi from '../api/phone';
import * as walletApi from '../api/wallet';
import { site, STORE_CODE } from '../config/site';
import { resetGoogleIdentitySession } from '../hooks/useGoogleIdentity';
import {
  connectRealtimeSocket,
  disconnectRealtimeSocket
} from '../services/realtimeSocket';

function normalizeStoreCode(s) {
  if (s == null || typeof s !== 'string') return '';
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Only users bound to this white-label store may use this app. */
function userBelongsToThisStore(user) {
  if (!user) return false;
  return normalizeStoreCode(user.storeCode) === normalizeStoreCode(STORE_CODE) && normalizeStoreCode(STORE_CODE) !== '';
}

const AuthContext = createContext(null);

/** Admin roles cannot use the user panel; they must use the admin site. */
const ADMIN_PANEL_ROLES = ['master_admin', 'distributor_admin', 'store_admin'];
function isAdminPanelUser(user) {
  return user && (ADMIN_PANEL_ROLES.includes(user.role) || user.isAdmin === true);
}

function applyBalancePayload(data, setters) {
  const pscU = data.usable_balance_psc != null ? Number(data.usable_balance_psc) : 0;
  const bscU = data.usable_balance_bsc != null ? Number(data.usable_balance_bsc) : 0;
  const scU =
    data.usable_balance_sc != null
      ? Number(data.usable_balance_sc)
      : data.balance_sc != null && data.frozen_balance_sc != null
        ? Math.max(0, Number(data.balance_sc) - Number(data.frozen_balance_sc))
        : data.balance_sc != null
          ? Number(data.balance_sc)
          : pscU + bscU;
  const rscU = data.usable_balance_rsc != null ? Number(data.usable_balance_rsc) : 0;
  const locked =
    data.locked_balance_sc != null
      ? Number(data.locked_balance_sc)
      : data.locked_balance_bsc != null
        ? Number(data.locked_balance_bsc)
        : 0;
  setters.setPscWalletUsable(pscU);
  setters.setBscWalletUsable(bscU);
  setters.setScWalletUsable(scU);
  setters.setRscWalletUsable(rscU);
  setters.setLockedBalanceSc(Math.max(0, locked));
  setters.setBalanceSc(scU + rscU);
  setters.setBalanceGc(
    data.usable_balance_gc != null
      ? Number(data.usable_balance_gc)
      : data.balance_gc != null
        ? Number(data.balance_gc)
        : 0
  );
}

/** Live wallet updates come from Socket.IO; HTTP is only for login / explicit refresh. */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  /** Sum of usable PSC+BSC + usable RSC (navbar pill). */
  const [balanceSc, setBalanceSc] = useState(null);
  const [pscWalletUsable, setPscWalletUsable] = useState(null);
  const [bscWalletUsable, setBscWalletUsable] = useState(null);
  const [scWalletUsable, setScWalletUsable] = useState(null);
  const [rscWalletUsable, setRscWalletUsable] = useState(null);
  const [lockedBalanceSc, setLockedBalanceSc] = useState(null);
  const [balanceGc, setBalanceGc] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const socketConnectedRef = useRef(false);

  const balanceSetters = {
    setPscWalletUsable,
    setBscWalletUsable,
    setScWalletUsable,
    setRscWalletUsable,
    setLockedBalanceSc,
    setBalanceSc,
    setBalanceGc
  };

  const clearBalances = useCallback(() => {
    setBalanceSc(null);
    setPscWalletUsable(null);
    setBscWalletUsable(null);
    setScWalletUsable(null);
    setRscWalletUsable(null);
    setLockedBalanceSc(null);
    setBalanceGc(null);
  }, []);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      clearBalances();
      setLoading(false);
      return;
    }
    try {
      const me = await authApi.getMe();
      if (isAdminPanelUser(me)) {
        authApi.clearToken();
        setUser(null);
        clearBalances();
        return;
      }
      if (!userBelongsToThisStore(me)) {
        authApi.clearToken();
        setUser(null);
        clearBalances();
        return;
      }
      if (me && me.onboardingCompleted === false) {
        const alreadyPending = localStorage.getItem('onboarding_pending') === 'true';
        localStorage.setItem('onboarding_pending', 'true');
        // Only kick off onboarding once — re-firing on every refreshUser causes UI loops.
        if (!alreadyPending) {
          window.dispatchEvent(new CustomEvent('onboarding:start'));
        }
      }
      // Don't let a stale /me overwrite a phone we just verified in this session.
      setUser((prev) => {
        if (prev?.isPhoneVerified === true && me && me.isPhoneVerified !== true) {
          return {
            ...me,
            phone: prev.phone || me.phone,
            isPhoneVerified: true,
            phoneVerificationRequired: false,
            phoneVerification: {
              ...(me.phoneVerification && typeof me.phoneVerification === 'object'
                ? me.phoneVerification
                : {}),
              required: me.phoneVerification?.required === true,
              verified: true,
              needsVerification: false,
              phone: prev.phone || me.phone || me.phoneVerification?.phone || null
            }
          };
        }
        return me;
      });
    } catch {
      authApi.clearToken();
      setUser(null);
      clearBalances();
    } finally {
      setLoading(false);
    }
  }, [clearBalances]);

  const loadBalance = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      clearBalances();
      return;
    }
    setBalanceLoading(true);
    try {
      const data = await walletApi.getBalance();
      applyBalancePayload(data, balanceSetters);
    } catch {
      clearBalances();
    } finally {
      setBalanceLoading(false);
    }
  }, [clearBalances]);

  /** Silent refresh (no loading state) for reconnect / visibility / rare fallback. */
  const refreshBalanceSilent = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const data = await walletApi.getBalance();
      applyBalancePayload(data, balanceSetters);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (user) {
      loadBalance();
    } else {
      clearBalances();
    }
  }, [user, loadBalance, clearBalances]);

  // When any API returns 401/403, token is cleared and this event is fired – clear state so UI updates everywhere
  useEffect(() => {
    const handleUnauthorized = () => {
      authApi.clearStorage();
      disconnectRealtimeSocket();
      socketConnectedRef.current = false;
      setUser(null);
      clearBalances();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [clearBalances]);

  // Global wallet refresh: any component can dispatch 'wallet:refresh' to update balance (e.g. after deposit completes in modal)
  useEffect(() => {
    const handleWalletRefresh = () => {
      loadBalance();
    };
    window.addEventListener('wallet:refresh', handleWalletRefresh);
    return () => window.removeEventListener('wallet:refresh', handleWalletRefresh);
  }, [loadBalance]);

  // Live balance via Socket.IO — pushed when wallet rows change (deposit/withdraw/admin/partner).
  useEffect(() => {
    if (!user) {
      disconnectRealtimeSocket();
      socketConnectedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let socket = null;

    const onBalance = (data) => {
      if (data && typeof data === 'object') {
        applyBalancePayload(data, balanceSetters);
      }
    };

    const onConnect = () => {
      socketConnectedRef.current = true;
      // One sync after reconnect so UI matches server if events were missed while offline.
      refreshBalanceSilent();
    };
    const onDisconnect = () => {
      socketConnectedRef.current = false;
    };

    // partner-platform loads socket.io async — connectRealtimeSocket() returns a Promise.
    connectRealtimeSocket().then((s) => {
      if (cancelled || !s) return;
      socket = s;
      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);
      socket.on('wallet:balance', onBalance);
      if (socket.connected) onConnect();
    });

    return () => {
      cancelled = true;
      if (!socket) return;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('wallet:balance', onBalance);
    };
  }, [user, refreshBalanceSilent]);

  // One balance sync when the user returns to the tab (event-driven, not a poll loop).
  useEffect(() => {
    if (!user) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshBalanceSilent();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user, refreshBalanceSilent]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    const u = res.user;
    const token = res.token;
    if (!token || !u) {
      const err = new Error('Login failed. Please try again.');
      throw err;
    }
    authApi.setToken(token);
    if (!userBelongsToThisStore(u)) {
      authApi.clearToken();
      const err = new Error(
        `This account is not registered on ${site.platformName}. Please sign in on your store’s website.`
      );
      err.code = 'WRONG_STORE';
      throw err;
    }
    setUser(u);
    await loadUser();
    return u;
  }, [loadUser]);

  const register = useCallback(async (data) => {
    const res = await authApi.signupDirect(data);
    if (res.status === 'PENDING_VERIFICATION') {
      return res;
    }
    if (res.token) {
      authApi.setToken(res.token);
      setUser(res.user);
      await loadUser();
    }
    return res;
  }, [loadUser]);

  const setUserAndToken = useCallback((user, token) => {
    if (token) authApi.setToken(token);
    setUser(user);
    loadUser();
  }, [loadUser]);

  /** Merge fields into the current user without a full reload (e.g. after phone OTP). */
  const patchUser = useCallback((partial) => {
    if (!partial || typeof partial !== 'object') return;
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const completePhoneLogin = useCallback(
    async ({ phone, code, phoneChallengeToken }) => {
      const res = await phoneApi.completePhoneLogin(phone, code, phoneChallengeToken);
      if (!res?.token || !res?.user) {
        const err = new Error('Could not complete sign-in.');
        throw err;
      }
      if (!userBelongsToThisStore(res.user)) {
        authApi.clearToken();
        const err = new Error(
          `This account is not registered on ${site.platformName}. Please sign in on your store’s website.`
        );
        err.code = 'WRONG_STORE';
        throw err;
      }
      setUser(res.user);
      await loadUser();
      return res;
    },
    [loadUser]
  );

  const logout = useCallback(() => {
    (async () => {
      try {
        const { unlinkStoredFcmToken } = await import('../lib/firebaseMessaging');
        const { getOrCreatePushDeviceId } = await import('../lib/pushDevice');
        const notificationsApi = await import('../api/notifications');
        await unlinkStoredFcmToken((token) =>
          notificationsApi.unlinkPushDevice({
            deviceId: getOrCreatePushDeviceId(),
            token
          })
        );
      } catch {
        /* best-effort */
      }
      resetGoogleIdentitySession();
      authApi.clearStorage();
      disconnectRealtimeSocket();
      socketConnectedRef.current = false;
      setUser(null);
      clearBalances();
    })();
  }, [clearBalances]);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    balanceSc,
    pscWalletUsable,
    bscWalletUsable,
    scWalletUsable,
    rscWalletUsable,
    lockedBalanceSc,
    balanceGc,
    balanceLoading,
    refreshUser: loadUser,
    refreshBalance: loadBalance,
    login,
    register,
    logout,
    setUserAndToken,
    patchUser,
    completePhoneLogin
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
