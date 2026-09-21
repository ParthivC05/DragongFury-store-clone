export const WEBP_ACCEPT = 'image/webp,.webp'
export const MOBILE_MAX_BYTES = 100 * 1024
export const DESKTOP_MAX_BYTES = 150 * 1024
export const MOBILE_MAX_LABEL = '100 KB'
export const DESKTOP_MAX_LABEL = '150 KB'

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`
}

export function assertWebpUpload(file, { maxBytes, label = 'Image' } = {}) {
  if (!file) {
    const err = new Error('No image file selected.')
    err.status = 400
    throw err
  }
  const typeOk = file.type === 'image/webp' || /\.webp$/i.test(file.name || '')
  if (!typeOk) {
    const err = new Error('Only WEBP images are allowed.')
    err.status = 400
    throw err
  }
  if (file.size > maxBytes) {
    const err = new Error(
      `${label} must be ${formatKb(maxBytes)} or smaller (got ${formatKb(file.size)}).`
    )
    err.status = 413
    throw err
  }
}
