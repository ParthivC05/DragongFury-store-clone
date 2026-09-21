import { request, TOKEN_KEY, baseUrl } from './client'

const ADMIN = '/api/admin'
const BASE = `${ADMIN}/email-campaigns`
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function listEmailCampaigns() {
  return request(BASE)
}

export function getEmailCampaign(id) {
  return request(`${BASE}/${encodeURIComponent(id)}`)
}

export function createEmailCampaign(body) {
  return request(BASE, { method: 'POST', body: JSON.stringify(body) })
}

export function updateEmailCampaign(id, body) {
  return request(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

export function listEmailCampaignTestUsers(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/test-users`)
}

export function addEmailCampaignTestUser(id, body) {
  return request(`${BASE}/${encodeURIComponent(id)}/test-users`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function removeEmailCampaignTestUser(id, testUserId) {
  return request(`${BASE}/${encodeURIComponent(id)}/test-users/${encodeURIComponent(testUserId)}`, {
    method: 'DELETE'
  })
}

export function listEmailCampaignSends(id, params = {}) {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') qs.set(k, String(v))
  })
  const q = qs.toString()
  return request(`${BASE}/${encodeURIComponent(id)}/sends${q ? `?${q}` : ''}`)
}

export function getEmailCampaignSend(id, sendId) {
  return request(`${BASE}/${encodeURIComponent(id)}/sends/${encodeURIComponent(sendId)}`)
}

export function syncEmailCampaignSendDelivery(id, sendId) {
  return request(`${BASE}/${encodeURIComponent(id)}/sends/${encodeURIComponent(sendId)}/sync-delivery`, {
    method: 'POST',
    body: '{}'
  })
}

export function syncEmailCampaignDelivery(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/sync-delivery`, {
    method: 'POST',
    body: '{}'
  })
}

export function previewEmailCampaign(id, body = {}) {
  const path = id ? `${BASE}/${encodeURIComponent(id)}/preview` : `${BASE}/preview`
  return request(path, { method: 'POST', body: JSON.stringify(body) })
}

export function sendEmailCampaignTest(id, body) {
  return request(`${BASE}/${encodeURIComponent(id)}/send-test`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function sendEmailCampaignToTestUsers(id, body = {}) {
  return request(`${BASE}/${encodeURIComponent(id)}/send-to-test-users`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function getEmailCampaignEligibleCount(id) {
  return request(`${BASE}/${encodeURIComponent(id)}/eligible-count`)
}

export function uploadEmailCampaignImage(file) {
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
