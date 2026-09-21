import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDepositRequests, getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import { formatTransactionDateTime } from '../utils/dateRange'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const STATUS_OPTIONS = ['completed', 'pending', 'failed', 'expired', 'closed']
const PROVIDER_OPTIONS = [
  { value: '', label: 'All providers' },
  { value: 'orionstarspay', label: 'OrionStarPay' },
  { value: 'chime', label: 'Manual Chime' },
  { value: 'dollarpay', label: 'Dpay' },
  { value: 'xxpay', label: 'Xpay' },
  { value: 'selfcrypto', label: 'Direct Crypto' }
]
const METHOD_OPTIONS = [
  { value: '', label: 'All methods' },
  { value: 'card', label: 'Card' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'apple_pay', label: 'Apple Pay' },
  { value: 'google_pay', label: 'Google Pay' },
  { value: 'chime', label: 'Chime' },
  { value: 'crypto', label: 'Crypto' }
]

function formatDate(d) {
  return formatTransactionDateTime(d)
}

function formatAmount(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `SC ${v.toFixed(2)}`
}

function truncate(s, max = 18) {
  if (!s || typeof s !== 'string') return '—'
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function providerLabel(row) {
  if (row?.providerDisplayLabel) return row.providerDisplayLabel
  const key = String(row?.provider || '').toLowerCase()
  if (key === 'orionstarspay') return 'OrionStarPay'
  if (key === 'dollarpay') return 'Dpay'
  if (key === 'xxpay') return 'Xpay'
  if (key === 'chime') return 'Manual Chime'
  if (key === 'selfcrypto') return 'Direct Crypto'
  if (key === 'scrypto') return 'Crypto'
  return row?.provider || '—'
}

export default function Deposits() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [storeOptions, setStoreOptions] = useState([])
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [storeInput, setStoreInput] = useState('')
  const [providerInput, setProviderInput] = useState('')
  const [methodInput, setMethodInput] = useState('')
  const [statusInput, setStatusInput] = useState('')
  const [startDateInput, setStartDateInput] = useState('')
  const [endDateInput, setEndDateInput] = useState('')
  const [appliedStore, setAppliedStore] = useState('')
  const [appliedProvider, setAppliedProvider] = useState('')
  const [appliedMethod, setAppliedMethod] = useState('')
  const [appliedStatus, setAppliedStatus] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState('')
  const [appliedEndDate, setAppliedEndDate] = useState('')
  const [applyKey, setApplyKey] = useState(0)

  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const showStoreColumn = user?.role === ROLES.MASTER_ADMIN || user?.role === ROLES.DISTRIBUTOR_ADMIN
  const showDistributorColumn = user?.role === ROLES.MASTER_ADMIN
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit: pageSize }
    if (isMaster && appliedStore) params.storeCode = appliedStore
    if (appliedProvider) params.provider = appliedProvider
    if (appliedMethod) params.method = appliedMethod
    if (appliedStatus) params.status = appliedStatus
    if (appliedStartDate) params.startDate = appliedStartDate
    if (appliedEndDate) params.endDate = appliedEndDate
    getDepositRequests(params)
      .then((res) => {
        setList(res.list || [])
        setTotal(typeof res.total === 'number' ? res.total : 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load deposits')
        setList([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [page, pageSize, appliedStore, appliedProvider, appliedMethod, appliedStatus, appliedStartDate, appliedEndDate, applyKey, isMaster, toast])

  useEffect(() => {
    if (!user || !isMaster) {
      setStoreOptions([])
      return
    }
    setFiltersLoading(true)
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((storesRes) => {
        const stores = [...new Set((storesRes?.list || [])
          .map((s) => (s?.storeCode || '').toString().trim())
          .filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
        setStoreOptions(stores)
      })
      .catch(() => {
        setStoreOptions([])
      })
      .finally(() => setFiltersLoading(false))
  }, [user, isMaster])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function handleStartDateChange(nextStart) {
    setStartDateInput(nextStart)
    if (endDateInput && nextStart && endDateInput < nextStart) {
      setEndDateInput(nextStart)
    }
  }

  function handleEndDateChange(nextEnd) {
    setEndDateInput(nextEnd)
    if (startDateInput && nextEnd && nextEnd < startDateInput) {
      setStartDateInput(nextEnd)
    }
  }

  function applyFilters() {
    setAppliedStore(storeInput.trim())
    setAppliedProvider(providerInput.trim())
    setAppliedMethod(methodInput.trim().toLowerCase())
    setAppliedStatus(statusInput.trim().toLowerCase())
    setAppliedStartDate(startDateInput)
    setAppliedEndDate(endDateInput)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function clearFilters() {
    setStoreInput('')
    setProviderInput('')
    setMethodInput('')
    setStatusInput('')
    setStartDateInput('')
    setEndDateInput('')
    setAppliedStore('')
    setAppliedProvider('')
    setAppliedMethod('')
    setAppliedStatus('')
    setAppliedStartDate('')
    setAppliedEndDate('')
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  const baseCols = 8
  const colCount = baseCols + (showStoreColumn ? 1 : 0) + (showDistributorColumn ? 1 : 0)

  return (
    <div className="ccw-page dep-page">
      <header className="ccw-header">
        <h1 className="ccw-title">User deposits</h1>
        <p className="ccw-subtitle">
          Wallet top-ups for players in your scope: OrionStarPay, Manual Chime, Dpay, and Xpay.
        </p>
      </header>

      <div className="ccw-toolbar dep-filters">
        {isMaster && (
          <>
            <label className="ccw-filter-label" htmlFor="dep-store">
              Store code
            </label>
            <select
              id="dep-store"
              className="dep-filter-input"
              value={storeInput}
              disabled={filtersLoading}
              onChange={(e) => setStoreInput(e.target.value)}
              aria-label="Store code filter"
            >
              <option value="">All stores</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="ccw-filter-label" htmlFor="dep-provider">
          Provider
        </label>
        <select
          id="dep-provider"
          className="dep-filter-input"
          value={providerInput}
          onChange={(e) => setProviderInput(e.target.value)}
          aria-label="Deposit provider filter"
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="ccw-filter-label" htmlFor="dep-method">
          Method
        </label>
        <select
          id="dep-method"
          className="dep-filter-input"
          value={methodInput}
          onChange={(e) => setMethodInput(e.target.value)}
          aria-label="Deposit payment method filter"
        >
          {METHOD_OPTIONS.map((opt) => (
            <option key={opt.value || 'all-methods'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label className="ccw-filter-label" htmlFor="dep-status">
          Status
        </label>
        <select
          id="dep-status"
          className="dep-filter-input"
          value={statusInput}
          onChange={(e) => setStatusInput(e.target.value)}
          aria-label="Deposit status filter"
        >
          <option value="">All status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <div className="dep-date-range">
          <div className="dep-date-field">
            <label className="ccw-filter-label" htmlFor="dep-date-start">
              Start date
            </label>
            <input
              id="dep-date-start"
              type="date"
              className="dep-filter-input"
              value={startDateInput}
              onChange={(e) => handleStartDateChange(e.target.value)}
              max={endDateInput || undefined}
              aria-label="Start date filter"
            />
          </div>
          <div className="dep-date-field">
            <label className="ccw-filter-label" htmlFor="dep-date-end">
              End date
            </label>
            <input
              id="dep-date-end"
              type="date"
              className="dep-filter-input"
              value={endDateInput}
              onChange={(e) => handleEndDateChange(e.target.value)}
              min={startDateInput || undefined}
              aria-label="End date filter"
            />
          </div>
        </div>
        <button type="button" className="admin-btn admin-btn-secondary dep-apply" onClick={applyFilters}>
          Apply filters
        </button>
        <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={clearFilters}>
          Clear
        </button>
      </div>

      {loading ? (
        <p className="ccw-loading">Loading deposits…</p>
      ) : (
        <>
          <div className="ccw-table-wrap dep-table-wrap">
            <table className="ccw-table dep-table">
              <colgroup>
                <col className="dep-col-id" />
                <col className="dep-col-date" />
                {showDistributorColumn && <col className="dep-col-code" />}
                {showStoreColumn && <col className="dep-col-code" />}
                <col className="dep-col-player" />
                <col className="dep-col-amount" />
                <col className="dep-col-amount" />
                <col className="dep-col-amount" />
                <col className="dep-col-payment" />
                <col className="dep-col-ref" />
                <col className="dep-col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Date</th>
                  {showDistributorColumn && <th scope="col">Dist.</th>}
                  {showStoreColumn && <th scope="col">Store</th>}
                  <th scope="col">Player</th>
                  <th scope="col" className="ccw-th-amount">
                    Amount
                  </th>
                  <th scope="col" className="ccw-th-amount">
                    Received
                  </th>
                  <th scope="col" className="ccw-th-amount">
                    Fee
                  </th>
                  <th scope="col">Payment</th>
                  <th scope="col">Reference / Tx</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="ccw-empty">
                      No deposits found for your scope.
                    </td>
                  </tr>
                ) : (
                  list.map((r) => (
                    <tr key={r.id}>
                      <td className="ccw-td-id" title={`#${r.id}`}>
                        #{r.id}
                      </td>
                      <td className="ccw-td-date" title={formatDate(r.createdAt)}>
                        {formatDate(r.createdAt)}
                      </td>
                      {showDistributorColumn && (
                        <td className="ccw-td-store" title={r.user?.distributorCode || undefined}>
                          {r.user?.distributorCode || <span className="ccw-dash">—</span>}
                        </td>
                      )}
                      {showStoreColumn && (
                        <td className="ccw-td-store" title={r.user?.storeCode || undefined}>
                          {r.user?.storeCode || <span className="ccw-dash">—</span>}
                        </td>
                      )}
                      <td>
                        {r.userId != null || r.user ? (
                          <>
                            <span className="ccw-user-name">ID {r.userId ?? r.user?.userId}</span>
                            {(r.user?.username || `${r.user?.firstName || ''} ${r.user?.lastName || ''}`.trim()) ? (
                              <span
                                className="dep-player-username"
                                title={r.user?.username || undefined}
                              >
                                {r.user?.username
                                  ? `@${r.user.username}`
                                  : `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim()}
                              </span>
                            ) : null}
                            {showPlayerEmail && r.user?.email ? (
                              <span className="ccw-user-email">{r.user.email}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="ccw-user-name">—</span>
                        )}
                      </td>
                      <td className="ccw-td-amount">{formatAmount(r.amount)}</td>
                      <td className="ccw-td-amount">{formatAmount(r.receivedAmount)}</td>
                      <td
                        className="ccw-td-amount"
                        title={
                          r.feePercent != null && r.feeCharged != null
                            ? `${r.feePercent}% of completed amount`
                            : 'Fee applies only to completed deposits'
                        }
                      >
                        {formatAmount(r.feeCharged)}
                      </td>
                      <td className="dep-payment-cell">
                        <span className="dep-payment-method">{r.methodDisplayLabel || r.method || '—'}</span>
                        <span className="dep-payment-provider">{providerLabel(r)}</span>
                      </td>
                      <td className="dep-ref-cell">
                        {r.providerTransactionId || r.cryptoCurrency || r.txHash ? (
                          <>
                            {r.providerTransactionId && (
                              <span className="dep-mono dep-ref-line" title={r.providerTransactionId}>
                                {truncate(r.providerTransactionId, 28)}
                              </span>
                            )}
                            {(r.cryptoCurrency || r.txHash) && (
                              <span className="dep-tx-line">
                                {r.cryptoCurrency && <span className="dep-crypto">{r.cryptoCurrency}</span>}
                                {r.txHash && (
                                  <span className="dep-tx dep-mono" title={r.txHash}>
                                    {truncate(r.txHash, 24)}
                                  </span>
                                )}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="ccw-dash">—</span>
                        )}
                      </td>
                      <td>
                        <span className="dep-status">{r.status || '—'}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="dep-pager">
            <div className="dep-page-size-group">
              <label className="dep-page-size-label" htmlFor="dep-page-size">
                Entries
              </label>
              <select
                id="dep-page-size"
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

            {total > pageSize && (
              <div className="dep-pager-controls">
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
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
