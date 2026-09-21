import { isWithinShiftWindow } from './shiftWindow'

let snapshot = null

export function setStaffShiftSnapshot(status) {
  if (!status?.punchRequired || !status.shift) {
    snapshot = null
    return
  }
  snapshot = {
    punchRequired: true,
    isOffShift: Boolean(status.isOffShift),
    timezone: status.shift.timezone,
    startTime: status.shift.startTime,
    endTime: status.shift.endTime
  }
}

export function clearStaffShiftSnapshot() {
  snapshot = null
}

export function staffShiftHasEnded() {
  if (!snapshot?.punchRequired) return false
  if (snapshot.isOffShift) return false
  return !isWithinShiftWindow(
    new Date(),
    snapshot.timezone,
    snapshot.startTime,
    snapshot.endTime
  )
}

export function isStaffShiftExemptRequest(path, method) {
  const m = String(method || 'GET').toUpperCase()
  const p = String(path || '')
  if (m === 'GET' && (p.includes('/api/admin/me/attendance') || p.endsWith('/api/admin/me') || p.includes('/api/admin/me?'))) {
    return true
  }
  if (m === 'POST' && p.includes('/api/admin/me/attendance/check-out')) return true
  return false
}
