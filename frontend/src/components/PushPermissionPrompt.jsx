import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { BellIcon } from '../assets/icons';
import { STORE_CODE } from '../config/site';
import { useAuth } from '../context/AuthContext';
import { upsertPushDevice, recordPushCampaignClick, consumePushClickFromLocation } from '../api/notifications';
import { getOrCreatePushDeviceId } from '../lib/pushDevice';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import {
  ensurePushServiceWorker,
  getFcmToken,
  getPushCapability,
  isFirebaseMessagingConfigured,
  onForegroundMessage,
  showBrowserNotification
} from '../lib/firebaseMessaging';
import './PushPermissionPrompt.css';

function normalizeStore(code) {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function payloadData(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
}

function isPlayjuwa() {
  return normalizeStore(STORE_CODE) === 'dragonfury';
}

function nativePermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

function canShowPlayjuwaCoach() {
  if (!isPlayjuwa() || !isFirebaseMessagingConfigured()) return false;
  if (typeof Notification === 'undefined' || !window.isSecureContext) return false;
  return nativePermission() === 'default';
}

function startNativePrompt() {
  if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  try {
    return Promise.resolve(Notification.requestPermission());
  } catch {
    return Promise.resolve(Notification.permission);
  }
}

function PushAllowCoachModal({ open, onAllow }) {
  useEffect(() => {
    if (!open) return undefined;
    const release = lockBodyScroll();
    const onKey = (event) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      release();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pj-push-sheet-backdrop" role="presentation">
      <div
        className="pj-push-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pj-push-coach-title"
        aria-describedby="pj-push-coach-copy"
      >
        <div className="pj-push-sheet__body">
          <div className="pj-push-sheet__bell" aria-hidden="true">
            <span className="pj-push-sheet__bell-ring" />
            <BellIcon width={42} height={42} strokeWidth={1.8} />
          </div>
          <div className="pj-push-sheet__copy">
            <p className="pj-push-sheet__kicker">Bonus alerts</p>
            <h2 id="pj-push-coach-title" className="pj-push-sheet__title">
              Never miss a free bonus
            </h2>
            <p id="pj-push-coach-copy" className="pj-push-sheet__text">
              Get instant updates for bonus drops, exclusive offers, and win alerts. Tap once to allow notifications in your browser.
            </p>
          </div>
        </div>
        <button type="button" className="pj-push-sheet__btn" onClick={onAllow}>
          <BellIcon width={20} height={20} strokeWidth={2.2} />
          Allow notifications
        </button>
      </div>
    </div>,
    document.body
  );
}

export function PushPermissionHost() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const [showCoach, setShowCoach] = useState(false);
  const askingRef = useRef(false);
  const askedNativeRef = useRef(false);

  const syncDevice = useCallback(async ({ permission, token } = {}) => {
    if (!isFirebaseMessagingConfigured()) return null;
    const deviceId = getOrCreatePushDeviceId();
    const capNow = getPushCapability();
    const status = permission || capNow.permission || 'default';
    await upsertPushDevice({
      deviceId,
      token: token || null,
      permission: status,
      client: 'user'
    }).catch(() => {});
    return token || null;
  }, []);

  const registerIfGranted = useCallback(async () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
    setShowCoach(false);
    const token = await getFcmToken({ request: false }).catch(() => null);
    await syncDevice({ permission: 'granted', token });
    return token;
  }, [syncDevice]);

  const revealCoachIfNeeded = useCallback(() => {
    if (!askedNativeRef.current) return;
    if (nativePermission() === 'granted' || nativePermission() === 'denied') {
      setShowCoach(false);
      return;
    }
    if (!canShowPlayjuwaCoach()) {
      setShowCoach(false);
      return;
    }
    setShowCoach(true);
  }, []);

  const askNativeFromClick = useCallback((event) => {
    if (event) event.stopPropagation();
    if (askingRef.current) return;
    if (nativePermission() === 'denied' || nativePermission() === 'granted') {
      setShowCoach(false);
      return;
    }

    askedNativeRef.current = true;
    const permissionWait = startNativePrompt();
    askingRef.current = true;
    setShowCoach(false);

    permissionWait
      .then(async (permission) => {
        let token = null;
        if (permission === 'granted') {
          token = await getFcmToken({ request: false }).catch(() => null);
        }
        await syncDevice({ permission, token });
        if (permission === 'granted' || permission === 'denied') {
          setShowCoach(false);
          return;
        }
        revealCoachIfNeeded();
      })
      .catch(() => {
        revealCoachIfNeeded();
      })
      .finally(() => {
        askingRef.current = false;
      });
  }, [revealCoachIfNeeded, syncDevice]);

  useEffect(() => {
    consumePushClickFromLocation();
  }, [location.search, location.pathname]);

  useEffect(() => {
    if (loading) return undefined;
    if (!isPlayjuwa()) return undefined;
    if (!isFirebaseMessagingConfigured()) return undefined;
    let cancelled = false;
    let unsubscribe = () => {};

    function onFirstClick(event) {
      if (event.target?.closest?.('.pj-push-sheet__btn')) return;
      document.removeEventListener('click', onFirstClick);
      askNativeFromClick(event);
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      document.addEventListener('click', onFirstClick);
    }

    async function boot() {
      try {
        await ensurePushServiceWorker().catch(() => null);
        if (cancelled) return;

        if (nativePermission() === 'granted') {
          await registerIfGranted();
          setShowCoach(false);
        } else if (nativePermission() === 'denied') {
          setShowCoach(false);
        }

        unsubscribe = await onForegroundMessage((payload) => {
          const data = payloadData(payload);
          const title = data.title || payload?.notification?.title;
          if (data.type === 'push_campaign' || data.clickToken || data.pj_click || title) {
            showBrowserNotification(payload);
          }
          if (data.type !== 'push_campaign' && !data.clickToken) {
            window.dispatchEvent(new Event('notifications:refresh'));
          }
        });
      } catch {
        /* push is best-effort */
      }
    }

    boot();

    function onCampaignClick(event) {
      const clickToken = event?.detail?.clickToken || event?.detail?.pj_click;
      if (clickToken) recordPushCampaignClick(clickToken).catch(() => {});
    }
    window.addEventListener('push-campaign:click', onCampaignClick);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (nativePermission() === 'granted') {
        registerIfGranted().catch(() => {});
        return;
      }
      if (askedNativeRef.current) revealCoachIfNeeded();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    let permStatus = null;
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'notifications' })
        .then((status) => {
          permStatus = status;
          status.onchange = () => {
            if (status.state === 'granted') registerIfGranted().catch(() => {});
            else if (status.state === 'denied') setShowCoach(false);
            else if (askedNativeRef.current) revealCoachIfNeeded();
          };
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      document.removeEventListener('click', onFirstClick);
      window.removeEventListener('push-campaign:click', onCampaignClick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (permStatus) permStatus.onchange = null;
      try {
        unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, [askNativeFromClick, revealCoachIfNeeded, registerIfGranted, isAuthenticated, loading]);

  return <PushAllowCoachModal open={showCoach} onAllow={askNativeFromClick} />;
}
