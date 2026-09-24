import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageReady } from '../context/PageReadyContext';
import { site } from '../config/site';
import {
  OPEN_INTERCOM_EVENT,
  OPEN_SUPPORT_WIDGET_EVENT,
  SHOW_INTERCOM_LAUNCHER_EVENT,
  consumePendingChatOpen,
  consumePendingSupportOpen,
} from './intercomApi';
import { beginAnimatedClose } from '../utils/dfCloseAnimation';
import './intercom-widget.css';

/** Lazy Intercom SDK — keeps the messenger out of the initial landing bundle. */
let intercomSdkPromise = null;
function loadIntercomSdk() {
  if (!intercomSdkPromise) {
    intercomSdkPromise = import('@intercom/messenger-js-sdk');
  }
  return intercomSdkPromise;
}

const INTERCOM_APP_ID = import.meta.env?.VITE_INTERCOM_APP_ID?.trim();
/**
 * Send logged-in user_id/email/name to Intercom (same as Orionstars — no backend hash/JWT).
 * Set VITE_INTERCOM_IDENTIFY_USERS=false to disable.
 * Requires Intercom Messenger Security / Identity Verification to be OFF for this workspace.
 */
const INTERCOM_IDENTIFY_USERS =
  import.meta.env?.VITE_INTERCOM_IDENTIFY_USERS?.trim()?.toLowerCase() !== 'false';
/** Support / Help Desk can open across the site (blocked on auth / in-game play). */
const SUPPORT_PANEL_BLOCKED = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/google-auth',
  '/auth',
];
/** TEMP: hide "Raise a ticket" in support panel UI. Flip to true to restore. */
const SHOW_RAISE_TICKET_ACTION = false;

function isSupportPanelAllowedRoute(pathname) {
  const path = String(pathname || '');
  if (!path) return false;
  if (SUPPORT_PANEL_BLOCKED.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  if (path.includes('/play')) return false;
  return true;
}

/** Where Intercom messenger is allowed to boot. */
function isIntercomAllowedRoute(pathname) {
  return isSupportPanelAllowedRoute(pathname);
}

function isOnboardingTutorialActive() {
  try {
    return localStorage.getItem('onboarding_pending') === 'true';
  } catch {
    return false;
  }
}

/** Floating bubble visibility (can be hidden on deposit/withdraw without blocking sidebar Support). */
function canShowFloatingLauncher() {
  if (window.location.pathname !== '/') return false;
  const path = window.location.pathname;
  if (path === '/deposit' || path === '/withdraw' || path === '/redeem' || path.startsWith('/deposit/')) return false;
  if (path.startsWith('/support/tickets')) return false;
  if (document.body.classList.contains('onboarding-tutorial-active')) return false;
  if (isOnboardingTutorialActive()) return false;
  if (document.body.classList.contains('welcome-modal-open')) return false;
  if (document.body.classList.contains('guest-spin-modal-open')) return false;
  if (document.body.classList.contains('game-transfer-modal-open')) return false;
  if (document.body.classList.contains('page-loader-active')) return false;
  if (document.body.classList.contains('app-modal-open')) return false;
  if (document.body.hasAttribute('data-scroll-locked')) return false;
  return true;
}

function canOpenSupportPanel() {
  if (!isSupportPanelAllowedRoute(window.location.pathname)) return false;
  if (document.body.classList.contains('onboarding-tutorial-active')) return false;
  if (isOnboardingTutorialActive()) return false;
  return true;
}

function setIntercomOpenState(open) {
  document.body.classList.toggle('intercom-maximized', open);
}

/** True only after a successful Intercom boot in this session. */
let intercomMessengerBooted = false;

function isIntercomMessengerReady() {
  return (
    intercomMessengerBooted &&
    typeof window !== 'undefined' &&
    typeof window.Intercom === 'function'
  );
}

function hideIntercomMessenger() {
  if (!isIntercomMessengerReady()) {
    setIntercomOpenState(false);
    return;
  }
  loadIntercomSdk()
    .then((sdk) => {
      try {
        sdk.hide();
      } catch {
        /* messenger may not be booted */
      }
    })
    .catch(() => {});
  setIntercomOpenState(false);
}

function shutdownIntercom() {
  if (!isIntercomMessengerReady()) {
    intercomMessengerBooted = false;
    setIntercomOpenState(false);
    return;
  }
  loadIntercomSdk()
    .then((sdk) => {
      try {
        sdk.shutdown();
      } catch {
        /* already shut down */
      }
    })
    .catch(() => {});
  intercomMessengerBooted = false;
  setIntercomOpenState(false);
}

/** Same approach as Orionstars LiveChatProvider — identify from frontend user only. */
function buildIntercomSettings(user) {
  const settings = {
    app_id: INTERCOM_APP_ID,
    hide_default_launcher: true,
  };

  if (!INTERCOM_IDENTIFY_USERS || !user) return settings;

  const name = user.username || user.name || [user.firstName, user.lastName].filter(Boolean).join(' ');
  const email = user.email;
  const userId = user.userId ?? user.id;
  const createdRaw = user.createdAt ?? user.created_at;

  if (name) settings.name = String(name);
  if (email) settings.email = String(email);
  if (userId != null && userId !== '') settings.user_id = String(userId);

  if (createdRaw) {
    const ms = new Date(createdRaw).getTime();
    if (!Number.isNaN(ms)) settings.created_at = Math.floor(ms / 1000);
  }

  return settings;
}

function MessageIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M4.5 5.25A3.25 3.25 0 0 1 7.75 2h8.5a3.25 3.25 0 0 1 3.25 3.25v5.9a3.25 3.25 0 0 1-3.25 3.25h-4.02l-4.86 4.1a.85.85 0 0 1-1.4-.65V14.4H7.75a3.25 3.25 0 0 1-3.25-3.25v-5.9Zm3.25-1.5A1.5 1.5 0 0 0 6.25 5.25v5.9a1.5 1.5 0 0 0 1.5 1.5h3.07a.85.85 0 0 1 .85.85v1.5l3.65-3.08a.85.85 0 0 1 .55-.2h.38a1.5 1.5 0 0 0 1.5-1.5v-5.9a1.5 1.5 0 0 0-1.5-1.5h-8.5Z"
      />
      <path fill="currentColor" d="M8.2 7.2h7.6v1.5H8.2V7.2Zm0 3h5.4v1.5H8.2v-1.5Z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pj-support-icon" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        d="m21 3-7.4 18-3.2-7.4L3 10.4 21 3Z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pj-support-icon" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.9"
        d="m20 20-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pj-support-chevron" aria-hidden>
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="m9 6 6 6-6 6" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pj-support-footer-icon" aria-hidden>
      <path fill="currentColor" d="M4 10.8 12 4l8 6.8v8.45a.75.75 0 0 1-.75.75h-4.5v-5.5h-5.5V20h-4.5A.75.75 0 0 1 4 19.25V10.8Z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pj-support-footer-icon" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
        d="M9.6 9.2a2.5 2.5 0 1 1 3.5 2.3c-.73.38-1.1.9-1.1 1.7v.35M12 17.2h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function SupportWidget({ isOpen, onClose, onOpenChat, userName, isAuthenticated = false }) {
  const [exiting, setExiting] = useState(false);
  const topics = useMemo(() => {
    const all = [
      { label: 'Create Account', to: '/help?tab=create-account' },
      { label: 'Recharge', to: '/help?tab=recharge' },
      { label: 'Redeem', to: '/help?tab=redeem' },
      { label: 'Promotions', to: '/help?tab=promotions' },
      { label: 'Link2Play', to: '/link2play', guestOnly: true },
    ];
    return isAuthenticated ? all.filter((topic) => !topic.guestOnly) : all;
  }, [isAuthenticated]);

  const requestClose = useCallback(() => {
    beginAnimatedClose(exiting, setExiting, onClose);
  }, [exiting, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setExiting(false);
      document.body.classList.remove('df-help-desk-open');
      return undefined;
    }
    document.body.classList.add('df-help-desk-open');
    return () => document.body.classList.remove('df-help-desk-open');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`df-help-desk${exiting ? ' is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="df-help-desk-title"
    >
      <button type="button" className="df-help-desk__backdrop" onClick={requestClose} aria-label="Close help desk" />
      <section className="df-help-desk__panel">
        <header className="df-help-desk__header">
          <span className="df-help-desk__avatar" aria-hidden>
            <img src={site.logoUrl} alt="" width="52" height="52" />
          </span>
          <div className="df-help-desk__titles">
            <h2 id="df-help-desk-title">{site.platformName} Help Desk</h2>
            <span className={`df-help-desk__presence${isAuthenticated ? '' : ' is-offline'}`}>
              <i />
              {isAuthenticated ? 'Online support' : 'No login needed'}
            </span>
          </div>
          <span className="df-help-desk__badge">{isAuthenticated ? userName : 'Guest'}</span>
          <button
            type="button"
            onClick={requestClose}
            className="df-help-desk__close dragonfury-close-button"
            aria-label="Close help desk"
          >
            <img src="/df-online/wallet-close.webp" alt="" width="44" height="44" />
          </button>
        </header>

        <div className="df-help-desk__intro">
          <strong>Need a hand with {site.platformName}?</strong>
          <span>
            {isAuthenticated
              ? 'Message our team or browse help guides below.'
              : 'Start a chat or browse help guides — no account needed to reach support.'}
          </span>
        </div>

        <div className="df-help-desk__scroll">
          <button type="button" onClick={onOpenChat} className="df-help-desk__action df-help-desk__action--primary">
            <span>
              <strong>Send us a message</strong>
              <small>We typically reply as soon as possible</small>
            </span>
            <SendIcon />
          </button>

          {SHOW_RAISE_TICKET_ACTION &&
            (isAuthenticated ? (
              <Link to="/support/tickets" onClick={requestClose} className="df-help-desk__action">
                <span>
                  <strong>Raise a ticket</strong>
                  <small>Track your issue and chat with support</small>
                </span>
                <ChevronIcon />
              </Link>
            ) : (
              <Link to="/login" onClick={requestClose} className="df-help-desk__action">
                <span>
                  <strong>Raise a ticket</strong>
                  <small>Sign in to submit and track a support ticket</small>
                </span>
                <ChevronIcon />
              </Link>
            ))}

          <Link to="/help" onClick={requestClose} className="df-help-desk__action">
            <span>
              <strong>Search for help</strong>
              <small>Browse {site.platformName} guides and FAQs</small>
            </span>
            <SearchIcon />
          </Link>

          <div className="df-help-desk__topics">
            <p className="df-help-desk__section-label">Help topics</p>
            {topics.map((topic) => (
              <Link key={topic.label} to={topic.to} onClick={requestClose} className="df-help-desk__topic">
                <span>{topic.label}</span>
                <ChevronIcon />
              </Link>
            ))}
          </div>
        </div>

        <nav className="df-help-desk__footer" aria-label="Support navigation">
          <div className="df-help-desk__footer-btn is-active">
            <HomeIcon />
            <span>Home</span>
          </div>
          <Link to="/help" onClick={requestClose} className="df-help-desk__footer-link">
            <HelpIcon />
            <span>Help</span>
          </Link>
          <button type="button" onClick={onOpenChat} className="df-help-desk__footer-btn">
            <MessageIcon className="pj-support-footer-icon" />
            <span>Messages</span>
          </button>
        </nav>
      </section>
    </div>
  );
}

export function IntercomWidget() {
  const location = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { showLoader } = usePageReady();
  const bootedRef = useRef(false);
  const identityKeyRef = useRef('');
  const [mounted, setMounted] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);

  const allowedRoute = isIntercomAllowedRoute(location.pathname);
  const supportPanelAllowed = isSupportPanelAllowedRoute(location.pathname);
  const canUseIntercom = Boolean(INTERCOM_APP_ID) && allowedRoute && !authLoading;
  const identityKey = INTERCOM_IDENTIFY_USERS
    ? `${isAuthenticated ? 'user' : 'guest'}:${user?.userId ?? user?.id ?? ''}:${user?.email ?? ''}`
    : 'visitor';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (messengerOpen) {
      document.body.classList.add('intercom-maximized');
    } else {
      document.body.classList.remove('intercom-maximized');
    }
    return () => document.body.classList.remove('intercom-maximized');
  }, [messengerOpen]);

  useEffect(() => {
    document.body.classList.toggle('support-widget-open', supportOpen);
    return () => document.body.classList.remove('support-widget-open');
  }, [supportOpen]);

  useEffect(() => {
    if (!allowedRoute || showLoader) {
      hideIntercomMessenger();
    }
    if (!supportPanelAllowed) {
      setSupportOpen(false);
    }
  }, [allowedRoute, supportPanelAllowed, showLoader]);

  useEffect(() => {
    if (!canUseIntercom) {
      if (bootedRef.current) {
        shutdownIntercom();
        bootedRef.current = false;
        identityKeyRef.current = '';
      }
    }
  }, [canUseIntercom]);

  useEffect(() => () => {
    shutdownIntercom();
    bootedRef.current = false;
    identityKeyRef.current = '';
  }, []);

  useEffect(() => {
    if (!bootedRef.current || !canUseIntercom) return;
    loadIntercomSdk()
      .then((sdk) => {
        try {
          sdk.update({});
        } catch {
          /* messenger may not be ready */
        }
      })
      .catch(() => {});
  }, [location.pathname, canUseIntercom]);

  const openSupportPanel = useCallback(() => {
    if (!canOpenSupportPanel()) return;
    setSupportOpen(true);
  }, []);

  const openChat = useCallback(() => {
    if (isOnboardingTutorialActive() || document.body.classList.contains('onboarding-tutorial-active')) {
      return;
    }
    if (!canUseIntercom) {
      openSupportPanel();
      return;
    }
    setSupportOpen(false);
    setMessengerOpen(true);
    loadIntercomSdk()
      .then((sdk) => {
        try {
          // Ensure messenger is booted before show (idle boot may not have run yet).
          if (!bootedRef.current || identityKeyRef.current !== identityKey) {
            sdk.default(buildIntercomSettings(INTERCOM_IDENTIFY_USERS ? user : null));
            intercomMessengerBooted = true;
            bootedRef.current = true;
            identityKeyRef.current = identityKey;
            sdk.onShow(() => setMessengerOpen(true));
            sdk.onHide(() => setMessengerOpen(false));
          }
          sdk.show();
          } catch (err) {
            setMessengerOpen(false);
          }
        })
        .catch(() => {
          setMessengerOpen(false);
        });
  }, [canUseIntercom, identityKey, user, openSupportPanel]);

  useEffect(() => {
    const handleOpenChat = () => {
      consumePendingChatOpen();
      openChat();
    };
    const handleOpenSupport = () => {
      consumePendingSupportOpen();
      openSupportPanel();
    };
    const handleShowLauncher = () => {
      if (canShowFloatingLauncher()) document.body.classList.remove('hide-intercom-launcher');
    };
    window.addEventListener(OPEN_INTERCOM_EVENT, handleOpenChat);
    window.addEventListener(OPEN_SUPPORT_WIDGET_EVENT, handleOpenSupport);
    window.addEventListener(SHOW_INTERCOM_LAUNCHER_EVENT, handleShowLauncher);
    return () => {
      window.removeEventListener(OPEN_INTERCOM_EVENT, handleOpenChat);
      window.removeEventListener(OPEN_SUPPORT_WIDGET_EVENT, handleOpenSupport);
      window.removeEventListener(SHOW_INTERCOM_LAUNCHER_EVENT, handleShowLauncher);
    };
  }, [openChat, openSupportPanel]);

  useEffect(() => {
    if (authLoading) return undefined;
    if (consumePendingChatOpen()) openChat();
    else if (consumePendingSupportOpen()) openSupportPanel();
    return undefined;
  }, [authLoading, openChat, openSupportPanel]);

  useEffect(() => {
    const syncHiddenState = () => {
      if (isOnboardingTutorialActive() || document.body.classList.contains('onboarding-tutorial-active')) {
        setSupportOpen(false);
        document.body.classList.add('hide-intercom-launcher');
        if (!messengerOpen) hideIntercomMessenger();
        return;
      }
      if (!canShowFloatingLauncher()) {
        document.body.classList.add('hide-intercom-launcher');
        if (!messengerOpen) hideIntercomMessenger();
        return;
      }
      document.body.classList.remove('hide-intercom-launcher');
    };

    syncHiddenState();
    window.addEventListener('onboarding:start', syncHiddenState);
    window.addEventListener('onboarding:ended', syncHiddenState);
    window.addEventListener('onboarding:updated', syncHiddenState);
    window.addEventListener('welcome-modal-closed', syncHiddenState);

    return () => {
      window.removeEventListener('onboarding:start', syncHiddenState);
      window.removeEventListener('onboarding:ended', syncHiddenState);
      window.removeEventListener('onboarding:updated', syncHiddenState);
      window.removeEventListener('welcome-modal-closed', syncHiddenState);
      document.body.classList.remove('hide-intercom-launcher');
    };
  }, [allowedRoute, showLoader, messengerOpen]);

  if (!mounted || !supportPanelAllowed) return null;

  const displayName = user?.username || user?.name || user?.firstName || 'there';

  return createPortal(
    <>
      {/* Replaced by DragonFuryHelpLauncher (.df-help-launcher) */}
      <button
        id="intercom-custom-launcher"
        type="button"
        onClick={openSupportPanel}
        className="pj-intercom-launcher pj-intercom-launcher--hidden"
        aria-hidden="true"
        tabIndex={-1}
      >
        <MessageIcon className="pj-intercom-launcher-icon" />
      </button>
      <SupportWidget
        isOpen={supportOpen}
        onClose={() => setSupportOpen(false)}
        onOpenChat={openChat}
        userName={displayName}
        isAuthenticated={isAuthenticated}
      />
    </>,
    document.body
  );
}
