import { request } from './client'

const BASE = '/api/slot-providers'

export function getSlotProviderSettings() {
  return request(`${BASE}/admin/settings`)
}

export function updateSlotProviderSettings(providers) {
  return request(`${BASE}/admin/settings`, {
    method: 'PUT',
    body: JSON.stringify({ providers }),
  })
}

export function getStoreSlotProviders(storeId) {
  return request(`/api/admin/stores/${storeId}/slot-providers`)
}

export function updateStoreSlotProviders(storeId, providers) {
  return request(`/api/admin/stores/${storeId}/slot-providers`, {
    method: 'PUT',
    body: JSON.stringify({ providers }),
  })
}
