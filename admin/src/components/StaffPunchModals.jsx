import { useState } from 'react'
import { useStaffAttendance } from '../context/StaffAttendanceContext'
import { useToast } from '../context/ToastContext'
import './StaffPunchModals.css'

export default function StaffPunchModals({ checkoutOpen, onCheckoutClose, onCheckedOut }) {
  const attendance = useStaffAttendance()
  const toast = useToast()
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  const [saving, setSaving] = useState(false)

  if (!attendance) return null

  const forceCheckout = Boolean(attendance.mustCheckOut)
  const showCheckout = (checkoutOpen || forceCheckout) && attendance.openSession
  const canStaySignedIn = checkoutOpen && !forceCheckout

  const handleCheckIn = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await attendance.checkIn(openingBalance)
      toast.success('Checked in. Your shift timer is running.')
      setOpeningBalance('')
    } catch (err) {
      toast.error(err.message || 'Check-in failed')
    } finally {
      setSaving(false)
    }
  }

  const handleCheckOut = async (e) => {
    e.preventDefault()
    const amount = Number(closingBalance)
    if (closingBalance === '' || !Number.isFinite(amount) || amount < 0) {
      toast.error('Closing balance is required before you can check out.')
      return
    }
    setSaving(true)
    try {
      await attendance.checkOut(amount)
      toast.success('Checked out. Working hours saved.')
      setClosingBalance('')
      onCheckedOut?.()
    } catch (err) {
      toast.error(err.message || 'Check-out failed')
    } finally {
      setSaving(false)
    }
  }

  const shiftLabel = attendance.shift
    ? `${attendance.shift.timezone} ${attendance.shift.startTime}–${attendance.shift.endTime}`
    : ''

  return (
    <>
      {attendance.needsCheckIn && (
        <div className="staff-punch-backdrop">
          <div className="staff-punch-modal" role="dialog" aria-labelledby="staff-checkin-title">
            <h3 id="staff-checkin-title">Check in to start your shift</h3>
            <p className="staff-punch-copy">
              Enter today’s opening balance to start the working-hours timer.
              {shiftLabel ? ` Your shift: ${shiftLabel}.` : ''}
              {attendance.isOffShift ? ' You are logged in on approved off-shift time.' : ''}
            </p>
            <form onSubmit={handleCheckIn}>
              <label>
                Opening balance
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
                {saving ? 'Checking in…' : 'Check in'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showCheckout && (
        <div className="staff-punch-backdrop">
          <div className="staff-punch-modal" role="dialog" aria-labelledby="staff-checkout-title">
            <h3 id="staff-checkout-title">
              {forceCheckout ? 'Your shift has ended' : 'Please check out'}
            </h3>
            <p className="staff-punch-copy">
              {forceCheckout
                ? 'Enter today’s closing balance and check out. You cannot continue working after your shift.'
                : 'Enter today’s closing balance so we can save your working hours before you log out.'}
              {' '}Time so far: <strong>{attendance.elapsedLabel}</strong>
            </p>
            <form onSubmit={handleCheckOut}>
              <label>
                Closing balance
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={closingBalance}
                  onChange={(e) => setClosingBalance(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              <div className="staff-punch-actions">
                {canStaySignedIn && (
                  <button type="button" className="admin-btn admin-btn-secondary" onClick={onCheckoutClose} disabled={saving}>
                    Stay signed in
                  </button>
                )}
                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  disabled={saving || closingBalance === '' || Number(closingBalance) < 0 || !Number.isFinite(Number(closingBalance))}
                >
                  {saving ? 'Checking out…' : 'Check out and log out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
