import { request, baseUrl, TOKEN_KEY } from './client'
import { encodePasswordsInBody } from '../utils/passwordEncrypt'

export { TOKEN_KEY }

/**
 * Resolve storeCode for admin auth.
 * Priority: VITE_ADMIN_STORE_CODE → hostname lookup in VITE_ADMIN_HOST_STORE_MAP.
 * Backend also maps Origin host via ADMIN_HOST_STORE_MAP (source of truth in production).
 */
function adminStoreCodePayload() {
  const fixed = import.meta.env.VITE_ADMIN_STORE_CODE
  if (fixed != null && typeof fixed === 'string' && fixed.trim()) {
    return { storeCode: fixed.trim() }
  }

  const mapRaw = import.meta.env.VITE_ADMIN_HOST_STORE_MAP
  if (mapRaw != null && typeof mapRaw === 'string' && mapRaw.trim() && typeof window !== 'undefined') {
    const host = String(window.location.hostname || '').toLowerCase()
    const map = parseHostStoreMap(mapRaw.trim())
    if (host && map[host]) return { storeCode: map[host] }
  }

  return {}
}

function parseHostStoreMap(raw) {
  const map = Object.create(null)
  if (!raw) return map
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw)
      for (const [h, code] of Object.entries(obj || {})) {
        const host = String(h || '').trim().toLowerCase()
        const c = code != null ? String(code).trim().toLowerCase() : ''
        if (host && c) map[host] = c
      }
      return map
    } catch {
      /* fall through */
    }
  }
  for (const part of raw.split(',')) {
    const piece = part.trim()
    if (!piece) continue
    const idx = piece.lastIndexOf(':')
    if (idx <= 0) continue
    const host = piece.slice(0, idx).trim().toLowerCase()
    const code = piece.slice(idx + 1).trim().toLowerCase()
    if (host && code) map[host] = code
  }
  return map
}

function adminPanelHostPayload() {
  if (typeof window === 'undefined') return {}
  const host = String(window.location.hostname || '').trim().toLowerCase()
  return host ? { adminPanelHost: host } : {}
}

function adminAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined' && window.location.hostname) {
    headers['X-Admin-Panel-Host'] = String(window.location.hostname).toLowerCase()
  }
  return headers
}

/** Message shown when Mailjet/email service is unavailable (admin). */
const EMAIL_SERVICE_ERROR_MESSAGE = 'We are facing some issue. Please try again later.'

function messageForAuthError(data, status, fallback) {
  if (status === 503 || data?.code === 'EMAIL_SERVICE_UNAVAILABLE') {
    return EMAIL_SERVICE_ERROR_MESSAGE
  }
  return data?.message || fallback
}

export async function login(email, password) {
  const body = encodePasswordsInBody({
    email,
    password,
    ...adminStoreCodePayload(),
    ...adminPanelHostPayload(),
  })
  const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(messageForAuthError(data, res.status, 'Login failed'))
    err.status = res.status
    err.code = data.code
    err.body = data
    throw err
  }
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token)
  return data
}

export async function requestOffShiftLogin(email, password, reason) {
  const body = encodePasswordsInBody({
    email,
    password,
    reason,
    ...adminStoreCodePayload(),
    ...adminPanelHostPayload(),
  })
  const res = await fetch(`${baseUrl}/api/admin/auth/off-shift-login-request`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(messageForAuthError(data, res.status, 'Request failed'))
    err.status = res.status
    err.code = data.code
    err.body = data
    throw err
  }
  return data
}

export async function invalidateLoginOtp(email) {
  await fetch(`${baseUrl}/api/admin/auth/invalidate-login-otp`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ email, ...adminStoreCodePayload(), ...adminPanelHostPayload() }),
  })
}

export async function resendLoginOtp(email) {
  const res = await fetch(`${baseUrl}/api/admin/auth/resend-login-otp`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ email, ...adminStoreCodePayload(), ...adminPanelHostPayload() }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(messageForAuthError(data, res.status, 'Request failed'))
    err.status = res.status
    err.code = data.code
    throw err
  }
  return data
}

export async function verifyLoginOtp(email, otp) {
  const res = await fetch(`${baseUrl}/api/admin/auth/verify-login-otp`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ email, otp, ...adminStoreCodePayload(), ...adminPanelHostPayload() }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(messageForAuthError(data, res.status, 'Verification failed'))
    err.status = res.status
    err.code = data.code
    err.body = data
    throw err
  }
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token)
  return data
}

export async function getMe() {
  return request('/api/admin/me')
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function forgotPassword(email) {
  const res = await fetch(`${baseUrl}/api/admin/auth/forgot-password`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ email, ...adminStoreCodePayload(), ...adminPanelHostPayload() }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(messageForAuthError(data, res.status, 'Request failed'))
  return data
}

export async function resetPassword(token, newPassword) {
  const body = encodePasswordsInBody({ token, newPassword, ...adminPanelHostPayload() })
  const res = await fetch(`${baseUrl}/api/admin/auth/reset-password`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || res.statusText || 'Request failed')
  return data
}

/** Change password when logged in (current password required; no email). */
export async function changePassword(currentPassword, newPassword) {
  const body = encodePasswordsInBody({ currentPassword, newPassword })
  return request('/api/admin/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
