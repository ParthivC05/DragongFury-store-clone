/**
 * Tracks backend reachability so admin can show a maintenance screen
 * when the shared API is down.
 */

const STATUS_PATH = '/api/status'
const PROBE_INTERVAL_MS = 20000
const FAILURE_THRESHOLD = 3
const RECOVERY_THRESHOLD = 2

let failureCount = 0
let successCount = 0
let maintenance = false
let probeTimer = null
const listeners = new Set()

function apiStatusUrl() {
  const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
  if (!import.meta.env.DEV) {
    return `${configured}${STATUS_PATH}`
  }
  if (!configured) return STATUS_PATH
  try {
    const u = new URL(configured, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const isLocal =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
    if (isLocal) return STATUS_PATH
  } catch {
    /* keep */
  }
  return `${configured}${STATUS_PATH}`
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(maintenance)
    } catch {
      /* ignore */
    }
  }
}

function setMaintenance(next) {
  if (maintenance === next) return
  maintenance = next
  notify()
}

export function isBackendInMaintenance() {
  return maintenance
}

export function subscribeBackendMaintenance(listener) {
  listeners.add(listener)
  listener(maintenance)
  return () => listeners.delete(listener)
}

export function reportBackendReachable() {
  failureCount = 0
  successCount += 1
  if (maintenance && successCount >= RECOVERY_THRESHOLD) {
    setMaintenance(false)
  }
}

export function reportBackendUnreachable() {
  successCount = 0
  failureCount += 1
  if (!maintenance && failureCount >= FAILURE_THRESHOLD) {
    setMaintenance(true)
  }
}

export async function probeBackendHealth() {
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    const res = await fetch(apiStatusUrl(), {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal
    })
    window.clearTimeout(timeout)
    if (res.ok) {
      reportBackendReachable()
      return true
    }
    if (res.status >= 500) {
      reportBackendUnreachable()
      return false
    }
    reportBackendReachable()
    return true
  } catch {
    reportBackendUnreachable()
    return false
  }
}

export function startBackendHealthMonitor() {
  if (probeTimer != null) return
  probeBackendHealth()
  probeTimer = window.setInterval(probeBackendHealth, PROBE_INTERVAL_MS)
}

export function stopBackendHealthMonitor() {
  if (probeTimer == null) return
  window.clearInterval(probeTimer)
  probeTimer = null
}
