import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

const FCM_TOKEN_STORAGE_KEY = 'fcm_device_token'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

export function isFirebaseMessagingConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    vapidKey
  )
}

let app = null
let messaging = null

function rememberFcmToken(token) {
  try {
    sessionStorage.setItem(FCM_TOKEN_STORAGE_KEY, token)
  } catch {
    /* ignore */
  }
}

export function getRememberedFcmToken() {
  try {
    return sessionStorage.getItem(FCM_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function forgetRememberedFcmToken() {
  try {
    sessionStorage.removeItem(FCM_TOKEN_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

async function getMessagingInstance() {
  if (!isFirebaseMessagingConfigured()) return null
  const supported = await isSupported().catch(() => false)
  if (!supported) return null
  if (!app) app = initializeApp(firebaseConfig)
  if (!messaging) messaging = getMessaging(app)
  return messaging
}

/** Request notification permission, register SW, return FCM token (or null). */
export async function getFcmToken() {
  const msg = await getMessagingInstance()
  if (!msg) return null
  if (typeof Notification === 'undefined') return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/'
  })
  await navigator.serviceWorker.ready

  const token = await getToken(msg, {
    vapidKey,
    serviceWorkerRegistration: registration
  })
  if (token) rememberFcmToken(token)
  return token
}

/** Foreground messages — call handler when a push arrives while tab is open. */
export async function onForegroundMessage(handler) {
  const msg = await getMessagingInstance()
  if (!msg) return () => {}
  return onMessage(msg, handler)
}

/**
 * Unregister stored FCM token from backend (call on logout).
 * After this, the browser will not receive pushes until the user logs in again.
 */
export async function unregisterStoredFcmToken(unregisterApi) {
  const token = getRememberedFcmToken()
  if (!token || typeof unregisterApi !== 'function') {
    forgetRememberedFcmToken()
    return
  }
  try {
    await unregisterApi(token)
  } catch {
    /* best-effort */
  } finally {
    forgetRememberedFcmToken()
  }
}
