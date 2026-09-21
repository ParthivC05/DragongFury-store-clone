import { request } from './client'

const BASE = '/api/social-links'

export function getSocialLinksSettings() {
  return request(`${BASE}/admin/settings`)
}

export function updateSocialLinksSettings(socialLinks) {
  return request(`${BASE}/admin/settings`, {
    method: 'PUT',
    body: JSON.stringify({ socialLinks }),
  })
}

export function clearSocialLinksSettings() {
  return request(`${BASE}/admin/settings`, { method: 'DELETE' })
}

export function getStoreSocialLinks(storeId) {
  return request(`/api/admin/stores/${storeId}/social-links`)
}

export function updateStoreSocialLinks(storeId, socialLinks) {
  return request(`/api/admin/stores/${storeId}/social-links`, {
    method: 'PUT',
    body: JSON.stringify({ socialLinks }),
  })
}

export function clearStoreSocialLinks(storeId) {
  return request(`/api/admin/stores/${storeId}/social-links`, { method: 'DELETE' })
}
