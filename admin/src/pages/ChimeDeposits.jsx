import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getChimeDeposits,
  getChimeDepositAccountTotals,
  approveChimeDeposit,
  rejectChimeDeposit
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, STORE_FEATURE_KEYS, canAccessAdminFeature, canAccessFeature } from '../constants/permissions'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import { formatTransactionDateTime, getDefaultEndTimeForDate } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import './ChimeCashappWithdrawals.css'
import './ChimeDeposits.css'
import './Users.css'

const DEFAULT_PAGE_SIZE = 50
const PER_PAGE_OPTIONS = [25, 50, 100, 200, 500]
const TABS = [
  { id: 'requests', label: 'Requests' },
  { id: 'totals', label: 'Account totals' }
]

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All statuses' }
]

function formatDate(d) {
  return formatTransactionDateTime(d)
}

function formatAmount(n, cur) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${cur || 'USD'} ${v.toFixed(2)}`
}

function chimeDepositPlayerLabel(r) {
  if (r.user) {
    const full = `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim()
    return full || r.user.username || `User #${r.userId}`
  }
  return `User #${r.userId}`
}

function MethodBadge({ depositType }) {
  const isChime = depositType === 'chime'
  return (
    <span className={`ccw-method ${isChime ? 'ccw-method-chime' : 'ccw-method-cashapp'}`}>
      {isChime ? 'Chime' : 'Cash App'}
    </span>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending', cls: 'ccw-badge-pending' },
    processing: { label: 'Processing', cls: 'ccw-badge-pending' },
    completed: { label: 'Completed', cls: 'ccw-badge-completed' },
    rejected: { label: 'Rejected', cls: 'ccw-badge-rejected' }
  }
  const s = map[status] || { label: status || '—', cls: '' }
  return <span className={`ccw-badge ${s.cls}`}>{s.label}</span>
}

function roleShort(role) {
  if (!role) return ''
  const m = {
    store_admin: 'Store admin',
    master_admin: 'Super admin',
    distributor_admin: 'Distributor admin',
    user: 'User'
  }
  return m[role] || role
}

function approverAssignedRoleLabel(approvedBy) {
  if (approvedBy?.panelRoleName) return approvedBy.panelRoleName
  return roleShort(approvedBy.role)
}

const LATE_AFTER_MS = 3 * 60 * 1000

function formatWaitDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) {
    return totalSec <= 1 ? '1 sec' : `${totalSec} sec`
  }
  const totalMin = Math.floor(totalSec / 60)
  if (totalMin < 60) {
    return totalMin === 1 ? '1 min' : `${totalMin} min`
  }
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours < 24) {
    if (mins === 0) return hours === 1 ? '1 hr' : `${hours} hr`
    return `${hours} hr ${mins} min`
  }
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  if (remHours === 0) return days === 1 ? '1 day' : `${days} days`
  return `${days} day${days === 1 ? '' : 's'} ${remHours} hr`
}

/** How long after the request was created it was approved; Late if over 3 minutes. */
function ApprovalWaitCell({ status, createdAt, approvedAt }) {
  if (status !== 'completed' || !createdAt || !approvedAt) {
    return <span className="ccw-dash">—</span>
  }
  const start = new Date(createdAt).getTime()
  const end = new Date(approvedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return <span className="ccw-dash">—</span>
  }
  const waitMs = end - start
  const duration = formatWaitDuration(waitMs)
  const isLate = waitMs > LATE_AFTER_MS
  return (
    <div className={`ccw-wait ${isLate ? 'ccw-wait-late' : 'ccw-wait-ontime'}`}>
      <span className={`ccw-wait-badge ${isLate ? 'ccw-wait-badge-late' : 'ccw-wait-badge-ontime'}`}>
        {isLate ? 'Late' : 'On time'}
      </span>
      <span className="ccw-wait-detail" title={`Approved ${duration} after the request was submitted`}>
        Approved after {duration}
      </span>
    </div>
  )
}

function ProcessedByCell({ status, approvedBy, approvedAt }) {
  if (status === 'pending' || status === 'processing' || (!approvedBy?.displayName && !approvedAt)) {
    return <span className="ccw-dash">—</span>
  }
  const sub = approvedBy?.displayName ? approverAssignedRoleLabel(approvedBy) : null
  return (
    <div className="ccw-processed-by">
      {approvedBy?.displayName ? (
        <>
          <span className="ccw-processed-by-name">{approvedBy.displayName}</span>
          {sub ? <span className="ccw-processed-by-role">{sub}</span> : null}
        </>
      ) : null}
      {status === 'completed' && approvedAt ? (
        <span className="ccw-approved-at" title={formatDate(approvedAt)}>
          {formatDate(approvedAt)}
        </span>
      ) : null}
    </div>
  )
}

export default function ChimeDeposits() {
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState('requests')
  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: DEFAULT_PAGE_SIZE })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [approvingId, setApprovingId] = useState(null)
  const [approveModalRow, setApproveModalRow] = useState(null)
  const [rejectModalRow, setRejectModalRow] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [totals, setTotals] = useState({ list: [], summary: null, stores: [] })
  const [totalsLoading, setTotalsLoading] = useState(false)
  const [totalsStartDate, setTotalsStartDate] = useState('')
  const [totalsEndDate, setTotalsEndDate] = useState('')
  const [totalsStore, setTotalsStore] = useState('')
  const [totalsUsername, setTotalsUsername] = useState('')
  const [appliedTotals, setAppliedTotals] = useState({
    startDate: '',
    endDate: '',
    storeCode: '',
    username: ''
  })

  useEffect(() => {
    if (!approveModalRow || approvingId != null) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setApproveModalRow(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [approveModalRow, approvingId])

  useEffect(() => {
    if (!rejectModalRow || rejectingId != null) return
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setRejectModalRow(null)
        setRejectReason('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rejectModalRow, rejectingId])

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit }
    if (statusFilter) params.status = statusFilter
    getChimeDeposits(params)
      .then((res) => {
        setData({
          list: res.list || [],
          total: res.total ?? 0,
          page: res.page ?? page,
          limit: res.limit ?? limit
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load')
        setData({ list: [], total: 0, page: 1, limit })
      })
      .finally(() => setLoading(false))
  }, [statusFilter, page, limit, toast])

  const loadTotals = useCallback(() => {
    setTotalsLoading(true)
    const params = {}
    if (totalsStartDate) {
      params.startDate = totalsStartDate
      params.startTime = '00:00'
    }
    if (totalsEndDate) {
      params.endDate = totalsEndDate
      params.endTime = getDefaultEndTimeForDate(totalsEndDate)
    }
    if (totalsStore.trim()) params.storeCode = totalsStore.trim()
    if (appliedTotals.username) params.username = appliedTotals.username
    getChimeDepositAccountTotals(params)
      .then((res) => {
        setTotals({
          list: res.list || [],
          summary: res.summary || null,
          stores: res.stores || []
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load account totals')
        setTotals((prev) => ({ list: [], summary: null, stores: prev.stores || [] }))
      })
      .finally(() => setTotalsLoading(false))
  }, [totalsStartDate, totalsEndDate, totalsStore, appliedTotals.username, toast])

  const canSeeAccountTotals = user?.role === ROLES.MASTER_ADMIN
    ? canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS)
    : canAccessFeature(user, STORE_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS)

  useEffect(() => {
    if (!user) return
    if (tab === 'totals' && canSeeAccountTotals) loadTotals()
    else load()
  }, [user, tab, canSeeAccountTotals, load, loadTotals])

  useEffect(() => {
    if (tab === 'totals' && !canSeeAccountTotals) setTab('requests')
  }, [tab, canSeeAccountTotals])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, limit])

  function applyTotalsFilters() {
    setAppliedTotals((prev) => ({
      ...prev,
      username: totalsUsername.trim()
    }))
  }

  function clearTotalsFilters() {
    setTotalsStartDate('')
    setTotalsEndDate('')
    setTotalsStore('')
    setTotalsUsername('')
    setAppliedTotals({
      startDate: '',
      endDate: '',
      storeCode: '',
      username: ''
    })
  }

  async function approve(id) {
    setApprovingId(id)
    try {
      await approveChimeDeposit(id)
      toast.success('Deposit approved. Player wallet credited.')
      await load()
    } catch (err) {
      toast.error(err.message || 'Approve failed')
    } finally {
      setApprovingId(null)
      setApproveModalRow(null)
    }
  }

  async function reject(id) {
    setRejectingId(id)
    try {
      await rejectChimeDeposit(id, rejectReason.trim())
      toast.success('Request rejected.')
      await load()
    } catch (err) {
      toast.error(err.message || 'Reject failed')
    } finally {
      setRejectingId(null)
      setRejectReason('')
      setRejectModalRow(null)
    }
  }

  const showStoreColumn = user?.role === ROLES.MASTER_ADMIN || user?.role === ROLES.DISTRIBUTOR_ADMIN
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const colCount = showStoreColumn ? 11 : 10
  const list = data.list || []
  const totalPages = Math.ceil(data.total / limit) || 1
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, data.total)
  const totalsList = totals.list || []
  const totalsColCount = showStoreColumn ? 5 : 4
  const totalsSummary = totals.summary

  return (
    <div className="ccw-page ccd-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Chime deposits</h1>
        <p className="ccw-subtitle">
          Review and approve manual Chime deposit requests for your store.
        </p>
      </header>

      {canSeeAccountTotals ? (
        <div className="ccd-tabs" role="tablist" aria-label="Chime deposits sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`ccd-tab${tab === item.id ? ' ccd-tab-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'totals' && canSeeAccountTotals ? (
        <>
          <div className="ccd-totals-filters">
            <DateRangeFilter
              label="Submitted"
              startDate={totalsStartDate}
              endDate={totalsEndDate}
              onStartDateChange={setTotalsStartDate}
              onEndDateChange={setTotalsEndDate}
            />
            <div className="ccw-toolbar ccd-totals-toolbar">
              {showStoreColumn ? (
                <>
                  <label htmlFor="ccd-totals-store" className="ccw-filter-label">
                    Store
                  </label>
                  <select
                    id="ccd-totals-store"
                    className="ccw-select"
                    value={totalsStore}
                    onChange={(e) => setTotalsStore(e.target.value)}
                    aria-label="Filter by store"
                  >
                    <option value="">All stores</option>
                    {(totals.stores || []).map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label htmlFor="ccd-totals-username" className="ccw-filter-label">
                Chime username
              </label>
              <input
                id="ccd-totals-username"
                type="search"
                className="ccd-filter-input"
                value={totalsUsername}
                onChange={(e) => setTotalsUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyTotalsFilters()
                }}
                placeholder="Search pay-to username"
                aria-label="Filter by Chime username"
              />
              <button type="button" className="admin-btn admin-btn-secondary" onClick={applyTotalsFilters}>
                Apply filters
              </button>
              <button type="button" className="admin-btn admin-btn-sm" onClick={clearTotalsFilters}>
                Clear
              </button>
            </div>
          </div>
          <p className="ccd-totals-lead">
            Total USD received on each pay-to Chime account from completed deposits.
            Date filter matches dashboard payment totals (submitted time, your local timezone).
            {totalsSummary ? (
              <>
                {' '}
                <strong>{formatAmount(totalsSummary.totalAmount, totalsSummary.currency)}</strong>
                {' '}across {totalsSummary.accountCount} account
                {totalsSummary.accountCount === 1 ? '' : 's'}
                {' '}({totalsSummary.depositCount} deposit
                {totalsSummary.depositCount === 1 ? '' : 's'}).
              </>
            ) : null}
          </p>
          {totalsLoading ? (
            <p className="ccw-loading">Loading account totals…</p>
          ) : (
            <div className="ccw-table-wrap ccd-table-wrap">
              <table className={`ccw-table ccd-totals-table${showStoreColumn ? ' ccd-table--with-store' : ''}`}>
                <colgroup>
                  <col className="ccd-totals-col-user" />
                  {showStoreColumn && <col className="ccd-totals-col-store" />}
                  <col className="ccd-totals-col-count" />
                  <col className="ccd-totals-col-amount" />
                  <col className="ccd-totals-col-date" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Chime username</th>
                    {showStoreColumn && <th scope="col">Store</th>}
                    <th scope="col">Deposits</th>
                    <th scope="col">Total received</th>
                    <th scope="col">Last received</th>
                  </tr>
                </thead>
                <tbody>
                  {totalsList.length === 0 ? (
                    <tr>
                      <td colSpan={totalsColCount} className="ccw-empty">
                        No completed Chime deposits match this filter.
                      </td>
                    </tr>
                  ) : (
                    totalsList.map((r, idx) => (
                      <tr key={`${r.destinationUsername || 'unknown'}-${r.storeCode || ''}-${idx}`}>
                        <td title={r.destinationUsername || undefined}>
                          {r.destinationUsername || <span className="ccw-dash">Unknown</span>}
                        </td>
                        {showStoreColumn && (
                          <td title={r.storeCode || undefined}>
                            {r.storeCode || <span className="ccw-dash">—</span>}
                          </td>
                        )}
                        <td>{r.depositCount}</td>
                        <td>{formatAmount(r.totalAmount, r.currency)}</td>
                        <td>
                          {r.lastReceivedAt ? formatDate(r.lastReceivedAt) : <span className="ccw-dash">—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
      <div className="ccw-toolbar">
        <label htmlFor="ccd-status" className="ccw-filter-label">
          Status
        </label>
        <select
          id="ccd-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ccw-select"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="ccw-loading">Loading requests…</p>
      ) : (
        <div className="ccw-table-wrap ccd-table-wrap">
          <table className={`ccw-table ccd-table${showStoreColumn ? ' ccd-table--with-store' : ''}`}>
            <colgroup>
              <col className="ccd-col-id" />
              <col className="ccd-col-date" />
              {showStoreColumn && <col className="ccd-col-store" />}
              <col className="ccd-col-user" />
              <col className="ccd-col-method" />
              <col className="ccd-col-sender" />
              <col className="ccd-col-payto" />
              <col className="ccd-col-amount" />
              <col className="ccd-col-status" />
              <col className="ccd-col-processed" />
              <col className="ccd-col-wait" />
              <col className="ccd-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Date</th>
                {showStoreColumn && <th scope="col">Store</th>}
                <th scope="col">User</th>
                <th scope="col">Method</th>
                <th scope="col">Sender</th>
                <th scope="col">Pay to</th>
                <th scope="col" className="ccw-th-amount">
                  Amount
                </th>
                <th scope="col">Status</th>
                <th scope="col">Processed by</th>
                <th
                  scope="col"
                  title="How long after the request was submitted until it was approved. Late if over 3 minutes."
                >
                  Approval wait
                </th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="ccw-empty">
                    No deposit requests match this filter.
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id}>
                    <td className="ccw-td-id">#{r.id}</td>
                    <td className="ccw-td-date">{formatDate(r.createdAt)}</td>
                    {showStoreColumn && (
                      <td className="ccw-td-store" title={r.storeCode || undefined}>
                        {r.storeCode || <span className="ccw-dash">—</span>}
                      </td>
                    )}
                    <td>
                      {r.userId != null || r.user ? (
                        <>
                          <span className="ccw-user-name">ID {r.userId ?? r.user?.userId}</span>
                          {r.user?.username ? (
                            <span className="ccw-user-email">@{r.user.username}</span>
                          ) : `${r.user?.firstName || ''} ${r.user?.lastName || ''}`.trim() ? (
                            <span className="ccw-user-email">
                              {`${r.user.firstName || ''} ${r.user.lastName || ''}`.trim()}
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
                    <td>
                      <MethodBadge depositType={r.depositType} />
                    </td>
                    <td className="ccw-td-username" title={r.sourceUsername}>
                      {r.sourceUsername || '—'}
                    </td>
                    <td className="ccw-td-username" title={r.destinationUsername || undefined}>
                      {r.destinationUsername || <span className="ccw-dash">—</span>}
                    </td>
                    <td className="ccw-td-amount">{formatAmount(r.amount, r.currency)}</td>
                    <td>
                      <div>
                        <StatusBadge status={r.status} />
                        {r.status === 'rejected' && r.rejectionReason && (
                          <div
                            style={{
                              marginTop: '0.35rem',
                              fontSize: '0.72rem',
                              color: '#991b1b',
                              maxWidth: '12rem',
                              lineHeight: 1.35
                            }}
                            title={r.rejectionReason}
                          >
                            {r.rejectionReason.length > 80 ? `${r.rejectionReason.slice(0, 80)}…` : r.rejectionReason}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <ProcessedByCell status={r.status} approvedBy={r.approvedBy} approvedAt={r.approvedAt} />
                    </td>
                    <td className="ccw-td-wait">
                      <ApprovalWaitCell status={r.status} createdAt={r.createdAt} approvedAt={r.approvedAt} />
                    </td>
                    <td className="ccw-td-actions">
                      {r.status === 'pending' ? (
                        <div className="ccw-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-success"
                            disabled={approvingId === r.id}
                            onClick={() => {
                              setRejectModalRow(null)
                              setRejectReason('')
                              setApproveModalRow(r)
                            }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            disabled={rejectingId === r.id}
                            onClick={() => {
                              setApproveModalRow(null)
                              setRejectReason('')
                              setRejectModalRow(r)
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="ccw-dash">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (data.total > 0 || totalPages > 1) && (
        <div className="pagination">
          <div className="pagination-per-page">
            <label htmlFor="ccd-per-page">Per page</label>
            <select
              id="ccd-per-page"
              className="pagination-select"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <span className="pagination-info">
            {data.total > 0 ? `Showing ${from}–${to} of ${data.total}` : 'No results'}
            {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              className="admin-btn admin-btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
        </>
      )}

      {approveModalRow ? (
        <div
          className="ccd-approve-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ccd-approve-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && approvingId == null) setApproveModalRow(null)
          }}
        >
          <div className="ccd-approve-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="ccd-approve-modal-title" className="ccd-approve-modal-title">
              Confirm Chime deposit approval
            </h2>
            <p className="ccd-approve-modal-lead">
              Only approve if you already have their Chime payment. If what you see below matches what you received,
              approve to add that money to their balance.
            </p>
            <dl className="ccd-approve-modal-dl">
              <div className="ccd-approve-modal-row">
                <dt>Submitted</dt>
                <dd>{formatDate(approveModalRow.createdAt)}</dd>
              </div>
              {showStoreColumn && (approveModalRow.storeCode || approveModalRow.distributorCode) ? (
                <div className="ccd-approve-modal-row">
                  <dt>Store / distributor</dt>
                  <dd>
                    {[approveModalRow.storeCode, approveModalRow.distributorCode].filter(Boolean).join(' · ') || '—'}
                  </dd>
                </div>
              ) : null}
              <div className="ccd-approve-modal-row">
                <dt>Player</dt>
                <dd>
                  <span className="ccd-approve-modal-strong">ID {approveModalRow.userId}</span>
                  {approveModalRow.user?.username ? (
                    <span className="ccd-approve-modal-sub"> @{approveModalRow.user.username}</span>
                  ) : null}
                  {showPlayerEmail && approveModalRow.user?.email ? (
                    <span className="ccd-approve-modal-sub">
                      <br />
                      {approveModalRow.user.email}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="ccd-approve-modal-row">
                <dt>Method</dt>
                <dd>
                  <MethodBadge depositType={approveModalRow.depositType} />
                </dd>
              </div>
              <div className="ccd-approve-modal-row">
                <dt>Sender (player Chime)</dt>
                <dd className="ccd-approve-modal-mono">{approveModalRow.sourceUsername || '—'}</dd>
              </div>
              <div className="ccd-approve-modal-row">
                <dt>Pay to (your store account)</dt>
                <dd className="ccd-approve-modal-mono">{approveModalRow.destinationUsername || '—'}</dd>
              </div>
              <div className="ccd-approve-modal-row ccd-approve-modal-row-highlight">
                <dt>Amount to credit</dt>
                <dd className="ccd-approve-modal-amount">{formatAmount(approveModalRow.amount, approveModalRow.currency)}</dd>
              </div>
            </dl>
            <div className="ccd-approve-modal-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={approvingId != null}
                onClick={() => setApproveModalRow(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-success"
                disabled={approvingId != null}
                onClick={() => approve(approveModalRow.id)}
              >
                {approvingId === approveModalRow.id ? 'Processing…' : 'Approve and credit wallet'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectModalRow ? (
        <div
          className="ccd-approve-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ccd-reject-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && rejectingId == null) {
              setRejectModalRow(null)
              setRejectReason('')
            }
          }}
        >
          <div className="ccd-approve-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="ccd-reject-modal-title" className="ccd-approve-modal-title">
              Confirm Chime deposit rejection
            </h2>
            <p className="ccd-approve-modal-lead">
              Reject only when payment is invalid or not received. You can add an optional reason shown to the player.
            </p>
            <dl className="ccd-approve-modal-dl">
              <div className="ccd-approve-modal-row">
                <dt>Submitted</dt>
                <dd>{formatDate(rejectModalRow.createdAt)}</dd>
              </div>
              <div className="ccd-approve-modal-row">
                <dt>Player</dt>
                <dd>
                  <span className="ccd-approve-modal-strong">{chimeDepositPlayerLabel(rejectModalRow)}</span>
                </dd>
              </div>
              <div className="ccd-approve-modal-row">
                <dt>Sender (player Chime)</dt>
                <dd className="ccd-approve-modal-mono">{rejectModalRow.sourceUsername || '—'}</dd>
              </div>
              <div className="ccd-approve-modal-row">
                <dt>Pay to (your store account)</dt>
                <dd className="ccd-approve-modal-mono">{rejectModalRow.destinationUsername || '—'}</dd>
              </div>
              <div className="ccd-approve-modal-row ccd-approve-modal-row-highlight">
                <dt>Amount</dt>
                <dd className="ccd-approve-modal-amount">{formatAmount(rejectModalRow.amount, rejectModalRow.currency)}</dd>
              </div>
            </dl>
            <label className="ccd-reject-reason-field" htmlFor="ccd-reject-reason">
              Rejection reason (optional)
              <textarea
                id="ccd-reject-reason"
                placeholder="Write a short reason to help the player understand why this request was rejected."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="ccd-reject-reason-input"
                aria-label="Rejection reason"
                disabled={rejectingId != null}
                maxLength={2000}
                rows={4}
              />
              <span className="ccd-reject-reason-meta">{rejectReason.length}/2000</span>
            </label>
            <div className="ccd-approve-modal-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={rejectingId != null}
                onClick={() => {
                  setRejectModalRow(null)
                  setRejectReason('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                disabled={rejectingId != null}
                onClick={() => reject(rejectModalRow.id)}
              >
                {rejectingId === rejectModalRow.id ? 'Processing…' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
