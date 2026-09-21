import { request } from './client'

const AFFILIATE = '/api/affiliate'

/** List stores with Refer & Earn settings (master/tech = all, store_admin = own). */
export function listAffiliateStores() {
  return request(`${AFFILIATE}/admin/stores`)
}

/** Update one store's Refer & Earn settings. */
export function updateAffiliateStore(payload) {
  return request(`${AFFILIATE}/admin/stores`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

/** @deprecated Prefer listAffiliateStores / updateAffiliateStore */
export function getAffiliateSettings() {
  return request(`${AFFILIATE}/admin/settings`)
}

/** @deprecated Prefer updateAffiliateStore */
export function updateAffiliateSettings(payload) {
  return request(`${AFFILIATE}/admin/settings`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function resetAffiliateSettingsToDefault() {
  return request(`${AFFILIATE}/admin/settings/reset-to-default`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}
