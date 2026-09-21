import { request, baseUrl, TOKEN_KEY } from './client'
import { DESKTOP_MAX_BYTES, DESKTOP_MAX_LABEL, assertWebpUpload } from '../utils/adminImageUploadConstraints'

const BASE = '/api/landing-payment-links'
export const MAX_MODAL_IMAGE_BYTES = DESKTOP_MAX_BYTES
export const MAX_MODAL_IMAGE_LABEL = DESKTOP_MAX_LABEL
export const DEFAULT_REDIRECT_DELAY_SECONDS = 3.5
export const MAX_REDIRECT_MODALS = 10

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

function normalizeUploadNetworkError(err) {
  if (err?.status) return err
  const msg = String(err?.message || '')
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    const next = new Error(
      `Upload failed. Image must be ${MAX_MODAL_IMAGE_LABEL} or smaller. Only WEBP is allowed.`,
    )
    next.cause = err
    return next
  }
  return err instanceof Error ? err : new Error('Upload failed. Please try again.')
}

export function getLandingPaymentLinksSettings() {
  return request(`${BASE}/admin/settings`)
}

export function updateLandingPaymentLinksSettings(landingPaymentLinks) {
  return request(`${BASE}/admin/settings`, {
    method: 'PUT',
    body: JSON.stringify({ landingPaymentLinks }),
  })
}

export function clearLandingPaymentLinksSettings() {
  return request(`${BASE}/admin/settings`, { method: 'DELETE' })
}

export function getStoreLandingPaymentLinks(storeId) {
  return request(`/api/admin/stores/${storeId}/landing-payment-links`)
}

export function updateStoreLandingPaymentLinks(storeId, landingPaymentLinks) {
  return request(`/api/admin/stores/${storeId}/landing-payment-links`, {
    method: 'PUT',
    body: JSON.stringify({ landingPaymentLinks }),
  })
}

export function clearStoreLandingPaymentLinks(storeId) {
  return request(`/api/admin/stores/${storeId}/landing-payment-links`, { method: 'DELETE' })
}

/** Upload landing payment redirect modal image to S3. Returns { data: { url } }. */
export function uploadLandingPaymentLinksModalImage(file) {
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
  })
    .then(async (res) => {
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
    .catch((err) => {
      throw normalizeUploadNetworkError(err)
    })
}
