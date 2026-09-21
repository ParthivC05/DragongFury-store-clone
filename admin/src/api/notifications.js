import { request } from './client'

/** List notifications for current admin user. */
export function getNotifications(params = {}) {
  const q = new URLSearchParams(params).toString()
  return request(`/api/notifications${q ? `?${q}` : ''}`)
}

/** Get unread count. */
export function getUnreadCount() {
  return request('/api/notifications/unread-count')
}

/** Mark one notification as read. */
export function markNotificationRead(id) {
  return request(`/api/notifications/${id}/read`, { method: 'PATCH', body: JSON.stringify({}) })
}

/** Mark all as read. */
export function markAllNotificationsRead() {
  return request('/api/notifications/read-all', { method: 'PATCH', body: JSON.stringify({}) })
}

/** Register FCM device token for push. */
export function registerDeviceToken(token, client = 'admin') {
  return request('/api/notifications/device-token', {
    method: 'POST',
    body: JSON.stringify({ token, client })
  })
}

/** Unregister FCM device token. */
export function unregisterDeviceToken(token) {
  return request('/api/notifications/device-token', {
    method: 'DELETE',
    body: JSON.stringify({ token })
  })
}
