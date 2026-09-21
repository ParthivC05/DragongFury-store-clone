import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  getWalletAdjustReportSummary,
  getWalletAdjustReportTransactions,
  getWalletAdjustReportFilterOptions
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { formatTransactionDateTime, getPresetRange, PRESETS } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './SlotsTransactions.css'
import './BonusReport.css'
import './WalletAdjustReport.css'

const defaultRange = getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const FALLBACK_TYPE_OPTIONS = [
  { value: 'admin_add', label: 'Added', hint: 'Credits added to a player wallet' },
  { value: 'admin_deduct', label: 'Removed', hint: 'Credits removed from a player wallet' }
]

const FALLBACK_WALLET_OPTIONS = [
  { value: 'PSC', label: 'Purchased SC (PSC)' },
  { value: 'BSC', label: 'Bonus SC (BSC)' },
  { value: 'RSC', label: 'Redeemable SC (RSC)' },
  { value: 'SC', label: 'Combined SC (PSC+BSC)' }
]

function formatAmount(amount, wallet) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  const code = wallet || 'SC'
  return `${code} ${Number(amount).toFixed(2)}`
}

function ActionBadge({ type, label }) {
  const cls = type === 'admin_add' ? 'war-type-add' : 'war-type-deduct'
  return (
    <span className={`stx-type-badge ${cls}`}>
      {label || (type === 'admin_add' ? 'Added' : 'Removed')}
    </span>
  )
}

export default function WalletAdjustReport() {
  const toast = useToast()

  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [typeInput, setTypeInput] = useState('all')
  const [walletInput, setWalletInput] = useState('all')
  const [usernameInput, setUsernameInput] = useState('')
  const [handlerInput, setHandlerInput] = useState('')
  const [storeInput, setStoreInput] = useState('')

  const [appliedType, setAppliedType] = useState('all')
  const [appliedWallet, setAppliedWallet] = useState('all')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedHandler, setAppliedHandler] = useState('')
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
  const [walletOptions, setWalletOptions] = useState(FALLBACK_WALLET_OPTIONS)
  const [storeOptions, setStoreOptions] = useState([])
  const [filtersLoading, setFiltersLoading] = useState(false)

  useEffect(() => {
    setFiltersLoading(true)
    getWalletAdjustReportFilterOptions()
      .then((data) => {
        if (Array.isArray(data?.typeOptions) && data.typeOptions.length > 0) {
          setTypeOptions(data.typeOptions)
        }
        if (Array.isArray(data?.walletOptions) && data.walletOptions.length > 0) {
          setWalletOptions(data.walletOptions)
        }
        setStoreOptions(Array.isArray(data?.storeCodes) ? data.storeCodes : [])
      })
      .catch(() => {
        setTypeOptions(FALLBACK_TYPE_OPTIONS)
        setWalletOptions(FALLBACK_WALLET_OPTIONS)
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
    if (appliedWallet && appliedWallet !== 'all') params.wallet = appliedWallet
    if (appliedSearch) params.search = appliedSearch
    if (appliedHandler) params.handlerSearch = appliedHandler
    if (appliedStore) params.storeCode = appliedStore

    Promise.all([
      getWalletAdjustReportSummary(params).catch(() => null),
      getWalletAdjustReportTransactions(params)
    ])
      .then(([sum, tx]) => {
        setSummary(sum)
        setRows(tx?.rows || [])
        setTotal(tx?.total || 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load wallet adjust report')
        setSummary(null)
        setRows([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [
    page,
    pageSize,
    appliedStartDate,
    appliedEndDate,
    appliedType,
    appliedWallet,
    appliedSearch,
    appliedHandler,
    appliedStore,
    toast,
    applyKey
  ])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)

  function applyFilters() {
    setAppliedType(typeInput)
    setAppliedWallet(walletInput)
    setAppliedSearch(usernameInput.trim())
    setAppliedHandler(handlerInput.trim())
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
    setWalletInput('all')
    setUsernameInput('')
    setHandlerInput('')
    setStoreInput('')
    setAppliedType('all')
    setAppliedWallet('all')
    setAppliedSearch('')
    setAppliedHandler('')
    setAppliedStore('')
    setAppliedStartDate(range.startDate)
    setAppliedEndDate(range.endDate)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function handlePreset(range) {
    if (!range?.startDate || range?.endDate == null) return
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  const breakdown = (summary?.byWallet || []).filter(
    (b) => b.addCount > 0 || b.deductCount > 0 || b.added > 0 || b.removed > 0
  )

  return (
    <div className="ccw-page dep-page stx-page br-page war-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Wallet adjust report</h1>
        <p className="ccw-subtitle">
          Audit every PSC, BSC, and RSC add or remove on player wallets — who handled it, when, and how much.
        </p>
      </header>

      <div className="stx-help-box" role="note">
        <strong>How to read this report</strong>
        <ul>
          <li><strong>Handled by</strong> — the super admin, technical staff, store admin, or store staff who made the change.</li>
          <li><strong>Action</strong> — Added (credit) or Removed (deduct).</li>
          <li><strong>Wallet</strong> — PSC (purchased), BSC (bonus), RSC (redeemable), or combined SC.</li>
          <li><strong>When</strong> — date and time of the adjustment.</li>
        </ul>
      </div>

      <div className="ccw-toolbar dep-filters stx-filters">
        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="war-store">Store</label>
          <select
            id="war-store"
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

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="war-type">Action</label>
          <select
            id="war-type"
            className="dep-filter-input"
            value={typeInput}
            onChange={(e) => setTypeInput(e.target.value)}
            aria-label="Action filter"
          >
            <option value="all">All actions</option>
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value} title={opt.hint || undefined}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="war-wallet">Wallet</label>
          <select
            id="war-wallet"
            className="dep-filter-input"
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            aria-label="Wallet filter"
          >
            <option value="all">All wallets</option>
            {walletOptions.map((opt) => (
              <option key={opt.value} value={opt.value} title={opt.hint || undefined}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="war-player">Player</label>
          <input
            id="war-player"
            type="search"
            className="dep-filter-input"
            placeholder="Username or email"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
            aria-label="Player search"
          />
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="war-handler">Handled by</label>
          <input
            id="war-handler"
            type="search"
            className="dep-filter-input"
            placeholder="Admin / staff name"
            value={handlerInput}
            onChange={(e) => setHandlerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
            aria-label="Handler search"
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
        <div className="stx-summary-grid war-summary-grid">
          <div className="stx-summary-card war-summary-added">
            <span className="stx-summary-label">Total added</span>
            <span className="stx-summary-value">{formatAmount(summary.totalAdded, 'SC')}</span>
            <span className="stx-summary-meta">Credits given in this period</span>
          </div>
          <div className="stx-summary-card war-summary-removed">
            <span className="stx-summary-label">Total removed</span>
            <span className="stx-summary-value">{formatAmount(summary.totalRemoved, 'SC')}</span>
            <span className="stx-summary-meta">Credits taken in this period</span>
          </div>
          <div className="stx-summary-card war-summary-count">
            <span className="stx-summary-label">Adjustments</span>
            <span className="stx-summary-value">{summary.totalCount || 0}</span>
            <span className="stx-summary-meta">
              {summary.uniquePlayers || 0} players · {summary.uniqueHandlers || 0} handlers
            </span>
          </div>
        </div>
      )}

      {!loading && breakdown.length > 0 && (
        <div className="br-breakdown">
          <h2 className="br-breakdown-title">Breakdown by wallet</h2>
          <div className="br-breakdown-grid">
            {breakdown.map((b) => (
              <div key={b.wallet} className="br-breakdown-card" title={b.hint || undefined}>
                <span className="br-breakdown-label">{b.label || b.wallet}</span>
                <span className="br-breakdown-amount war-breakdown-add">
                  +{formatAmount(b.added, b.wallet)}
                </span>
                <span className="br-breakdown-amount war-breakdown-remove">
                  −{formatAmount(b.removed, b.wallet)}
                </span>
                <span className="br-breakdown-meta">
                  {b.addCount || 0} add · {b.deductCount || 0} remove
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="ccw-loading">Loading wallet adjust report…</p>
      ) : (
        <>
          <div className="ccw-table-wrap dep-table-wrap">
            <table className="ccw-table stx-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Store</th>
                  <th scope="col">Player</th>
                  <th scope="col">Action</th>
                  <th scope="col">Wallet</th>
                  <th scope="col" className="ccw-th-amount">Amount</th>
                  <th scope="col">Handled by</th>
                  <th scope="col">Reason / note</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="ccw-empty">
                      No wallet adjustments found for these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isAdd = row.type === 'admin_add'
                    const handler = row.handledBy || {}
                    return (
                      <tr key={row.id}>
                        <td className="ccw-td-date" title={formatTransactionDateTime(row.createdAt)}>
                          {formatTransactionDateTime(row.createdAt)}
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
                          <ActionBadge type={row.type} label={row.typeLabel} />
                        </td>
                        <td>
                          <span className="war-wallet-badge" title={row.walletLabel || undefined}>
                            {row.wallet || row.currencyCode || '—'}
                          </span>
                        </td>
                        <td className={`ccw-td-amount ${isAdd ? 'war-amount-add' : 'war-amount-deduct'}`}>
                          {isAdd ? '+' : '−'}{formatAmount(row.amount, row.wallet || row.currencyCode)}
                        </td>
                        <td>
                          <div className="war-handler">
                            <span className="war-handler-name">
                              {handler.username || '—'}
                            </span>
                            {handler.roleLabel ? (
                              <span className="war-handler-role">{handler.roleLabel}</span>
                            ) : null}
                            {handler.email ? (
                              <span className="ccw-user-email">{handler.email}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="br-note" title={row.reason || row.description || undefined}>
                          {row.reason || row.description || <span className="ccw-dash">—</span>}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="dep-pager">
            <div className="dep-page-size-group">
              <label className="dep-page-size-label" htmlFor="war-page-size">
                Entries
              </label>
              <select
                id="war-page-size"
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
