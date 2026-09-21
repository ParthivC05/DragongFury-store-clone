import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { checkInAttendance, checkOutAttendance, getMyAttendance } from '../api/admin'
import { useAuth } from './AuthContext'
import { ROLES } from '../constants/roles'
import { isWithinShiftWindow } from '../utils/shiftWindow'
import { clearStaffShiftSnapshot, setStaffShiftSnapshot } from '../utils/staffShiftSession'

const StaffAttendanceContext = createContext(null)

function formatElapsed(checkInAt, nowMs) {
  if (!checkInAt) return '0h 00m 00s'
  const start = new Date(checkInAt).getTime()
  const total = Math.max(0, Math.floor((nowMs - start) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

function isShiftEndedNow(status) {
  if (!status?.punchRequired || !status.shift) return false
  if (status.isOffShift) return false
  return !isWithinShiftWindow(
    new Date(),
    status.shift.timezone,
    status.shift.startTime,
    status.shift.endTime
  )
}

export function StaffAttendanceProvider({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  const isStoreStaff = user?.role === ROLES.STORE_ADMIN && user?.storeRoleId != null
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [nowMs, setNowMs] = useState(Date.now())
  const [promptCheckout, setPromptCheckout] = useState(false)

  const applyStatus = useCallback((data) => {
    setStatus(data)
    setStaffShiftSnapshot(data)
    return data
  }, [])

  const refresh = useCallback(async () => {
    if (!isStoreStaff) {
      setStatus(null)
      clearStaffShiftSnapshot()
      setPromptCheckout(false)
      return null
    }
    setLoading(true)
    try {
      const data = await getMyAttendance()
      return applyStatus(data)
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [isStoreStaff, applyStatus])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!isStoreStaff) return
    if (isShiftEndedNow(status) && status?.openSession) {
      setPromptCheckout(true)
    }
  }, [location.pathname, isStoreStaff, status])

  useEffect(() => {
    const onEnded = () => {
      if (status?.openSession) setPromptCheckout(true)
    }
    window.addEventListener('staff-shift-ended', onEnded)
    return () => window.removeEventListener('staff-shift-ended', onEnded)
  }, [status?.openSession])

  useEffect(() => {
    if (!isStoreStaff || !status?.openSession?.checkInAt) return undefined
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [isStoreStaff, status?.openSession?.checkInAt])

  const checkIn = useCallback(async (openingBalance) => {
    const data = await checkInAttendance(openingBalance)
    await refresh()
    return data
  }, [refresh])

  const checkOut = useCallback(async (closingBalance) => {
    const data = await checkOutAttendance(closingBalance)
    setPromptCheckout(false)
    clearStaffShiftSnapshot()
    await refresh()
    return data
  }, [refresh])

  const punchRequired = Boolean(status?.punchRequired)
  const openSession = status?.openSession || null
  const mustCheckOut = Boolean(promptCheckout && openSession)

  const value = useMemo(() => ({
    isStoreStaff,
    loading,
    punchRequired,
    shift: status?.shift || null,
    inShiftWindow: !isShiftEndedNow(status),
    isOffShift: Boolean(status?.isOffShift),
    openSession,
    needsCheckIn: punchRequired && !openSession && !isShiftEndedNow(status),
    sessionBlocked: mustCheckOut,
    mustCheckOut,
    mustLeave: false,
    elapsedLabel: formatElapsed(openSession?.checkInAt, nowMs),
    refresh,
    checkIn,
    checkOut
  }), [
    isStoreStaff,
    loading,
    punchRequired,
    status,
    openSession,
    mustCheckOut,
    nowMs,
    refresh,
    checkIn,
    checkOut
  ])

  return (
    <StaffAttendanceContext.Provider value={value}>
      {children}
    </StaffAttendanceContext.Provider>
  )
}

export function useStaffAttendance() {
  return useContext(StaffAttendanceContext) || {
    isStoreStaff: false,
    loading: false,
    punchRequired: false,
    shift: null,
    inShiftWindow: false,
    isOffShift: false,
    openSession: null,
    needsCheckIn: false,
    sessionBlocked: false,
    mustCheckOut: false,
    mustLeave: false,
    elapsedLabel: '0h 00m 00s',
    refresh: async () => null,
    checkIn: async () => {},
    checkOut: async () => {}
  }
}
