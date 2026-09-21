import { request, TOKEN_KEY, baseUrl } from './client'

const ADMIN = '/api/admin'
const BASE = `${ADMIN}/push-campaigns`
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function listPushCampaigns(params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') qs.set(k, String(v))
  })
  const q = qs.toString()
  return request(`${BASE}${q ? `?${q}` : ''}`)
}

export function createPushCampaign(body) {
  return request(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function updatePushCampaign(id, body) {
  return request(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

export function deletePushCampaign(id) {
  return request(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function listPushCampaignTestUsers(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/test-users`)
}

export function addPushCampaignTestUser(id, body) {
  return request(`${BASE}/${encodeURIComponent(id)}/test-users`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function removePushCampaignTestUser(id, testUserId) {
  return request(`${BASE}/${encodeURIComponent(id)}/test-users/${encodeURIComponent(testUserId)}`, {
    method: 'DELETE'
  })
}

export function listPushCampaignSends(id, params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') qs.set(k, String(v))
  })
  const q = qs.toString()
  return request(`${BASE}/${encodeURIComponent(id)}/sends${q ? `?${q}` : ''}`)
}

export function sendPushCampaignTest(id, body) {
  return request(`${BASE}/${encodeURIComponent(id)}/send-test`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function sendPushCampaignToTestUsers(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/send-to-test-users`, {
    method: 'POST',
    body: '{}'
  })
}

export function sendPushCampaign(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    body: '{}'
  })
}

export function getPushCampaignEligibleCount(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/eligible-count`)
}

export function uploadPushCampaignImage(file) {
  if (!file) return Promise.reject(new Error('No image file selected.'))
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error('Image is too large. Maximum size is 5MB.'))
  }
  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${BASE}/upload-image`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form
  }).then(async (res) => {
    const raw = await res.text().catch(() => '')
    let data = {}
    if (raw) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = {}
      }
    }
    if (!res.ok) {
      const err = new Error(data?.message || 'Upload failed.')
      err.status = res.status
      throw err
    }
    return data?.data || data
  })
}
