import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useVipStatus } from '../context/VipStatusContext';
import { AccountIcon, ChevronDownIcon, BellIcon, SCCoinIcon, PlusIcon, LockIcon } from '../assets/icons';
import { isGcCoinsEnabled } from '../config/gcCoins';
import { HeaderCoinToggle } from './HeaderCoinToggle';
import { SiteLogo } from './SiteLogo';
import { getVipTierStyle } from '../utils/vipTierColors';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import { PhoneVerifyGateModal } from './Auth/PhoneVerifyGateModal';
import * as notificationsApi from '../api/notifications';
import { warmupDeposit } from '../utils/preloadDeposit';

const profileDropdownLinks = [
  { to: '/settings', label: 'Profile' },
  { to: '/account/transactions', label: 'Transactions' },
  { to: '/account/vip', label: 'VIP Rewards' },
  { to: '/account/affiliate', label: 'Refer & Earn' },
  { to: '/blog', label: 'Blog' },
  { to: '/help', label: 'Help Center' },
];

const AUTH_PATHS = ['/login', '/register', '/check-email', '/forgot-password', '/reset-password'];

/** Default avatar URL (DiceBear) with username as seed; used when user has no custom profile image. */
function getDefaultAvatarUrl(user) {
  const seed = encodeURIComponent(user?.username || user?.email || 'user');
  return `https://api.dicebear.com/9.x/dylan/png?seed=${seed}`;
}

function formatNotificationDate(createdAt) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  const now = new Date();
  const diffMs = now - d;
  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { dateStyle: 'short' });
}

function formatWalletAmount(n) {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function Navbar() {
  const { user, isAuthenticated, logout, balanceSc, balanceGc, pscWalletUsable, bscWalletUsable, rscWalletUsable, lockedBalanceSc, balanceLoading } = useAuth();
  const { vipStatus } = useVipStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const walletRef = useRef(null);
  const prevUnreadRef = useRef(0);
  const hasFetchedUnreadOnceRef = useRef(false);
  const notificationAudioRef = useRef(null);
  const notifOpenRef = useRef(false);
  const [scBreakdownOpen, setScBreakdownOpen] = useState(false);
  const [phoneUnlockOpen, setPhoneUnlockOpen] = useState(false);
  const lockedSc = Number(lockedBalanceSc) || 0;
  const unlockedTotal = Number(balanceSc) || 0;
  const showGc = isGcCoinsEnabled();
  const gcAmount = Number(balanceGc) || 0;
  const pillAmount = unlockedTotal > 0 ? unlockedTotal : lockedSc;
  const isAuthPage = AUTH_PATHS.includes(location.pathname);
  const isDashboardLayout =
    location.pathname === '/' ||
    location.pathname === '/link2play' ||
    location.pathname === '/bonus';
  const isGuestLanding = isDashboardLayout && !isAuthenticated;
  const registerPath = `/register${location.search || ''}`;
  const loginPath = `/login${location.search || ''}`;
  const playNotificationSound = useCallback(() => {
    try {
      if (!notificationAudioRef.current) {
        notificationAudioRef.current = new Audio('/notification.mp3');
      }
      const audio = notificationAudioRef.current;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch (_) {}
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationsApi.getUnreadCount();
      const count = res?.unread_count ?? 0;
      const hadPreviousFetch = hasFetchedUnreadOnceRef.current;
      if (count > prevUnreadRef.current) {
        window.dispatchEvent(new Event('wallet:refresh'));
        if (hadPreviousFetch) {
          playNotificationSound();
        }
      }
      hasFetchedUnreadOnceRef.current = true;
      prevUnreadRef.current = count;
      setUnreadCount(count);
    } catch (_) { }
  }, [isAuthenticated, playNotificationSound]);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationsApi.getNotifications({ limit: 20 });
      setNotifications(res?.notifications ?? []);
      await fetchUnreadCount();
    } catch (_) { }
  }, [isAuthenticated, fetchUnreadCount]);

  useEffect(() => {
    setProfileOpen(false);
    setNotifOpen(false);
    setScBreakdownOpen(false);
  }, [location.pathname]);

  // Fetch unread count once when navbar mounts (user is authenticated)
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    notifOpenRef.current = notifOpen;
  }, [notifOpen]);

  // Refresh unread count when user returns to tab (no time-based polling)
  useEffect(() => {
    if (!isAuthenticated) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
        if (notifOpen) fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAuthenticated, notifOpen, fetchUnreadCount, fetchNotifications]);

  useEffect(() => {
    function onRefresh() {
      fetchUnreadCount();
    }
    window.addEventListener('notifications:refresh', onRefresh);
    return () => window.removeEventListener('notifications:refresh', onRefresh);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!scBreakdownOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setScBreakdownOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scBreakdownOpen]);

  useEffect(() => {
    if (!scBreakdownOpen) return undefined;
    const releaseScrollLock = lockBodyScroll();
    return () => {
      releaseScrollLock();
    };
  }, [scBreakdownOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (notifOpen && isAuthenticated) {
      fetchNotifications();
    }
  }, [notifOpen, isAuthenticated, fetchNotifications]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/');
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllNotificationsRead();
      await fetchNotifications();
    } catch (_) { }
  };

  const handleNotificationClick = (n) => {
    setNotifOpen(false);
    const url = n.action_url;
    if (url) {
      if (url.startsWith('/')) {
        navigate(url);
      } else {
        window.location.href = url;
      }
    }
    if (!n.read_at && n.id) {
      notificationsApi.markNotificationRead(n.id).then(() => fetchUnreadCount()).catch(() => { });
    }
  };

  const walletSection = isAuthenticated ? (
    balanceLoading ? (
      <div className="my-1.5 flex items-center justify-center">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-gray-800/60 border border-gray-700/80">
          <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse" />
          <span className="text-gray-500 text-sm font-medium">…</span>
        </div>
      </div>
    ) : (
      <div className="dash-wallet-wrap my-1.5" ref={walletRef}>
        <div className={`dash-wallet-pill onboarding-navbar-wallet${showGc ? ' dash-wallet-pill--toggle' : ''}`}>
          {showGc ? (
            <HeaderCoinToggle
              onSelectedClick={() => {
                setScBreakdownOpen(true);
                if (localStorage.getItem('onboarding_pending') === 'true') {
                  window.dispatchEvent(new CustomEvent('onboarding:wallet-opened'));
                }
              }}
            />
          ) : (
          <button
            type="button"
            onClick={() => {
              setScBreakdownOpen((o) => !o);
              if (localStorage.getItem('onboarding_pending') === 'true') {
                window.dispatchEvent(new CustomEvent('onboarding:wallet-opened'));
              }
            }}
            className="dash-wallet-pill-balance min-w-0"
            title={lockedSc > 0 ? 'Locked bonus SC — verify phone to unlock' : 'View Purchased, Bonus, and Redeemable SC'}
            aria-expanded={scBreakdownOpen}
            aria-haspopup="dialog"
          >
            <span className="flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-800/90 flex items-center justify-center ring-1 ring-white/10">
              <SCCoinIcon className="w-full h-full" aria-hidden />
            </span>
            <span className="truncate">
              <span className="dash-wallet-amount">
                {balanceSc != null || lockedSc > 0 ? formatWalletAmount(pillAmount) : '0.00'}
              </span>
              <span className="dash-wallet-label ml-0.5"> SC</span>
            </span>
          </button>
          )}
          {lockedSc > 0 ? (
            <button
              type="button"
              className="dash-wallet-lock-badge"
              title="Verify phone to unlock bonus SC"
              aria-label="Verify phone to unlock bonus SC"
              onClick={(e) => {
                e.stopPropagation();
                setScBreakdownOpen(false);
                setPhoneUnlockOpen(true);
              }}
            >
              <LockIcon className="dash-wallet-lock-icon" />
            </button>
          ) : null}
          <span className="dash-wallet-pill-divider" aria-hidden />
          <Link
            to="/deposit"
            className="dash-wallet-add-btn onboarding-deposit-btn"
            title="Deposit funds"
            aria-label="Deposit funds"
            onClick={(e) => e.stopPropagation()}
            onPointerEnter={() => warmupDeposit()}
          >
            <PlusIcon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </Link>
        </div>
        {scBreakdownOpen &&
          createPortal(
            <div
              className="dash-wallet-breakdown-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="sc-breakdown-title"
              onClick={() => setScBreakdownOpen(false)}
            >
              <div className="dash-wallet-breakdown-card" onClick={(e) => e.stopPropagation()}>
                <h2 id="sc-breakdown-title" className="dash-wallet-breakdown-title">
                  Your balances
                </h2>
                {lockedSc > 0 ? (
                  <p className="dash-wallet-breakdown-desc">
                    Bonus SC is locked until you verify your mobile number.
                  </p>
                ) : null}
                <dl className="dash-wallet-breakdown-list">
                  {showGc ? (
                    <div className="dash-wallet-breakdown-row">
                      <dt>Gold Coins</dt>
                      <dd className="dash-wallet-breakdown-gc">
                        {Number(gcAmount).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </dd>
                    </div>
                  ) : null}
                  <div className="dash-wallet-breakdown-row onboarding-sc-info">
                    <dt>Purchased SC</dt>
                    <dd>
                      {(pscWalletUsable != null ? Number(pscWalletUsable) : 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </dd>
                  </div>
                  <div className={`dash-wallet-breakdown-row${lockedSc > 0 ? ' dash-wallet-breakdown-row--locked' : ''}`}>
                    <dt>Bonus SC</dt>
                    <dd>
                      {formatWalletAmount(lockedSc > 0 ? lockedSc : bscWalletUsable)}
                    </dd>
                    {lockedSc > 0 ? (
                      <span className="dash-wallet-breakdown-lock-overlay" aria-hidden>
                        <LockIcon className="dash-wallet-lock-icon" />
                      </span>
                    ) : null}
                  </div>
                  <div className="dash-wallet-breakdown-row onboarding-rsc-info">
                    <dt>Redeemable SC</dt>
                    <dd className="dash-wallet-breakdown-rsc">
                      {(rscWalletUsable != null ? Number(rscWalletUsable) : 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </dd>
                  </div>
                </dl>
                {lockedSc > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setScBreakdownOpen(false);
                        setPhoneUnlockOpen(true);
                      }}
                      className="dash-wallet-breakdown-unlock-btn"
                    >
                      Verify phone to unlock
                    </button>
                    <button
                      type="button"
                      onClick={() => setScBreakdownOpen(false)}
                      className="dash-wallet-breakdown-later"
                    >
                      Maybe later
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setScBreakdownOpen(false)}
                    className="dash-wallet-breakdown-close-btn"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>,
            document.body
          )}
      </div>
    )
  ) : null;

  return (
    <header className={`dash-nav onboarding-navbar${isGuestLanding ? ' dash-nav--guest-landing' : ''}`}>
      <div
        className={`dash-nav-inner ${isAuthenticated ? 'dash-nav-inner--auth' : 'dash-nav-inner--guest'} ${isDashboardLayout ? 'dash-nav-inner--wide' : ''}${isGuestLanding ? ' dash-nav-inner--guest-landing' : ''}`}
      >
        {isAuthenticated ? (
          <>
            <div className="dash-nav-start">
              <Link to="/" className="dash-logo min-w-0">
                <SiteLogo variant="nav" />
              </Link>
            </div>

            <div className="dash-nav-center">{walletSection}</div>

            <div className="dash-nav-end">
            {/* VIP tier progress from API – tier-colored */}
            <Link
              to="/account/vip"
              className="dash-vip-link group"
              title={`VIP: ${vipStatus?.level_name ?? '—'}${vipStatus?.next_level_xp != null && vipStatus?.next_level_xp > 0 ? ` (${Number(vipStatus.current_xp) || 0} / ${vipStatus.next_level_xp} XP)` : vipStatus?.is_max_level ? ' (max)' : ''}`}
            >
              {(() => {
                const tierName = vipStatus?.level_name ?? 'VIP';
                const currentLevel = vipStatus?.levels?.[vipStatus?.level_index ?? 0] ?? vipStatus?.levels?.find((l) => l.is_current);
                const tierStyle = getVipTierStyle(tierName, currentLevel?.color);
                const cur = Number(vipStatus?.current_xp) || 0;
                const next = Number(vipStatus?.next_level_xp) || 0;
                const maxTierFilled = vipStatus?.is_max_level === true && next > 0 && cur >= next;
                const widthPct = maxTierFilled ? 100 : (next > 0 ? Math.min(99.9, (100 * cur) / next) : 0);
                return (
                  <>
                    <span className="dash-vip-name group-hover:opacity-90 transition-opacity" style={{ color: tierStyle.color }}>
                      {tierName}
                    </span>
                    <div className="dash-vip-bar">
                      <div
                        className="dash-vip-fill"
                        style={{ width: `${widthPct}%`, backgroundColor: tierStyle.color }}
                        aria-hidden
                      />
                    </div>
                  </>
                );
              })()}
            </Link>
            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="dash-icon-btn relative"
                aria-expanded={notifOpen}
                aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                title="Notifications"
              >
                <BellIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="dash-dropdown dash-notif-panel">
                  <div className="dash-notif-header">
                    <span>Notifications</span>
                    {notifications.some((n) => !n.read_at) && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-xs text-[var(--dash-teal)] hover:underline bg-transparent border-0 cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500 text-center">No notifications yet.</p>
                    ) : (
                      <ul className="py-1">
                        {notifications.map((n) => (
                          <li key={n.id}>
                            <button
                              type="button"
                              onClick={() => handleNotificationClick(n)}
                              className={`w-full text-left px-4 py-3 border-b border-gray-700/60 last:border-0 transition-colors hover:bg-gray-700/50 ${!n.read_at ? 'bg-primary/5' : ''} ${n.action_url ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              <p className="text-sm font-medium text-gray-100">{n.title}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{n.message}</p>
                              <p className="text-[10px] text-gray-500 mt-1">
                                {formatNotificationDate(n.created_at)}
                                {n.action_url && (
                                  <span className="ml-1 text-primary">→ View</span>
                                )}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Profile dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-1 p-2 text-gray-400 hover:text-gray-100 rounded-lg hover:bg-gray-700"
                aria-expanded={profileOpen}
                aria-haspopup="true"
                aria-label="Account menu"
                title={user?.username || user?.email || 'Account'}
              >
                <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full overflow-hidden flex-shrink-0 bg-gray-600 flex items-center justify-center relative">
                  <img
                    src={user?.profileImageUrl || getDefaultAvatarUrl(user)}
                    alt=""
                    className="w-full h-full object-cover absolute inset-0"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const fallback = e.target.parentElement?.querySelector('[data-avatar-fallback]');
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <span
                    data-avatar-fallback
                    className="absolute inset-0 flex items-center justify-center text-gray-400"
                    style={{ display: 'none' }}
                  >
                    <AccountIcon className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden />
                  </span>
                </span>
                <ChevronDownIcon className={`w-4 h-4 hidden sm:block transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>
              {profileOpen && (
                <div className="dash-dropdown py-1 w-48">
                  {profileDropdownLinks.map(({ to, label }) => (
                    <Link
                      key={to}
                      to={to}
                      className="dash-dropdown-link"
                      onClick={() => setProfileOpen(false)}
                    >
                      {label}
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="dash-dropdown-link w-full border-0 border-t border-[var(--dash-border)] mt-1 pt-2 text-[var(--dash-red)]"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
            </div>
          </>
        ) : (
          <>
            <div className="dash-nav-start">
              <Link
                to={loginPath}
                className="dash-btn-login dash-nav-guest-login dash-nav-guest-login--mobile"
              >
                Login
              </Link>
              <Link
                to="/"
                className="dash-logo dash-nav-guest-logo dash-nav-guest-logo--desktop min-w-0"
              >
                <SiteLogo variant="nav" />
              </Link>
            </div>

            <div className="dash-nav-center dash-nav-guest-logo-wrap--mobile">
              <Link to="/" className="dash-logo dash-nav-guest-logo min-w-0">
                <SiteLogo variant="nav" className="dash-nav-guest-logo-img" />
              </Link>
            </div>

            <div className="dash-nav-end">
              <Link to={registerPath} className="dash-btn-signup">
                Sign Up
              </Link>
              <Link
                to={loginPath}
                className="dash-btn-login dash-nav-guest-login dash-nav-guest-login--desktop"
              >
                Login
              </Link>
            </div>
          </>
        )}
      </div>
      {isAuthenticated ? (
        <PhoneVerifyGateModal
          open={phoneUnlockOpen}
          onClose={() => setPhoneUnlockOpen(false)}
        />
      ) : null}
    </header>
  );
}



