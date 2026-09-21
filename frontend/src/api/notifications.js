import { API_BASE } from '../config/api';
import { getRequest, patchRequest, postRequest, deleteRequest } from '../services/request';
import { STORE_CODE } from '../config/site';

const NOTIFICATIONS_BASE = `${API_BASE}/api/notifications`;
const PUSH_CAMPAIGNS_BASE = `${API_BASE}/api/push-campaigns`;

/** List notifications for current user. */
export function getNotifications(params = {}) {
  return getRequest(`${NOTIFICATIONS_BASE}`, params);
}

/** Get unread count. */
export function getUnreadCount() {
  return getRequest(`${NOTIFICATIONS_BASE}/unread-count`);
}

/** Mark one notification as read. */
export function markNotificationRead(id) {
  return patchRequest(`${NOTIFICATIONS_BASE}/${id}/read`, {});
}

/** Mark all as read. */
export function markAllNotificationsRead() {
  return patchRequest(`${NOTIFICATIONS_BASE}/read-all`, {});
}

/** Register FCM device token for push (logged-in / admin). */
export function registerDeviceToken(token, client = 'user') {
  return postRequest(`${NOTIFICATIONS_BASE}/device-token`, { token, client });
}

/** Unregister FCM device token (admin logout). */
export function unregisterDeviceToken(token) {
  return deleteRequest(`${NOTIFICATIONS_BASE}/device-token`, { token });
}

/** Upsert guest or logged-in browser for DragonFury web push. */
export function upsertPushDevice({ deviceId, token, permission, client = 'user' }) {
  return postRequest(`${NOTIFICATIONS_BASE}/push-device`, {
    deviceId,
    token,
    permission,
    client,
    storeCode: STORE_CODE
  });
}

/** Keep the FCM token after logout so campaigns still reach this browser. */
export function unlinkPushDevice({ deviceId, token }) {
  return postRequest(`${NOTIFICATIONS_BASE}/push-device/unlink`, { deviceId, token });
}

export function recordPushCampaignClick(clickToken) {
  const token = String(clickToken || '').trim();
  if (!token) return Promise.resolve(null);
  return postRequest(`${PUSH_CAMPAIGNS_BASE}/click`, { clickToken: token });
}

/** Record a campaign click from the landing URL (?pj_click=) and strip the param. */
export function consumePushClickFromLocation() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('pj_click') || url.searchParams.get('clickToken');
    if (!token) return;
    recordPushCampaignClick(token).catch(() => {});
    url.searchParams.delete('pj_click');
    url.searchParams.delete('clickToken');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', next);
  } catch {
    /* ignore */
  }
}
