import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getDiditKycReports,
  getDiditKycReportsSummary,
  getDiditKycReportsFilterOptions
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { formatTransactionDateTime, getPresetRange, PRESETS } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './SlotsTransactions.css'
import './BonusReport.css'
import './DiditKyc.css'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const FALLBACK_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'not_started', label: 'Not started' }
]

const defaultReportRange =
  getPresetRange(PRESETS.LAST_30) || getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)

function KycStatusBadge({ status, label }) {
  const key = String(status || 'not_started').toLowerCase()
  const cls =
    key === 'approved'
      ? 'kyc-status--approved'
      : key === 'declined'
        ? 'kyc-status--declined'
        : key === 'pending' || key === 'in_review'
          ? 'kyc-status--pending'
          : 'kyc-status--default'
  return <span className={`stx-type-badge ${cls}`}>{label || key || '—'}</span>
}

export default function KycReport() {
  const toast = useToast()

  const [startDate, setStartDate] = useState(defaultReportRange?.startDate || '')
  const [endDate, setEndDate] = useState(defaultReportRange?.endDate || '')
  const [statusInput, setStatusInput] = useState('all')
  const [playerInput, setPlayerInput] = useState('')
  const [storeInput, setStoreInput] = useState('')

  const [appliedStatus, setAppliedStatus] = useState('all')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedStore, setAppliedStore] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState(defaultReportRange?.startDate || '')
  const [appliedEndDate, setAppliedEndDate] = useState(defaultReportRange?.endDate || '')
  const [applyKey, setApplyKey] = useState(0)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [reportRows, setReportRows] = useState([])
  const [reportSummary, setReportSummary] = useState(null)
  const [reportTotal, setReportTotal] = useState(0)
  const [reportsLoading, setReportsLoading] = useState(true)
  const [statusOptions, setStatusOptions] = useState(FALLBACK_STATUS_OPTIONS)
  const [storeOptions, setStoreOptions] = useState([])
  const [filtersLoading, setFiltersLoading] = useState(false)

  useEffect(() => {
    setFiltersLoading(true)
    getDiditKycReportsFilterOptions()
      .then((data) => {
        if (Array.isArray(data?.statusOptions) && data.statusOptions.length > 0) {
          setStatusOptions(data.statusOptions)
        }
        setStoreOptions(Array.isArray(data?.storeCodes) ? data.storeCodes : [])
      })
      .catch(() => {
        setStatusOptions(FALLBACK_STATUS_OPTIONS)
        setStoreOptions([])
      })
      .finally(() => setFiltersLoading(false))
  }, [])

  const loadReports = useCallback(() => {
    setReportsLoading(true)
    const params = {
      page,
      limit: pageSize,
      startDate: appliedStartDate,
      endDate: appliedEndDate
    }
    if (appliedStatus && appliedStatus !== 'all') params.status = appliedStatus
    if (appliedSearch) params.search = appliedSearch
    if (appliedStore) params.storeCode = appliedStore

    Promise.all([
      getDiditKycReportsSummary(params).catch(() => null),
      getDiditKycReports(params)
    ])
      .then(([sum, list]) => {
        setReportSummary(sum)
        setReportRows(list?.rows || [])
        setReportTotal(list?.total || 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load KYC reports')
        setReportSummary(null)
        setReportRows([])
        setReportTotal(0)
      })
      .finally(() => setReportsLoading(false))
  }, [
    page,
    pageSize,
    appliedStartDate,
    appliedEndDate,
    appliedStatus,
    appliedSearch,
    appliedStore,
    toast,
    applyKey
  ])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  function applyReportFilters() {
    setAppliedStatus(statusInput)
    setAppliedSearch(playerInput.trim())
    setAppliedStore(storeInput)
    setAppliedStartDate(startDate)
    setAppliedEndDate(endDate)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function clearReportFilters() {
    const range =
      getPresetRange(PRESETS.LAST_30) || getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)
    setStartDate(range?.startDate || '')
    setEndDate(range?.endDate || '')
    setStatusInput('all')
    setPlayerInput('')
    setStoreInput('')
    setAppliedStatus('all')
    setAppliedSearch('')
    setAppliedStore('')
    setAppliedStartDate(range?.startDate || '')
    setAppliedEndDate(range?.endDate || '')
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function handlePreset(range) {
    if (!range?.startDate || range?.endDate == null) return
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  const totalPages = Math.max(1, Math.ceil(reportTotal / pageSize) || 1)
  const breakdown = (reportSummary?.byStatus || []).filter((b) => b.count > 0)

  return (
    <div className="ccw-page dep-page stx-page br-page didit-kyc-page kyc-report-page">
      <header className="ccw-header">
        <h1 className="ccw-title">KYC report</h1>
        <p className="ccw-subtitle">
          Player identity verification across stores (Didit ID, liveness, face match). Phone OTP
          sessions are excluded.           Manage per-store toggles on{' '}
          <Link to="/didit-kyc" className="br-user-link">
            KYC Config
          </Link>
          .
        </p>
      </header>

      <div className="ccw-toolbar dep-filters stx-filters">
        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="kyc-report-store">
            Store
          </label>
          <select
            id="kyc-report-store"
            className="dep-filter-input"
            value={storeInput}
            disabled={filtersLoading}
            onChange={(e) => setStoreInput(e.target.value)}
            aria-label="Store filter"
          >
            <option value="">All stores</option>
            {storeOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="kyc-report-status">
            Status
          </label>
          <select
            id="kyc-report-status"
            className="dep-filter-input"
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value)}
            aria-label="KYC status filter"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="kyc-report-player">
            Player
          </label>
          <input
            id="kyc-report-player"
            type="search"
            className="dep-filter-input"
            placeholder="Username, email, or user ID"
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyReportFilters()
            }}
            aria-label="Player search"
          />
        </div>

        <div className="stx-filter-field stx-date-field">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onPresetClick={handlePreset}
            label="Updated date"
            embedded
          />
        </div>

        <div className="stx-filter-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={applyReportFilters}>
            Apply filters
          </button>
          <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={clearReportFilters}>
            Clear
          </button>
        </div>
      </div>

      {!reportsLoading && reportSummary ? (
        <div className="stx-summary-grid br-summary-grid kyc-summary-grid">
          <div className="stx-summary-card">
            <span className="stx-summary-label">Matching players</span>
            <span className="stx-summary-value">{reportSummary.totalPlayers || 0}</span>
            <span className="stx-summary-meta">For current filters</span>
          </div>
          <div className="stx-summary-card kyc-summary--approved">
            <span className="stx-summary-label">Approved</span>
            <span className="stx-summary-value">{reportSummary.approved || 0}</span>
            <span className="stx-summary-meta">Verified</span>
          </div>
          <div className="stx-summary-card kyc-summary--pending">
            <span className="stx-summary-label">Pending / in review</span>
            <span className="stx-summary-value">{reportSummary.pending || 0}</span>
            <span className="stx-summary-meta">Awaiting decision</span>
          </div>
          <div className="stx-summary-card kyc-summary--declined">
            <span className="stx-summary-label">Declined</span>
            <span className="stx-summary-value">{reportSummary.declined || 0}</span>
            <span className="stx-summary-meta">Failed verification</span>
          </div>
        </div>
      ) : null}

      {!reportsLoading && breakdown.length > 0 ? (
        <div className="br-breakdown">
          <h2 className="br-breakdown-title">Breakdown by status</h2>
          <div className="br-breakdown-grid">
            {breakdown.map((b) => (
              <div key={b.status} className="br-breakdown-card">
                <span className="br-breakdown-label">{b.label}</span>
                <span className="br-breakdown-amount">{b.count}</span>
                <span className="br-breakdown-meta">player{b.count === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {reportsLoading ? (
        <p className="ccw-loading">Loading KYC report…</p>
      ) : (
        <>
          <div className="ccw-table-wrap dep-table-wrap">
            <table className="ccw-table stx-table">
              <thead>
                <tr>
                  <th scope="col">Updated</th>
                  <th scope="col">Store</th>
                  <th scope="col">Player</th>
                  <th scope="col">Status</th>
                  <th scope="col">Verified at</th>
                  <th scope="col">Session</th>
                  <th scope="col">Decline reason</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="ccw-empty">
                      No KYC records found for these filters.
                    </td>
                  </tr>
                ) : (
                  reportRows.map((row) => (
                    <tr key={row.userId}>
                      <td className="ccw-td-date" title={formatTransactionDateTime(row.kycUpdatedAt)}>
                        {row.kycUpdatedAt ? (
                          formatTransactionDateTime(row.kycUpdatedAt)
                        ) : (
                          <span className="ccw-dash">—</span>
                        )}
                      </td>
                      <td className="ccw-td-store" title={row.storeCode || undefined}>
                        {row.storeCode || <span className="ccw-dash">—</span>}
                      </td>
                      <td>
                        {row.userId ? (
                          <Link to={`/users/${row.userId}`} className="br-user-link">
                            @{row.username || `user-${row.userId}`}
                          </Link>
                        ) : (
                          <span className="ccw-user-name">{row.username || '—'}</span>
                        )}
                        {row.email ? <span className="ccw-user-email">{row.email}</span> : null}
                      </td>
                      <td>
                        <KycStatusBadge status={row.kycStatus} label={row.kycStatusLabel} />
                      </td>
                      <td className="ccw-td-date">
                        {row.kycVerifiedAt ? (
                          formatTransactionDateTime(row.kycVerifiedAt)
                        ) : (
                          <span className="ccw-dash">—</span>
                        )}
                      </td>
                      <td className="kyc-session-cell" title={row.diditSessionId || undefined}>
                        {row.diditSessionId ? (
                          <code className="kyc-session-id">{row.diditSessionId}</code>
                        ) : (
                          <span className="ccw-dash">—</span>
                        )}
                      </td>
                      <td className="br-note" title={row.kycDeclineReason || undefined}>
                        {row.kycDeclineReason || <span className="ccw-dash">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="dep-pager">
            <div className="dep-page-size-group">
              <label className="dep-page-size-label" htmlFor="kyc-report-page-size">
                Entries
              </label>
              <select
                id="kyc-report-page-size"
                className="dep-page-size-select"
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  if (!Number.isFinite(next)) return
                  setPageSize(next)
                  setPage(1)
                }}
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="dep-pager-controls">
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage(1)}
              >
                First
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="dep-pager-meta">
                Page {page} of {totalPages} ({reportTotal} total)
              </span>
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-sm admin-btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                Last
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
