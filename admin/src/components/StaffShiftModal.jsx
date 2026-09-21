import { useEffect, useState } from 'react'
import { getStaffShiftTimezones, saveStaffShift, deleteStaffShift } from '../api/admin'
import TimezoneSelect from './TimezoneSelect'
import { useToast } from '../context/ToastContext'
import './StaffShiftModal.css'

function shiftScopePayload(staff, extra = {}) {
  const payload = { ...extra }
  if (staff?.distributorCode) payload.distributorCode = staff.distributorCode
  if (staff?.storeCode) payload.storeCode = staff.storeCode
  return payload
}

export default function StaffShiftModal({ staff, shift, onClose, onSaved }) {
  const toast = useToast()
  const [timezones, setTimezones] = useState([])
  const [timezone, setTimezone] = useState(shift?.timezone || '')
  const [startTime, setStartTime] = useState(shift?.startTime || '09:00')
  const [endTime, setEndTime] = useState(shift?.endTime || '17:00')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    getStaffShiftTimezones()
      .then((res) => setTimezones(res.list || []))
      .catch(() => setTimezones([]))
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!timezone || !startTime || !endTime) {
      toast.error('Timezone, start time, and end time are required.')
      return
    }
    setSaving(true)
    try {
      const res = await saveStaffShift(staff.userId, shiftScopePayload(staff, { timezone, startTime, endTime }))
      toast.success(res.message || 'Shift saved.')
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save shift')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      const res = await deleteStaffShift(staff.userId, shiftScopePayload(staff))
      toast.success(res.message || 'Shift removed.')
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to remove shift')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="staff-shift-backdrop" onClick={onClose} role="presentation">
      <div className="staff-shift-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="staff-shift-title">
        <h3 id="staff-shift-title">Allocate shift</h3>
        <p className="staff-shift-subtitle">
          {staff.email || staff.username}. Until a shift is set, this staff member can log in at any time.
          After you save a shift, they can log in only during that window (in the selected timezone).
        </p>
        <form onSubmit={handleSave}>
          <label>
            Timezone
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              timezones={timezones}
              required
            />
          </label>
          <div className="staff-shift-times">
            <label>
              Shift start
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </label>
            <label>
              Shift end
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            </label>
          </div>
          <div className="staff-shift-actions">
            {shift?.id ? (
              <button type="button" className="admin-btn admin-btn-danger" onClick={handleRemove} disabled={saving || removing}>
                {removing ? 'Removing…' : 'Remove shift'}
              </button>
            ) : <span />}
            <div className="staff-shift-actions-right">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving || removing}>Cancel</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || removing}>
                {saving ? 'Saving…' : 'Save shift'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
