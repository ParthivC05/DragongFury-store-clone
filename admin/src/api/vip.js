import { request } from './client'

const VIP = '/api/vip'

/** Get VIP settings for current admin (store = store's settings, master = global). */
export function getVipSettings() {
  return request(`${VIP}/settings`)
}

/** Update VIP settings for current admin's scope. Payload can be { levels }, { faq }, or both. */
export function updateVipSettings(payload) {
  return request(`${VIP}/settings`, { method: 'PUT', body: JSON.stringify(payload) })
}

/** Reset VIP to platform default (store admin only). section: 'levels' | 'faq' | omit for full reset. */
export function resetVipSettingsToDefault(section) {
  return request(`${VIP}/settings/reset-to-default`, {
    method: 'POST',
    body: JSON.stringify(section ? { section } : {})
  })
}
