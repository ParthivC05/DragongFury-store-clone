import { request, baseUrl, TOKEN_KEY } from './client'
import { DESKTOP_MAX_BYTES, DESKTOP_MAX_LABEL, assertWebpUpload } from '../utils/adminImageUploadConstraints'

const BASE = '/api/welcome-signup-bonus'
export const MAX_MODAL_IMAGE_BYTES = DESKTOP_MAX_BYTES
export const MAX_MODAL_IMAGE_LABEL = DESKTOP_MAX_LABEL

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
      `Upload failed. Image must be ${MAX_MODAL_IMAGE_LABEL} or smaller. Only WEBP is allowed.`
    )
    next.cause = err
    return next
  }
  return err instanceof Error ? err : new Error('Upload failed. Please try again.')
}

export function listWelcomeSignupBonusStores() {
  return request(`${BASE}/admin/stores`)
}

export function updateWelcomeSignupBonusStore(payload) {
  return request(`${BASE}/admin/stores`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

/** Toggle the activate welcome/refer bonus play popup for one store. */
export function updateActivateBonusModal(payload) {
  return request(`${BASE}/admin/activate-bonus-modal`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

/** Upload landing welcome-bonus modal image to S3. Returns { data: { url } }. */
export function uploadWelcomeSignupBonusModalImage(file) {
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
    body: form
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
