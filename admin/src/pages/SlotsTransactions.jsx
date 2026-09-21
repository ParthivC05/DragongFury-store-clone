import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getGameLogsTransactions, getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { formatTransactionDateTime, getPresetRange, PRESETS } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './SlotsTransactions.css'

const defaultRange = getPresetRange(PRESETS.TODAY)
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const TYPE_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'bet', label: 'Bet' },
  { value: 'win', label: 'Win' },
  { value: 'betwin', label: 'Bet & win' },
  { value: 'rollback', label: 'Reversed' }
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'Any status' },
  { value: 'completed', label: 'Completed' },
  { value: 'rolled_back', label: 'Reversed' }
]

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'All providers' },
  { value: 'gitslotpark', label: 'GitSlotPark' },
  { value: 'bona', label: 'Bona Games' },
  { value: 'onegamehub', label: '1GameHub' },
  { value: 'scorpio', label: 'Scorpio Play' }
]

function formatSc(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  return `SC ${Number(amount).toFixed(2)}`
}

function formatAmountCell(row) {
  if (row.type === 'betwin') {
    const bet = row.betAmount != null ? formatSc(row.betAmount) : '—'
    const win = row.winAmount != null ? formatSc(row.winAmount) : '—'
    return `Bet ${bet} · Win ${win}`
  }
  if (row.type === 'bet' || row.type === 'transfer_out') return `−${formatSc(row.amount)}`
  if (row.type === 'win' || row.type === 'transfer_in') return `+${formatSc(row.amount)}`
  if (row.type === 'rollback') return formatSc(row.amount)
  return formatSc(row.amount)
}

function TypeBadge({ type, label, hint }) {
  const cls =
    type === 'bet' || type === 'transfer_out'
      ? 'stx-type-deposit'
      : type === 'win' || type === 'transfer_in'
        ? 'stx-type-withdraw'
        : type === 'betwin'
          ? 'stx-type-signup'
          : type === 'rollback'
            ? 'stx-type-other'
            : 'stx-type-other'
  return (
    <span className={`stx-type-badge ${cls}`} title={hint || undefined}>
      {label || '—'}
    </span>
  )
}

function StatusBadge({ status, label }) {
  const isReversed = status === 'rolled_back'
  return (
    <span className={`stx-handled-badge ${isReversed ? 'stx-handled-manual' : 'stx-handled-auto'}`}>
      {label || (isReversed ? 'Reversed' : 'Completed')}
    </span>
  )
}

export default function SlotsTransactions() {
  const { user } = useAuth()
  const toast = useToast()

  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const showStoreColumn = user?.role === ROLES.MASTER_ADMIN || user?.role === ROLES.DISTRIBUTOR_ADMIN
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN

  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [typeInput, setTypeInput] = useState('all')
  const [statusInput, setStatusInput] = useState('all')
  const [providerInput, setProviderInput] = useState('all')
  const [usernameInput, setUsernameInput] = useState('')
  const [gameNameInput, setGameNameInput] = useState('')
  const [storeInput, setStoreInput] = useState('')

  const [appliedType, setAppliedType] = useState('all')
  const [appliedStatus, setAppliedStatus] = useState('all')
  const [appliedProvider, setAppliedProvider] = useState('all')
  const [appliedUsername, setAppliedUsername] = useState('')
  const [appliedGameName, setAppliedGameName] = useState('')
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
  const [storeOptions, setStoreOptions] = useState([])
  const [filtersLoading, setFiltersLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = {
      page,
      limit: pageSize,
      type: appliedType || 'all',
      status: appliedStatus || 'all',
      provider: appliedProvider || 'all'
    }
    if (appliedStartDate) params.startDate = appliedStartDate
    if (appliedEndDate) params.endDate = appliedEndDate
    if (appliedUsername) params.username = appliedUsername
    if (appliedGameName) params.gameName = appliedGameName
    if (isMaster && appliedStore) params.storeCode = appliedStore

    getGameLogsTransactions(params)
      .then((res) => {
        setRows(res.rows || [])
        setSummary(res.summary || null)
        setTotal(typeof res.total === 'number' ? res.total : 0)
      })
      .catch((err) => {
        toast.error(err?.message || 'Failed to load slots transactions')
        setRows([])
        setSummary(null)
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [
    page,
    pageSize,
    appliedType,
    appliedStatus,
    appliedProvider,
    appliedUsername,
    appliedGameName,
    appliedStore,
    appliedStartDate,
    appliedEndDate,
    applyKey,
    isMaster,
    toast
  ])

  useEffect(() => {
    if (!user || !isMaster) {
      setStoreOptions([])
      return
    }
    let cancelled = false
    setFiltersLoading(true)
    ;(async () => {
      try {
        const codes = new Set()
        let page = 1
        let total = Infinity
        const pageSize = 100
        while (!cancelled && (page - 1) * pageSize < total && page <= 50) {
          const storesRes = await getStores({ limit: pageSize, page, sortBy: 'storeCode', sortOrder: 'ASC' })
          total = typeof storesRes?.total === 'number' ? storesRes.total : 0
          const list = storesRes?.list || []
          for (const s of list) {
            const code = (s?.storeCode || '').toString().trim()
            if (code) codes.add(code)
          }
          if (list.length === 0) break
          page += 1
        }
        if (!cancelled) setStoreOptions([...codes].sort((a, b) => a.localeCompare(b)))
      } catch {
        if (!cancelled) setStoreOptions([])
      } finally {
        if (!cancelled) setFiltersLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, isMaster])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function handlePreset(range) {
    if (!range?.startDate || range?.endDate == null) return
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  function applyFilters() {
    setAppliedType(typeInput)
    setAppliedStatus(statusInput)
    setAppliedProvider(providerInput)
    setAppliedUsername(usernameInput.trim())
    setAppliedGameName(gameNameInput.trim())
    setAppliedStore(storeInput.trim())
    setAppliedStartDate(startDate)
    setAppliedEndDate(endDate)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function clearFilters() {
    const range = getPresetRange(PRESETS.TODAY)
    setTypeInput('all')
    setStatusInput('all')
    setProviderInput('all')
    setUsernameInput('')
    setGameNameInput('')
    setStoreInput('')
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setAppliedType('all')
    setAppliedStatus('all')
    setAppliedProvider('all')
    setAppliedUsername('')
    setAppliedGameName('')
    setAppliedStore('')
    setAppliedStartDate(range.startDate)
    setAppliedEndDate(range.endDate)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  const colCount = 8 + (showStoreColumn ? 1 : 0)

  return (
    <div className="ccw-page dep-page stx-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Slots Transactions</h1>
        <p className="ccw-subtitle">
          {isStoreAdmin
            ? "Slots play report for your players: bets and wins from GitSlotPark, Bona Games, 1GameHub, and Scorpio Play."
            : 'Slots play report across stores: player bets and wins from GitSlotPark, Bona Games, 1GameHub, and Scorpio Play.'}
        </p>
      </header>

      <div className="stx-help-box" role="note">
        <strong>How to read this report</strong>
        <ul>
          <li><strong>Bet</strong> — player spent SC while playing a slots game.</li>
          <li><strong>Win</strong> — player won SC back to their wallet.</li>
          <li><strong>Bet & win</strong> — one play that includes both a bet and a win.</li>
          <li><strong>Reversed</strong> — a previous play was cancelled.</li>
        </ul>
      </div>

      <div className="ccw-toolbar dep-filters stx-filters">
        {isMaster && (
          <div className="stx-filter-field">
            <label className="ccw-filter-label" htmlFor="stx-store">Store</label>
            <select
              id="stx-store"
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
          <label className="ccw-filter-label" htmlFor="stx-type">What happened</label>
          <select
            id="stx-type"
            className="dep-filter-input"
            value={typeInput}
            onChange={(e) => setTypeInput(e.target.value)}
            aria-label="Activity type filter"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="stx-status">Status</label>
          <select
            id="stx-status"
            className="dep-filter-input"
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value)}
            aria-label="Status filter"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="stx-provider">Provider</label>
          <select
            id="stx-provider"
            className="dep-filter-input"
            value={providerInput}
            onChange={(e) => setProviderInput(e.target.value)}
            aria-label="Provider filter"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="stx-player">Player</label>
          <input
            id="stx-player"
            type="search"
            className="dep-filter-input"
            placeholder="Search username"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
            aria-label="Player username search"
          />
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="stx-game">Slots game</label>
          <input
            id="stx-game"
            type="search"
            className="dep-filter-input"
            placeholder="Search game name"
            value={gameNameInput}
            onChange={(e) => setGameNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
            aria-label="Game name search"
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
        <div className="stx-summary-grid">
          <div className="stx-summary-card stx-summary-deposit">
            <span className="stx-summary-label">Total bets</span>
            <span className="stx-summary-value">{formatSc(summary.betAmount)}</span>
            <span className="stx-summary-meta">{summary.betCount || 0} bet(s)</span>
          </div>
          <div className="stx-summary-card stx-summary-withdraw">
            <span className="stx-summary-label">Total wins</span>
            <span className="stx-summary-value">{formatSc(summary.winAmount)}</span>
            <span className="stx-summary-meta">{summary.winCount || 0} win(s)</span>
          </div>
        </div>
      )}

      {loading ? (
        <p className="ccw-loading">Loading slots transactions…</p>
      ) : (
        <>
          <div className="ccw-table-wrap dep-table-wrap">
            <table className="ccw-table stx-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  {showStoreColumn && <th scope="col">Store</th>}
                  <th scope="col">Player</th>
                  <th scope="col">Provider</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Slots game</th>
                  <th scope="col" className="ccw-th-amount">Amount</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="ccw-empty">
                      No slots transactions found for these filters.
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
                        <span className="ccw-user-name">{row.username || `User #${row.userId}`}</span>
                      </td>
                      <td title={row.provider || undefined}>
                        {row.providerLabel || (row.provider === 'bona' ? 'Bona Games' : row.provider === 'onegamehub' ? '1GameHub' : row.provider === 'scorpio' ? 'Scorpio Play' : 'GitSlotPark')}
                      </td>
                      <td>
                        <TypeBadge type={row.type} label={row.typeLabel} hint={row.typeHint} />
                      </td>
                      <td title={row.gameId != null ? `Game ID ${row.gameId}` : undefined}>
                        {row.gameName || '—'}
                      </td>
                      <td className={`ccw-td-amount stx-amount-${row.type === 'win' ? 'withdraw' : row.type === 'bet' ? 'deposit' : 'other'}`}>
                        {formatAmountCell(row)}
                      </td>
                      <td>
                        <StatusBadge status={row.status} label={row.statusLabel} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="dep-pager">
            <div className="dep-page-size-group">
              <label className="dep-page-size-label" htmlFor="stx-page-size">
                Entries
              </label>
              <select
                id="stx-page-size"
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
