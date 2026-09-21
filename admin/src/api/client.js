import { reportBackendReachable, reportBackendUnreachable } from '../utils/backendHealth'
import { isStaffShiftExemptRequest, staffShiftHasEnded } from '../utils/staffShiftSession'

const baseUrl = import.meta.env.VITE_API_URL || ''
export const TOKEN_KEY = 'admin_token'

/** True when the stored JWT is missing, malformed, or past exp. */
export function isAdminTokenUnusable(token) {
  if (!token || typeof token !== 'string') return true
  const parts = token.split('.')
  if (parts.length < 2) return true
  try {
    const json = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = json.length % 4 === 0 ? '' : '='.repeat(4 - (json.length % 4))
    const payload = JSON.parse(atob(json + pad))
    if (payload?.exp == null) return false
    return Number(payload.exp) * 1000 <= Date.now()
  } catch {
    return true
  }
}

function isAuthSessionFailure(status, data = {}) {
  if (status !== 401 && status !== 403) return false
  const code = String(data?.code || '').toLowerCase()
  const msg = String(data?.message || '').toLowerCase()
  const authHints = [
    'token',
    'jwt',
    'unauthorized',
    'invalid signature',
    'session',
    'expired',
    'login'
  ]
  const hasAuthCode = code.includes('auth') || code.includes('token') || code.includes('unauth')
  const hasAuthMessage = authHints.some((hint) => msg.includes(hint))
  // Never force logout for generic permission errors.
  if (status === 403 && !hasAuthCode && !hasAuthMessage) return false
  return hasAuthCode || hasAuthMessage
}

function handleUnauthorizedResponse(status, data, path) {
  // Avoid forced logout for arbitrary endpoint/business errors.
  // AuthContext/getMe flow handles normal auth bootstrapping and refresh.
  const isAuthEndpoint = typeof path === 'string' && (
    path.includes('/api/admin/me') || path.includes('/api/admin/auth/')
  )
  if (!isAuthEndpoint) return
  if (!isAuthSessionFailure(status, data)) return
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return
  localStorage.removeItem(TOKEN_KEY)
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login')
  }
}

function parseContentDispositionFileName(header) {
  if (!header) return ''
  const utf = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
  if (utf) {
    try {
      return decodeURIComponent(utf[1].trim())
    } catch {
      return utf[1].trim()
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header)
  if (quoted) return quoted[1]
  const plain = /filename\s*=\s*([^;]+)/i.exec(header)
  return plain ? plain[1].trim() : ''
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (
    method !== 'GET' &&
    !isStaffShiftExemptRequest(path, method) &&
    staffShiftHasEnded()
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('staff-shift-ended'))
    }
    const err = new Error('Your shift has ended. Enter your closing balance and check out.')
    err.status = 403
    err.code = 'STAFF_SHIFT_ENDED'
    throw err
  }

  const token = localStorage.getItem(TOKEN_KEY)
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }
  try {
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers })
    reportBackendReachable()
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      handleUnauthorizedResponse(res.status, data, path)
      if (
        data?.code === 'STAFF_SHIFT_ENDED' &&
        method !== 'GET' &&
        typeof window !== 'undefined'
      ) {
        window.dispatchEvent(new CustomEvent('staff-shift-ended'))
      }
      const err = new Error(data?.message || res.statusText || 'Request failed')
      err.status = res.status
      err.code = data?.code
      err.body = data
      throw err
    }
    return data
  } catch (err) {
    const msg = String(err?.message || err || '').toLowerCase()
    if (
      err?.name === 'TypeError' ||
      err?.name === 'AbortError' ||
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('load failed')
    ) {
      reportBackendUnreachable()
    }
    throw err
  }
}

async function requestBlob(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (
    method !== 'GET' &&
    !isStaffShiftExemptRequest(path, method) &&
    staffShiftHasEnded()
  ) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('staff-shift-ended'))
    }
    const err = new Error('Your shift has ended. Enter your closing balance and check out.')
    err.status = 403
    err.code = 'STAFF_SHIFT_ENDED'
    throw err
  }

  const token = localStorage.getItem(TOKEN_KEY)
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }
  try {
    const res = await fetch(`${baseUrl}${path}`, { ...options, headers })
    reportBackendReachable()
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      handleUnauthorizedResponse(res.status, data, path)
      if (
        data?.code === 'STAFF_SHIFT_ENDED' &&
        method !== 'GET' &&
        typeof window !== 'undefined'
      ) {
        window.dispatchEvent(new CustomEvent('staff-shift-ended'))
      }
      const err = new Error(data?.message || res.statusText || 'Request failed')
      err.status = res.status
      err.code = data?.code
      err.body = data
      throw err
    }
    const blob = await res.blob()
    const rowHeader = res.headers.get('X-Export-Row-Count')
    const parsedCount = rowHeader == null || rowHeader === '' ? NaN : Number(rowHeader)
    return {
      blob,
      fileName: parseContentDispositionFileName(res.headers.get('Content-Disposition')),
      rowCount: Number.isFinite(parsedCount) ? parsedCount : null
    }
  } catch (err) {
    const msg = String(err?.message || err || '').toLowerCase()
    if (
      err?.name === 'TypeError' ||
      err?.name === 'AbortError' ||
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('load failed')
    ) {
      reportBackendUnreachable()
    }
    throw err
  }
}

export { request, requestBlob, baseUrl }
