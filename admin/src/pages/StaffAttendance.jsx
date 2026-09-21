import { useEffect, useMemo, useState } from 'react'
import {
  approveOffShiftRequest,
  getOffShiftRequests,
  getStaffAttendanceReport,
  getStaffAttendanceStaffOptions,
  grantOffShiftAccess,
  rejectOffShiftRequest
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { getPresetRange, PRESETS, formatTransactionDateTime } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import './StaffAttendance.css'
import './Users.css'

const defaultRange = getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)

function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

export default function StaffAttendance() {
  const toast = useToast()
  const [tab, setTab] = useState('report')
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [storeCode, setStoreCode] = useState('')
  const [applied, setApplied] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    storeCode: ''
  })
  const [report, setReport] = useState({ list: [], summary: null })
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [filterOptions, setFilterOptions] = useState({ stores: [] })
  const [grantUserId, setGrantUserId] = useState('')
  const [grantHours, setGrantHours] = useState(24)
  const [grantStaff, setGrantStaff] = useState([])
  const [granting, setGranting] = useState(false)

  useEffect(() => {
    getStaffAttendanceStaffOptions()
      .then((res) => {
        const list = (res.list || []).filter((s) => s.isActive !== false)
        setGrantStaff(list)
        const stores = []
        const seen = new Set()
        for (const s of list) {
          const code = String(s.storeCode || '').trim()
          if (!code || seen.has(code)) continue
          seen.add(code)
          stores.push({ storeCode: code, distributorCode: s.distributorCode })
        }
        setFilterOptions({ stores })
      })
      .catch(() => {
        setGrantStaff([])
        setFilterOptions({ stores: [] })
      })
  }, [])

  const loadReport = () => {
    setLoading(true)
    getStaffAttendanceReport({
      dateFrom: applied.startDate,
      dateTo: applied.endDate,
      storeCode: applied.storeCode || undefined
    })
      .then(setReport)
      .catch((err) => toast.error(err.message || 'Failed to load report'))
      .finally(() => setLoading(false))
  }

  const loadRequests = () => {
    setLoading(true)
    getOffShiftRequests({ status: 'pending' })
      .then((res) => setRequests(res.list || []))
      .catch((err) => toast.error(err.message || 'Failed to load requests'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (tab === 'report') loadReport()
    else loadRequests()
  }, [tab, applied.startDate, applied.endDate, applied.storeCode])

  const storeOptions = useMemo(() => filterOptions.stores || [], [filterOptions.stores])

  const handleApprove = async (row) => {
    try {
      const res = await approveOffShiftRequest(row.id, { validHours: 24 })
      toast.success(res.message || 'Approved.')
      loadRequests()
    } catch (err) {
      toast.error(err.message || 'Approve failed')
    }
  }

  const handleReject = async (row) => {
    try {
      const res = await rejectOffShiftRequest(row.id)
      toast.success(res.message || 'Rejected.')
      loadRequests()
    } catch (err) {
      toast.error(err.message || 'Reject failed')
    }
  }

  const handleGrant = async (e) => {
    e.preventDefault()
    if (!grantUserId) {
      toast.error('Select a staff member.')
      return
    }
    setGranting(true)
    try {
      const res = await grantOffShiftAccess({ userId: Number(grantUserId), validHours: Number(grantHours) || 24 })
      toast.success(res.message || 'Off-shift login granted.')
      setGrantUserId('')
      loadRequests()
    } catch (err) {
      toast.error(err.message || 'Grant failed')
    } finally {
      setGranting(false)
    }
  }

  return (
    <div className="staff-attendance-page">
      <div className="page-header">
        <h2>Staff attendance</h2>
        <p className="page-subtitle">
          Opening and closing balances, approved deposits and withdrawals, and working hours for store staff.
          Approve off-shift login when staff need to work outside their allocated time.
        </p>
      </div>

      <div className="staff-attendance-tabs">
        <button type="button" className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>Report</button>
        <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Off-shift requests</button>
      </div>

      {tab === 'report' && (
        <>
          <div className="users-filters-card" style={{ marginBottom: '1rem' }}>
            <div className="users-filters-body">
              <DateRangeFilter
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
              />
              <div className="users-filter-field">
                <label htmlFor="staff-att-store">Store</label>
                <select id="staff-att-store" value={storeCode} onChange={(e) => setStoreCode(e.target.value)}>
                  <option value="">All stores</option>
                  {storeOptions.map((s) => (
                    <option key={`${s.distributorCode}-${s.storeCode}`} value={s.storeCode}>{s.storeCode}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={() => setApplied({ startDate, endDate, storeCode })}
              >
                Apply
              </button>
            </div>
          </div>

          {report.summary && (
            <div className="staff-attendance-summary">
              <div><strong>{report.summary.sessions}</strong> sessions</div>
              <div>Hours: <strong>{report.summary.totalWorkingHoursLabel}</strong></div>
              <div>Approved deposits: <strong>{money(report.summary.totalApprovedDeposits)}</strong></div>
              <div>Approved withdrawals: <strong>{money(report.summary.totalApprovedWithdrawals)}</strong></div>
            </div>
          )}

          {loading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Store</th>
                    <th>Shift</th>
                    <th>Check in</th>
                    <th>Check out</th>
                    <th>Opening</th>
                    <th>Closing</th>
                    <th>Hours</th>
                    <th>Approved deposits</th>
                    <th>Approved withdrawals</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.list || []).length === 0 ? (
                    <tr><td colSpan={10}>No check-in records in this date range.</td></tr>
                  ) : report.list.map((row) => (
                    <tr key={row.id}>
                      <td>{row.staff?.displayName || row.staff?.email || row.userId}</td>
                      <td>{row.storeCode}</td>
                      <td>
                        {row.timezone
                          ? `${row.timezone} ${row.shiftStartTime || ''}–${row.shiftEndTime || ''}`
                          : '—'}
                        {row.isOffShift ? ' (off-shift)' : ''}
                      </td>
                      <td>{formatTransactionDateTime(row.checkInAt)}</td>
                      <td>{row.checkOutAt ? formatTransactionDateTime(row.checkOutAt) : 'In progress'}</td>
                      <td>{money(row.openingBalance)}</td>
                      <td>{row.closingBalance == null ? '—' : money(row.closingBalance)}</td>
                      <td>{row.workingHoursLabel}</td>
                      <td>{money(row.approvedDepositsAmount)}</td>
                      <td>{money(row.approvedWithdrawalsAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'requests' && (
        <>
          <form className="staff-attendance-grant" onSubmit={handleGrant}>
            <h3>Allow off-shift login</h3>
            <p>Grant access without waiting for a staff request. Valid for the hours you choose.</p>
            <div className="staff-attendance-grant-row">
              <select value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} required>
                <option value="">Select store staff</option>
                {grantStaff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.email || s.username} {s.storeCode ? `(${s.storeCode})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="72"
                value={grantHours}
                onChange={(e) => setGrantHours(e.target.value)}
                aria-label="Valid hours"
              />
              <button type="submit" className="admin-btn admin-btn-primary" disabled={granting}>
                {granting ? 'Granting…' : 'Allow login'}
              </button>
            </div>
          </form>

          {loading ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Store</th>
                    <th>Shift</th>
                    <th>Reason</th>
                    <th>Requested</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr><td colSpan={6}>No pending off-shift requests.</td></tr>
                  ) : requests.map((row) => (
                    <tr key={row.id}>
                      <td>{row.staff?.displayName || row.staff?.email || row.userId}</td>
                      <td>{row.storeCode}</td>
                      <td>
                        {row.shift
                          ? `${row.shift.timezone} ${row.shift.startTime}–${row.shift.endTime}`
                          : '—'}
                      </td>
                      <td>{row.reason || '—'}</td>
                      <td>{formatTransactionDateTime(row.createdAt)}</td>
                      <td>
                        <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => handleApprove(row)}>Approve</button>
                        {' '}
                        <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleReject(row)}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
