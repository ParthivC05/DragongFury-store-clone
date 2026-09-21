import { request, baseUrl, TOKEN_KEY } from './client'
import {
  MOBILE_MAX_BYTES,
  DESKTOP_MAX_BYTES,
  MOBILE_MAX_LABEL,
  DESKTOP_MAX_LABEL,
  assertWebpUpload
} from '../utils/adminImageUploadConstraints'

const BASE = '/api/dashboard-slideshow'
export const MAX_SLIDE_IMAGE_BYTES = DESKTOP_MAX_BYTES
export const MAX_SLIDE_IMAGE_LABEL = DESKTOP_MAX_LABEL
export const MAX_MOBILE_SLIDE_IMAGE_BYTES = MOBILE_MAX_BYTES
export const MAX_MOBILE_SLIDE_IMAGE_LABEL = MOBILE_MAX_LABEL

/** Exact sizes store admins must upload. */
export const SLIDE_IMAGE_SIZES = {
  desktop: { width: 2172, height: 724, label: '2172 × 724' },
  mobile: { width: 1774, height: 887, label: '1774 × 887' }
}

export const DESKTOP_DIMENSION_LABEL = SLIDE_IMAGE_SIZES.desktop.label
export const MOBILE_DIMENSION_LABEL = SLIDE_IMAGE_SIZES.mobile.label

function maxBytesForKind(kind) {
  return kind === 'mobile' ? MOBILE_MAX_BYTES : DESKTOP_MAX_BYTES
}

function maxLabelForKind(kind) {
  return kind === 'mobile' ? MOBILE_MAX_LABEL : DESKTOP_MAX_LABEL
}

function uploadErrorMessage(status, data, kind = 'desktop') {
  if (status === 413) {
    return `Image must be ${maxLabelForKind(kind)} or smaller. Only WEBP is allowed.`
  }
  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim()
  }
  const size = SLIDE_IMAGE_SIZES[kind] || SLIDE_IMAGE_SIZES.desktop
  const kindLabel = kind === 'mobile' ? 'Phone' : 'Computer'
  if (status === 400) {
    return `Invalid ${kindLabel.toLowerCase()} image. Use WEBP under ${maxLabelForKind(kind)}, exactly ${size.label} pixels.`
  }
  return 'Upload failed. Please try again.'
}

function normalizeUploadNetworkError(err) {
  if (err?.status) return err
  const msg = String(err?.message || '')
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    const next = new Error(
      `Upload failed. Image must be ${MAX_SLIDE_IMAGE_LABEL} or smaller. Only WEBP is allowed.`
    )
    next.cause = err
    return next
  }
  return err instanceof Error ? err : new Error('Upload failed. Please try again.')
}

export function listDashboardSlideshowStores() {
  return request(`${BASE}/admin/stores`)
}

export function updateDashboardSlideshowStore(payload) {
  return request(`${BASE}/admin/stores`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

/** Read natural width/height of an image file in the browser. */
export function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No image file selected.'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight
      URL.revokeObjectURL(url)
      resolve({ width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image dimensions.'))
    }
    img.src = url
  })
}

export async function assertSlideImageDimensions(file, kind = 'desktop') {
  const size = SLIDE_IMAGE_SIZES[kind] || SLIDE_IMAGE_SIZES.desktop
  const { width, height } = await readImageDimensions(file)
  if (width !== size.width || height !== size.height) {
    const kindLabel = kind === 'mobile' ? 'Phone' : 'Computer'
    const err = new Error(
      `${kindLabel} image must be exactly ${size.label} pixels (got ${width}×${height}).`
    )
    err.status = 400
    throw err
  }
  return { width, height, kind }
}

/**
 * Upload slideshow banner image to S3.
 * @param {File} file
 * @param {'desktop'|'mobile'} kind
 */
export async function uploadDashboardSlideshowImage(file, kind = 'desktop') {
  if (!file) {
    return Promise.reject(new Error('No image file selected.'))
  }
  const imageKind = kind === 'mobile' ? 'mobile' : 'desktop'
  const kindLabel = imageKind === 'mobile' ? 'Phone image' : 'Computer image'
  assertWebpUpload(file, { maxBytes: maxBytesForKind(imageKind), label: kindLabel })

  await assertSlideImageDimensions(file, imageKind)

  const token = localStorage.getItem(TOKEN_KEY)
  const form = new FormData()
  form.append('file', file)
  form.append('kind', imageKind)
  return fetch(`${baseUrl}${BASE}/admin/image-upload`, {
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
        const err = new Error(uploadErrorMessage(res.status, data, imageKind))
        err.status = res.status
        throw err
      }
      return data
    })
    .catch((err) => {
      throw normalizeUploadNetworkError(err)
    })
}
