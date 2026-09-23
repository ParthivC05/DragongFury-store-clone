import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useVipStatus } from '../context/VipStatusContext';
import { SiteLogo } from './SiteLogo';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import { PhoneVerifyGateModal } from './Auth/PhoneVerifyGateModal';
import { DfWalletHud } from './DfWalletHud';
import { DfQuickMenu } from './DfQuickMenu';
import * as notificationsApi from '../api/notifications';
import { OPEN_MOBILE_MENU_EVENT } from '../utils/navEvents';
import { AUTH_LOBBY_LINKS } from '../constants/authLobbyLinks';

const profileDropdownLinks = [
  { to: '/settings', label: 'Profile' },
  { to: '/account/transactions', label: 'Transactions' },
  { to: '/account/vip', label: 'VIP Rewards' },
  { to: '/account/affiliate', label: 'Refer & Earn' },
  { to: '/blog', label: 'Blog' },
  { to: '/help', label: 'Help Center' }
];

const HEADER_PAGE_LINKS = [
  { to: '/casino', label: 'Play', match: (path) => path === '/casino' || path.startsWith('/casino/') },
  { to: '/bonus', label: 'Bonuses', match: (path) => path === '/bonus' || path === '/promotions' },
  { to: '/faq', label: 'How to Play', match: (path) => path === '/faq' },
  { to: '/blog', label: 'Updates', match: (path) => path === '/blog' || path.startsWith('/blog/') },
  { to: '/contact', label: 'Support', match: (path) => path === '/contact' }
];

function HeaderPageLinks({ pathname }) {
  return (
    <nav className="df-nav-links" aria-label="Site">
      {HEADER_PAGE_LINKS.map(({ to, label, match }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `df-nav-link${isActive || match(pathname) ? ' is-active' : ''}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function DesktopAuthNav({ pathname }) {
  return (
    <nav className="df-desktop-auth-nav" aria-label="Primary navigation">
      {AUTH_LOBBY_LINKS.filter((link) => link.desktop !== false).map(({ to, label, match, id }) => (
        <NavLink
          key={id}
          to={to}
          className={() => (match(pathname) ? 'df-desktop-auth-nav__active' : undefined)}
          end={to === '/'}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
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

export function Navbar() {
  const {
    user,
    isAuthenticated,
    loading: authLoading,
    logout,
    balanceSc,
    pscWalletUsable,
    bscWalletUsable,
    rscWalletUsable,
    lockedBalanceSc,
    balanceLoading
  } = useAuth();
  const { vipStatus } = useVipStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const menuBtnRef = useRef(null);
  const prevUnreadRef = useRef(0);
  const hasFetchedUnreadOnceRef = useRef(false);
  const notificationAudioRef = useRef(null);
  const [scBreakdownOpen, setScBreakdownOpen] = useState(false);
  const [phoneUnlockOpen, setPhoneUnlockOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const lockedSc = Number(lockedBalanceSc) || 0;
  const unlockedTotal = Number(balanceSc) || 0;
  const pillAmount = unlockedTotal > 0 ? unlockedTotal : lockedSc;
  const isDashboardLayout =
    location.pathname === '/' ||
    location.pathname === '/link2play' ||
    location.pathname === '/bonus' ||
    location.pathname === '/casino' ||
    location.pathname.startsWith('/casino/');
  const isGuestLanding = !isAuthenticated && !authLoading;
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
        if (hadPreviousFetch) playNotificationSound();
      }
      hasFetchedUnreadOnceRef.current = true;
      prevUnreadRef.current = count;
      setUnreadCount(count);
    } catch (_) {}
  }, [isAuthenticated, playNotificationSound]);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await notificationsApi.getNotifications({ limit: 20 });
      setNotifications(res?.notifications ?? []);
      await fetchUnreadCount();
    } catch (_) {}
  }, [isAuthenticated, fetchUnreadCount]);

  useEffect(() => {
    setProfileOpen(false);
    setNotifOpen(false);
    setScBreakdownOpen(false);
    setQuickMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const openFromPage = () => setQuickMenuOpen(true);
    window.addEventListener(OPEN_MOBILE_MENU_EVENT, openFromPage);
    return () => window.removeEventListener(OPEN_MOBILE_MENU_EVENT, openFromPage);
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

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
    return lockBodyScroll();
  }, [scBreakdownOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (scBreakdownOpen && !e.target.closest?.('.df-wallet-hud')) setScBreakdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [scBreakdownOpen]);

  useEffect(() => {
    if (notifOpen && isAuthenticated) fetchNotifications();
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
    } catch (_) {}
  };

  const handleNotificationClick = (n) => {
    setNotifOpen(false);
    const url = n.action_url;
    if (url) {
      if (url.startsWith('/')) navigate(url);
      else window.location.href = url;
    }
    if (!n.read_at && n.id) {
      notificationsApi.markNotificationRead(n.id).then(() => fetchUnreadCount()).catch(() => {});
    }
  };

  return (
    <header
      className={`dash-nav onboarding-navbar${isGuestLanding ? ' dash-nav--guest-landing' : ''}${
        isAuthenticated ? ' dash-nav--authenticated' : ''
      }`}
    >
      <div
        className={`dash-nav-inner ${isAuthenticated ? 'dash-nav-inner--auth' : 'dash-nav-inner--guest'} ${
          isDashboardLayout ? 'dash-nav-inner--wide' : ''
        }${isGuestLanding ? ' dash-nav-inner--guest-landing' : ''}`}
      >
        {isAuthenticated ? (
          <>
            <Link to="/" className="dash-logo dash-nav-auth-logo min-w-0" aria-label="Go to lobby">
              <SiteLogo variant="nav" />
            </Link>

            <div className="df-auth-balances" aria-label="Player balance display">
              <DfWalletHud
                amount={pillAmount}
                balanceLoading={balanceLoading}
                open={scBreakdownOpen}
                onToggle={() => {
                  setScBreakdownOpen((o) => !o);
                  if (localStorage.getItem('onboarding_pending') === 'true') {
                    window.dispatchEvent(new CustomEvent('onboarding:wallet-opened'));
                  }
                }}
                onClose={() => setScBreakdownOpen(false)}
                psc={pscWalletUsable}
                bsc={bscWalletUsable}
                rsc={rscWalletUsable}
                lockedSc={lockedSc}
                onUnlockPhone={() => {
                  setScBreakdownOpen(false);
                  setPhoneUnlockOpen(true);
                }}
              />
            </div>

            <DesktopAuthNav pathname={location.pathname} />

            <div className="dash-nav-end df-lobby-header-actions">
              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((o) => !o)}
                  className="df-profile-trigger"
                  aria-expanded={profileOpen}
                  aria-haspopup="dialog"
                  aria-label="Open profile picture and account"
                >
                  <img
                    src={user?.profileImageUrl || '/df-online/tier-hatchling.webp'}
                    alt=""
                    width={44}
                    height={44}
                    onError={(e) => {
                      e.currentTarget.src = '/df-online/tier-hatchling.webp';
                    }}
                  />
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
                    {vipStatus?.level_name ? (
                      <span className="dash-dropdown-link df-vip-chip" aria-hidden>
                        VIP · {vipStatus.level_name}
                      </span>
                    ) : null}
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

              <Link to="/help" className="df-tour-btn" aria-label="Website tour" title="Website tour">
                <img src="/df-online/tour.webp" width="44" height="44" alt="" draggable="false" />
              </Link>

              <div className="relative df-notif-wrap" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifOpen((o) => !o)}
                  className={`df-header-bell${unreadCount > 0 ? ' df-header-bell--alert' : ''}`}
                  aria-expanded={notifOpen}
                  aria-label={
                    unreadCount > 0 ? `${unreadCount} unread notifications` : 'Open notifications'
                  }
                >
                  <span className="df-header-bell__dot" aria-hidden />
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
                        <p className="px-4 py-6 text-sm text-gray-500 text-center">
                          No notifications yet.
                        </p>
                      ) : (
                        <ul className="py-1">
                          {notifications.map((n) => (
                            <li key={n.id}>
                              <button
                                type="button"
                                onClick={() => handleNotificationClick(n)}
                                className={`w-full text-left px-4 py-3 border-b border-gray-700/60 last:border-0 transition-colors hover:bg-gray-700/50 ${
                                  !n.read_at ? 'bg-primary/5' : ''
                                } ${n.action_url ? 'cursor-pointer' : 'cursor-default'}`}
                              >
                                <p className="text-sm font-medium text-gray-100">{n.title}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{n.message}</p>
                                <p className="text-[10px] text-gray-500 mt-1">
                                  {formatNotificationDate(n.created_at)}
                                  {n.action_url && <span className="ml-1 text-primary">→ View</span>}
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

              <button
                ref={menuBtnRef}
                type="button"
                className={`df-menu-btn${quickMenuOpen ? ' df-menu-btn--open' : ''}`}
                aria-label={quickMenuOpen ? 'Close menu' : 'Open menu'}
                aria-haspopup="menu"
                aria-expanded={quickMenuOpen}
                aria-controls="dragonfury-quick-menu"
                onClick={() => setQuickMenuOpen((o) => !o)}
              >
                <img
                  className="df-menu-btn__dots"
                  src={
                    quickMenuOpen
                      ? '/df-online/menu-close-arrow.webp'
                      : '/df-online/menu-button.png'
                  }
                  width="58"
                  height="60"
                  alt=""
                />
              </button>
            </div>

            <DfQuickMenu
              open={quickMenuOpen}
              onClose={() => setQuickMenuOpen(false)}
              anchorRef={menuBtnRef}
            />
          </>
        ) : (
          <>
            <Link to="/" className="dash-logo dash-nav-guest-logo min-w-0">
              <SiteLogo variant="nav" />
            </Link>
            <HeaderPageLinks pathname={location.pathname} />
            <div className="dash-nav-actions">
              <Link to="/help" className="df-tour-btn" aria-label="Website tour" title="Help">
                <img src="/df-online/tour.webp" width="44" height="44" alt="" draggable="false" />
              </Link>
              <div className="dash-nav-auth">
                <Link to={registerPath} className="dash-btn-signup">
                  Sign Up
                </Link>
                <Link to={loginPath} className="dash-btn-login">
                  Login
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
      {isAuthenticated ? (
        <PhoneVerifyGateModal open={phoneUnlockOpen} onClose={() => setPhoneUnlockOpen(false)} />
      ) : null}
    </header>
  );
}
