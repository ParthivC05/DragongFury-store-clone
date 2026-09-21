import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { upsertPushDevice, recordPushCampaignClick, consumePushClickFromLocation } from '../api/notifications';
import { getOrCreatePushDeviceId } from '../lib/pushDevice';
import {
  enablePushFromUserGesture,
  ensurePushServiceWorker,
  getFcmToken,
  getPushCapability,
  isFirebaseMessagingConfigured,
  onForegroundMessage,
  showBrowserNotification
} from '../lib/firebaseMessaging';

function payloadData(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
}

export function PushPermissionHost() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

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
    const token = await getFcmToken({ request: false }).catch(() => null);
    await syncDevice({ permission: 'granted', token });
    return token;
  }, [syncDevice]);

  useEffect(() => {
    consumePushClickFromLocation();
  }, [location.search, location.pathname]);

  useEffect(() => {
    if (loading) return undefined;
    if (!isFirebaseMessagingConfigured()) return undefined;
    let cancelled = false;
    let unsubscribe = () => {};
    let onFirstTap = null;

    function bindAskListeners() {
      if (onFirstTap) return;
      onFirstTap = askFromClick;
      window.addEventListener('click', onFirstTap, { capture: true });
    }

    function askFromClick() {
      if (onFirstTap) {
        window.removeEventListener('click', onFirstTap, true);
        onFirstTap = null;
      }
      enablePushFromUserGesture()
        .then((result) => {
          if (!cancelled) return syncDevice({ permission: result.permission, token: result.token });
          return null;
        })
        .catch(() => {});
    }

    const capAtStart = getPushCapability();
    const canAskNative =
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default' &&
      (!capAtStart.isiOS || capAtStart.isStandalone);
    if (canAskNative) {
      bindAskListeners();
    }

    async function boot() {
      try {
        await ensurePushServiceWorker().catch(() => null);
        if (cancelled) return;

        const cap = getPushCapability();
        const granted =
          cap.permission === 'granted' ||
          (typeof Notification !== 'undefined' && Notification.permission === 'granted');
        if (granted) {
          await registerIfGranted();
        } else if (cap.permission === 'default' && !cap.needsGesture) {
          const result = await enablePushFromUserGesture();
          if (!cancelled) {
            await syncDevice({ permission: result.permission, token: result.token });
          }
        } else if (canAskNative) {
          bindAskListeners();
        } else {
          await syncDevice({ permission: cap.permission, token: null });
        }

        if (cancelled) return;
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
      if (document.visibilityState === 'visible') registerIfGranted().catch(() => {});
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
          };
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      window.removeEventListener('push-campaign:click', onCampaignClick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (onFirstTap) window.removeEventListener('click', onFirstTap, true);
      if (permStatus) permStatus.onchange = null;
      try {
        unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, [syncDevice, registerIfGranted, isAuthenticated, loading]);

  return null;
}
