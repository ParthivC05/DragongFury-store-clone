import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getBonusReportSummary, getBonusReportTransactions, getBonusReportFilterOptions } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { formatTransactionDateTime, getPresetRange, PRESETS } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './SlotsTransactions.css'
import './BonusReport.css'

const defaultRange = getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const FALLBACK_TYPE_OPTIONS = [
  { value: 'welcome_signup', label: 'Welcome signup', hint: 'Free SC when a player creates an account' },
  { value: 'bonus_code', label: 'Bonus code', hint: 'SC from a promo / bonus code' },
  { value: 'daily_bonus', label: 'Daily bonus', hint: 'SC from the 7-day daily bonus' },
  { value: 'daily_bonus_spin', label: 'Daily bonus spin', hint: 'Extra spin from daily bonus' },
  { value: 'promotion', label: 'Promotion', hint: 'SC from a promotion offer' },
  { value: 'vip_bonus', label: 'VIP reward', hint: 'SC reward from VIP levels' },
  { value: 'affiliate', label: 'Refer & Earn', hint: 'SC from Refer & Earn' },
  { value: 'referral_friend_signup', label: 'Friend signup bonus', hint: 'SC when a referred friend signs up' },
  { value: 'spin_wheel', label: 'Spin wheel', hint: 'Prize from the spin wheel' },
  { value: 'package_extra', label: 'Package extra SC', hint: 'Extra SC above the package pay price (e.g. 25 SC for $19.99 → 5 SC bonus)' }
]

function formatSc(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  return `SC ${Number(amount).toFixed(2)}`
}

function TypeBadge({ type, label, hint }) {
  const cls =
    type === 'welcome_signup' || type === 'bonus_code'
      ? 'br-type-welcome'
      : type === 'daily_bonus' || type === 'daily_bonus_spin'
        ? 'br-type-daily'
        : type === 'vip_bonus'
          ? 'br-type-vip'
          : type === 'spin_wheel'
            ? 'br-type-spin'
            : type === 'affiliate' || type === 'referral_friend_signup'
              ? 'br-type-referral'
              : type === 'package_extra'
                ? 'br-type-package'
                : 'br-type-promo'
  return (
    <span className={`stx-type-badge ${cls}`} title={hint || undefined}>
      {label || '—'}
    </span>
  )
}

export default function BonusReport() {
  const { user } = useAuth()
  const toast = useToast()

  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const showStoreColumn = isMaster

  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [typeInput, setTypeInput] = useState('all')
  const [usernameInput, setUsernameInput] = useState('')
  const [storeInput, setStoreInput] = useState('')

  const [appliedType, setAppliedType] = useState('all')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedStore, setAppliedStore] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState(defaultRange.startDate)
  const [appliedEndDate, setAppliedEndDate] = useState(defaultRange.endDate)
  const [applyKey, setApplyKey] = useState(0)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [typeOptions, setTypeOptions] = useState(FALLBACK_TYPE_OPTIONS)
  const [storeOptions, setStoreOptions] = useState([])
  const [filtersLoading, setFiltersLoading] = useState(false)

  useEffect(() => {
    setFiltersLoading(true)
    getBonusReportFilterOptions()
      .then((data) => {
        if (Array.isArray(data?.typeOptions) && data.typeOptions.length > 0) {
          setTypeOptions(data.typeOptions)
        }
        setStoreOptions(Array.isArray(data?.storeCodes) ? data.storeCodes : [])
      })
      .catch(() => {
        setTypeOptions(FALLBACK_TYPE_OPTIONS)
        setStoreOptions([])
      })
      .finally(() => setFiltersLoading(false))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = {
      page,
      limit: pageSize,
      startDate: appliedStartDate,
      endDate: appliedEndDate
    }
    if (appliedType && appliedType !== 'all') params.type = appliedType
    if (appliedSearch) params.search = appliedSearch
    if (isMaster && appliedStore) params.storeCode = appliedStore

    Promise.all([
      getBonusReportSummary(params).catch(() => null),
      getBonusReportTransactions(params)
    ])
      .then(([sum, tx]) => {
        setSummary(sum)
        setRows(tx?.rows || [])
        setTotal(tx?.total || 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load bonus report')
        setSummary(null)
        setRows([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, pageSize, appliedStartDate, appliedEndDate, appliedType, appliedSearch, appliedStore, isMaster, toast, applyKey])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)

  function applyFilters() {
    setAppliedType(typeInput)
    setAppliedSearch(usernameInput.trim())
    setAppliedStore(storeInput)
    setAppliedStartDate(startDate)
    setAppliedEndDate(endDate)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function clearFilters() {
    const range = getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setTypeInput('all')
    setUsernameInput('')
    setStoreInput('')
    setAppliedType('all')
    setAppliedSearch('')
    setAppliedStore('')
    setAppliedStartDate(range.startDate)
    setAppliedEndDate(range.endDate)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function handlePreset(range) {
    // DateRangeFilter passes { startDate, endDate }, not a preset key
    if (!range?.startDate || range?.endDate == null) return
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  const colCount = 6 + (showStoreColumn ? 1 : 0)
  const breakdown = (summary?.byType || []).filter((b) => b.count > 0 || b.amount > 0)

  return (
    <div className="ccw-page dep-page stx-page br-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Bonus report</h1>
        <p className="ccw-subtitle">
          See every free SC bonus given to players across stores — welcome gift, codes, daily rewards, VIP, spins, referrals, and package extra SC.
        </p>
      </header>

      <div className="stx-help-box" role="note">
        <strong>How to read this report (simple)</strong>
        <ul>
          <li><strong>Total free SC</strong> — how much free bonus money was given in the date range.</li>
          <li><strong>Players who got a bonus</strong> — how many different players received at least one bonus.</li>
          <li><strong>Bonus type</strong> — where the free SC came from (welcome, code, daily, VIP, spin, referral, package extra, etc.).</li>
          <li><strong>Package extra SC</strong> — bonus coins on a package (SC credited minus what the player paid), including past purchases.</li>
        </ul>
      </div>

      <div className="ccw-toolbar dep-filters stx-filters">
        {isMaster && (
          <div className="stx-filter-field">
            <label className="ccw-filter-label" htmlFor="br-store">Store</label>
            <select
              id="br-store"
              className="dep-filter-input"
              value={storeInput}
              disabled={filtersLoading}
              onChange={(e) => setStoreInput(e.target.value)}
              aria-label="Store filter"
            >
              <option value="">All stores</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
        )}

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="br-type">Bonus type</label>
          <select
            id="br-type"
            className="dep-filter-input"
            value={typeInput}
            onChange={(e) => setTypeInput(e.target.value)}
            aria-label="Bonus type filter"
          >
            <option value="all">All bonus types</option>
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value} title={opt.hint || undefined}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="br-player">Player</label>
          <input
            id="br-player"
            type="search"
            className="dep-filter-input"
            placeholder="Username or email"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
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
            label="Date range"
            embedded
          />
        </div>

        <div className="stx-filter-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={applyFilters}>
            Apply filters
          </button>
          <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>

      {!loading && summary && (
        <div className="stx-summary-grid br-summary-grid">
          <div className="stx-summary-card br-summary-total">
            <span className="stx-summary-label">Total free SC given</span>
            <span className="stx-summary-value">{formatSc(summary.totalBonusAmount)}</span>
            <span className="stx-summary-meta">All bonus types in this period</span>
          </div>
          <div className="stx-summary-card br-summary-players">
            <span className="stx-summary-label">Players who got a bonus</span>
            <span className="stx-summary-value">{summary.uniquePlayers || 0}</span>
            <span className="stx-summary-meta">Different players</span>
          </div>
        </div>
      )}

      {!loading && breakdown.length > 0 && (
        <div className="br-breakdown">
          <h2 className="br-breakdown-title">Breakdown by bonus type</h2>
          <div className="br-breakdown-grid">
            {breakdown.map((b) => (
              <div key={b.type} className="br-breakdown-card" title={b.hint || undefined}>
                <span className="br-breakdown-label">{b.label}</span>
                <span className="br-breakdown-amount">{formatSc(b.amount)}</span>
                <span className="br-breakdown-meta">{b.count} time{b.count === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="ccw-loading">Loading bonus report…</p>
      ) : (
        <>
          <div className="ccw-table-wrap dep-table-wrap">
            <table className="ccw-table stx-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  {showStoreColumn && <th scope="col">Store</th>}
                  <th scope="col">Player</th>
                  <th scope="col">Bonus type</th>
                  <th scope="col">Details</th>
                  <th scope="col" className="ccw-th-amount">Free SC</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="ccw-empty">
                      No bonus gifts found for these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="ccw-td-date" title={formatTransactionDateTime(row.createdAt)}>
                        {formatTransactionDateTime(row.createdAt)}
                      </td>
                      {showStoreColumn && (
                        <td className="ccw-td-store" title={row.storeCode || undefined}>
                          {row.storeCode || <span className="ccw-dash">—</span>}
                        </td>
                      )}
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
                        <TypeBadge type={row.type} label={row.typeLabel} hint={row.typeHint} />
                      </td>
                      <td>
                        {row.bonusCode ? (
                          <span className="br-code">Code: {row.bonusCode}</span>
                        ) : (
                          <span className="ccw-dash">—</span>
                        )}
                      </td>
                      <td className="ccw-td-amount br-amount">
                        +{formatSc(row.amount)}
                      </td>
                      <td className="br-note" title={row.description || row.typeHint || undefined}>
                        {row.description || row.typeHint || <span className="ccw-dash">—</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="dep-pager">
            <div className="dep-page-size-group">
              <label className="dep-page-size-label" htmlFor="br-page-size">
                Entries
              </label>
              <select
                id="br-page-size"
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
                  <option key={opt} value={opt}>{opt}</option>
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
                Page {page} of {totalPages} ({total} total)
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
