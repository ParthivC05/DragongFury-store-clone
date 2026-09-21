import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { API_BASE } from '../config/api';

const FCM_TOKEN_STORAGE_KEY = 'fcm_device_token';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function isFirebaseMessagingConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    vapidKey
  );
}

let app = null;
let messaging = null;

function rememberFcmToken(token) {
  try {
    localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
  } catch {
    /* ignore */
  }
}

export function getRememberedFcmToken() {
  try {
    return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetRememberedFcmToken() {
  try {
    localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function iosVersionNumber() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
  const m = ua.match(/OS (\d+)[._](\d+)/i);
  if (!m) return 0;
  return Number(m[1]) + Number(m[2]) / 100;
}

/** What this browser can actually do for DragonFury web push. */
export function getPushCapability() {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'unsupported', permission: 'unsupported', needsGesture: true };
  }
  const ua = navigator.userAgent || '';
  const isiOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    window.navigator.standalone === true ||
    ['standalone', 'fullscreen', 'minimal-ui'].some(
      (mode) => window.matchMedia?.(`(display-mode: ${mode})`)?.matches === true
    );
  const secure = window.isSecureContext === true;
  const hasNotification = typeof Notification !== 'undefined';
  const hasSW = 'serviceWorker' in navigator;
  const hasPushManager = 'PushManager' in window;
  const permission = hasNotification ? Notification.permission : 'unsupported';
  const needsGesture = isAndroid || isiOS || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);

  if (!secure) {
    return { ok: false, reason: 'insecure', permission: hasNotification ? permission : 'unsupported', needsGesture, isiOS, isAndroid, isStandalone };
  }
  if (isiOS && iosVersionNumber() > 0 && iosVersionNumber() < 16.04) {
    return { ok: false, reason: 'ios_version', permission: 'unsupported', needsGesture, isiOS, isAndroid, isStandalone };
  }
  // Safari/Chrome/Edge tabs on iOS never show the system Allow sheet.
  // Apple only exposes it after Add to Home Screen, opened from the icon.
  if (isiOS && !isStandalone) {
    return { ok: false, reason: 'ios_homescreen', permission: 'unsupported', needsGesture, isiOS, isAndroid, isStandalone };
  }
  if (!hasNotification || !hasSW || !hasPushManager) {
    return { ok: false, reason: 'unsupported', permission: 'unsupported', needsGesture, isiOS, isAndroid, isStandalone };
  }
  if (permission === 'denied') {
    return { ok: false, reason: 'blocked', permission: 'denied', needsGesture, isiOS, isAndroid, isStandalone };
  }
  if (permission === 'granted') {
    return { ok: true, reason: 'ready', permission: 'granted', needsGesture, isiOS, isAndroid, isStandalone };
  }
  return { ok: true, reason: 'prompt', permission: 'default', needsGesture, isiOS, isAndroid, isStandalone };
}

export function currentNotificationPermission() {
  const cap = getPushCapability();
  if (typeof Notification === 'undefined') return cap.permission || 'unsupported';
  return Notification.permission;
}

async function getMessagingInstance() {
  if (!isFirebaseMessagingConfigured()) return null;
  await ensurePushServiceWorker().catch(() => null);
  if (!app) app = initializeApp(firebaseConfig);
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  if (!messaging) messaging = getMessaging(app);
  return messaging;
}

export async function ensurePushServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/'
  });
  try {
    await registration.update();
  } catch {
    /* ignore */
  }
  await navigator.serviceWorker.ready;
  return registration;
}

/** Request notification permission, register SW, return FCM token (or null). */
export async function getFcmToken({ request = true } = {}) {
  if (typeof Notification === 'undefined') return null;
  let permission = Notification.permission;
  if (permission === 'default' && request) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return null;

  const registration = await ensurePushServiceWorker();
  if (!registration) return getRememberedFcmToken();

  const msg = await getMessagingInstance();
  if (!msg) return getRememberedFcmToken();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const token = await getToken(msg, {
        vapidKey,
        serviceWorkerRegistration: registration
      });
      if (token) {
        rememberFcmToken(token);
        return token;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  return getRememberedFcmToken();
}

async function afterNotificationPermission(permission) {
  let token = null;
  if (permission === 'granted') {
    try {
      token = await getFcmToken({ request: false });
    } catch {
      token = null;
    }
  }
  return { permission, token, capability: getPushCapability() };
}

/**
 * Must run as the first line of a real click/tap handler so Chrome/Safari/iOS
 * still treat it as a user gesture. Do not await or setState before this.
 */
export function requestNativeNotificationPrompt() {
  if (typeof Notification === 'undefined') {
    return Promise.resolve('unsupported');
  }
  if (Notification.permission === 'default') {
    try {
      return Promise.resolve(Notification.requestPermission());
    } catch {
      return Promise.resolve(Notification.permission);
    }
  }
  return Promise.resolve(Notification.permission);
}

/**
 * Call this from a click handler. The native Allow sheet must be requested in
 * the same turn as the tap — no awaits, timers, or iOS-only skips first.
 */
export function enablePushFromUserGesture() {
  const cap = getPushCapability();
  if (typeof Notification === 'undefined') {
    return Promise.resolve({ permission: 'unsupported', token: null, capability: cap });
  }
  return requestNativeNotificationPrompt().then(afterNotificationPermission);
}

/** Foreground messages — call handler when a push arrives while tab is open. */
export async function onForegroundMessage(handler) {
  const msg = await getMessagingInstance();
  if (!msg) return () => {};
  return onMessage(msg, handler);
}

function payloadData(payload = {}) {
  const nested = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  const note = payload?.notification && typeof payload.notification === 'object' ? payload.notification : {};
  return { ...note, ...payload, ...nested };
}

function reportCampaignClick(clickToken) {
  const token = String(clickToken || '').trim();
  if (!token) return;
  const url = `${API_BASE}/api/push-campaigns/click`;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clickToken: token }),
    keepalive: true,
    credentials: 'omit'
  }).catch(() => {});
}

function openPushUrl(rawUrl) {
  const url = String(rawUrl || '/').trim() || '/';
  try {
    const resolved = /^https?:\/\//i.test(url) ? new URL(url) : new URL(url, window.location.origin);
    const next = resolved.origin === window.location.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : resolved.toString();
    if (next !== window.location.href) {
      window.location.href = next;
    }
  } catch {
    window.location.href = url.startsWith('/') ? url : `/${url}`;
  }
}

function notifyPageOfPush() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* ignore */
  }
}

/** Show a system notification. On Android Chrome this must go through the service worker. */
export function showBrowserNotification(payload = {}) {
  const data = payloadData(payload);
  const title = data.title || payload.notification?.title || 'DragonFury';
  const body = data.body || payload.notification?.body || '';
  const icon = data.iconUrl || payload.notification?.icon || '/favicon.ico';
  const image = data.imageUrl || payload.notification?.image || undefined;
  const tag = data.campaignId ? `push-campaign-${data.campaignId}` : 'dragonfury-push';
  const options = {
    body,
    icon,
    image,
    data,
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [200, 100, 200]
  };

  notifyPageOfPush();

  if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') return null;

  void (async () => {
    try {
      const registration = await ensurePushServiceWorker();
      if (registration?.showNotification) {
        await registration.showNotification(title, options);
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      const notification = new Notification(title, options);
      notification.onclick = () => {
        reportCampaignClick(data.clickToken || data.pj_click);
        window.dispatchEvent(new CustomEvent('push-campaign:click', { detail: data }));
        window.focus();
        openPushUrl(data.actionUrl || data.click_action || '/');
        notification.close();
      };
    } catch {
      /* ignore */
    }
  })();

  return true;
}

/**
 * Unregister stored FCM token from backend (call on admin logout).
 * After this, the browser will not receive pushes until the user logs in again.
 */
export async function unregisterStoredFcmToken(unregisterApi) {
  const token = getRememberedFcmToken();
  if (!token || typeof unregisterApi !== 'function') {
    forgetRememberedFcmToken();
    return;
  }
  try {
    await unregisterApi(token);
  } catch {
    /* best-effort */
  } finally {
    forgetRememberedFcmToken();
  }
}

/** Store frontend logout: keep the token, only detach the user. */
export async function unlinkStoredFcmToken(unlinkApi) {
  const token = getRememberedFcmToken();
  if (typeof unlinkApi !== 'function') return;
  try {
    await unlinkApi(token);
  } catch {
    /* best-effort */
  }
}
