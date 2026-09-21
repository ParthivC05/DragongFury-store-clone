import { request, baseUrl, TOKEN_KEY } from './client'
import { DESKTOP_MAX_BYTES, DESKTOP_MAX_LABEL, assertWebpUpload } from '../utils/adminImageUploadConstraints'

const BASE = '/api/dashboard-promo-modals'
export const MAX_MODAL_IMAGE_BYTES = DESKTOP_MAX_BYTES
export const MAX_MODAL_IMAGE_LABEL = DESKTOP_MAX_LABEL
export const MAX_STEPS = 15
export const MIN_DELAY_SECONDS = 0
export const MAX_DELAY_SECONDS = 300

export const MODAL_TYPE_OPTIONS = [
  { value: 'daily_bonus', label: 'Daily Bonus' },
  { value: 'spin_wheel', label: 'Spin Wheel Ready' },
  { value: 'first_deposit', label: 'First Deposit Bonus' },
  { value: 'invite_friends', label: 'Invite Friends' },
  { value: 'custom', label: 'Custom image modal' },
]

/** Friendly labels for the admin UI */
export const MODAL_TYPE_META = {
  daily_bonus: {
    label: 'Daily Bonus',
    emoji: '🎁',
    description: 'Shows the free daily reward popup.',
  },
  spin_wheel: {
    label: 'Spin Wheel',
    emoji: '🎡',
    description: 'Shows when the player has a free spin ready.',
  },
  first_deposit: {
    label: 'First Deposit Bonus',
    emoji: '💰',
    description: 'Encourages a first purchase / deposit.',
  },
  invite_friends: {
    label: 'Invite Friends',
    emoji: '👥',
    description: 'Asks the player to invite friends.',
  },
  custom: {
    label: 'Your own picture',
    emoji: '🖼️',
    description: 'Shows an image you upload (your promo banner).',
  },
}

export const DEFAULT_STEPS = [
  { id: 'daily_bonus', type: 'daily_bonus', enabled: true, delaySeconds: 5 },
  { id: 'spin_wheel', type: 'spin_wheel', enabled: true, delaySeconds: 20 },
  { id: 'first_deposit', type: 'first_deposit', enabled: true, delaySeconds: 20 },
  { id: 'invite_friends', type: 'invite_friends', enabled: true, delaySeconds: 20 },
]

export const DEFAULT_SETTINGS = {
  enabled: true,
  initialLoginDelaySeconds: 20,
  afterOnboardingDelaySeconds: 10,
  steps: DEFAULT_STEPS,
}

function uploadErrorMessage(status, data) {
  if (status === 413) {
    return `Image must be ${MAX_MODAL_IMAGE_LABEL} or smaller. Only WEBP is allowed.`
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }
  if (status === 400) {
    return `Invalid image. Use WEBP under ${MAX_MODAL_IMAGE_LABEL}.`
  }
  return 'Upload failed. Please try again.'
}

export function getDashboardPromoModalsSettings() {
  return request(`${BASE}/admin/settings`)
}

export function updateDashboardPromoModalsSettings(dashboardPromoModals) {
  return request(`${BASE}/admin/settings`, {
    method: 'PUT',
    body: JSON.stringify({ dashboardPromoModals }),
  })
}

export function clearDashboardPromoModalsSettings() {
  return request(`${BASE}/admin/settings`, { method: 'DELETE' })
}

export function getStoreDashboardPromoModals(storeId) {
  return request(`/api/admin/stores/${storeId}/dashboard-promo-modals`)
}

export function updateStoreDashboardPromoModals(storeId, dashboardPromoModals) {
  return request(`/api/admin/stores/${storeId}/dashboard-promo-modals`, {
    method: 'PUT',
    body: JSON.stringify({ dashboardPromoModals }),
  })
}

export function clearStoreDashboardPromoModals(storeId) {
  return request(`/api/admin/stores/${storeId}/dashboard-promo-modals`, { method: 'DELETE' })
}

export function uploadDashboardPromoModalImage(file) {
  if (!file) {
    return Promise.reject(new Error('No image file selected.'))
  }
  assertWebpUpload(file, { maxBytes: MAX_MODAL_IMAGE_BYTES, label: 'Image' })

  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  return fetch(`${baseUrl}${BASE}/admin/modal-image-upload`, {
    method: 'POST',
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
    body: form,
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
      const err = new Error(uploadErrorMessage(res.status, data))
      err.status = res.status
      throw err
    }
    return data
  })
}
