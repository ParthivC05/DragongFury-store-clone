import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getChimeCashappWithdrawals, getChimeCashappWithdrawalAccountTotals, approveChimeCashappWithdrawal, rejectChimeCashappWithdrawal } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, canAccessAdminFeature } from '../constants/permissions'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import { formatTransactionDateTime, getDefaultEndTimeForDate } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import './ChimeCashappWithdrawals.css'
import './ChimeDeposits.css'
import './Users.css'

const DEFAULT_PAGE_SIZE = 100
const PER_PAGE_OPTIONS = [25, 50, 100, 200, 500]
const TABS = [
  { id: 'requests', label: 'Requests' },
  { id: 'totals', label: 'Account totals' }
]

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All statuses' }
]

const METHOD_OPTIONS = [
  { value: '', label: 'All methods' },
  { value: 'chime', label: 'Chime' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'paypal', label: 'PayPal' }
]

const PROVIDER_OPTIONS = [
  { value: '', label: 'All providers' },
  { value: 'manual', label: 'Manual (staff pays)' },
  { value: 'dollarpay', label: 'Dpay' },
  { value: 'xxpay', label: 'Xpay' }
]

function formatDate(d) {
  return formatTransactionDateTime(d)
}

function formatAmount(n, cur) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${cur || 'USD'} ${v.toFixed(2)}`
}

function isAutomatedPayout(row) {
  const provider = String(row?.paymentProvider || '').toLowerCase()
  return row?.payoutMode === 'automatic' || provider === 'dollarpay' || provider === 'xxpay'
}

function needsPaidFromTag(row) {
  const payoutType = String(row?.payoutType || '').toLowerCase()
  return !isAutomatedPayout(row) && (payoutType === 'chime' || payoutType === 'cashapp')
}

function payoutMethodLabel(payoutType) {
  const t = String(payoutType || '').toLowerCase()
  if (t === 'cashapp') return 'Cash App'
  if (t === 'chime') return 'Chime'
  return 'payout'
}

function normalizePaidFromTag(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ')
}

function MethodBadge({ payoutType }) {
  if (payoutType === 'paypal') {
    return <span className="ccw-method ccw-method-cashapp">PayPal</span>
  }
  const isChime = payoutType === 'chime'
  return (
    <span className={`ccw-method ${isChime ? 'ccw-method-chime' : 'ccw-method-cashapp'}`}>
      {isChime ? 'Chime' : 'Cash App'}
    </span>
  )
}

function ModeBadge({ paymentProvider, payoutMode }) {
  const provider = String(paymentProvider || '').toLowerCase()
  const isAuto = payoutMode === 'automatic' || provider === 'dollarpay' || provider === 'xxpay'
  if (isAuto) {
    const label =
      provider === 'xxpay' ? 'Xpay' : provider === 'dollarpay' ? 'Dpay' : 'Provider'
    return (
      <span
        className="ccw-mode ccw-mode-auto"
        title={`Automatic — ${label} will pay after you approve`}
      >
        Automatic
        <span className="ccw-mode-sub">{label}</span>
      </span>
    )
  }
  return (
    <span
      className="ccw-mode ccw-mode-manual"
      title="Manual — you pay the player yourself after approve"
    >
      Manual
      <span className="ccw-mode-sub">Staff pays</span>
    </span>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending', cls: 'ccw-badge-pending' },
    processing: { label: 'Processing', cls: 'ccw-badge-pending' },
    completed: { label: 'Completed', cls: 'ccw-badge-completed' },
    failed: { label: 'Failed', cls: 'ccw-badge-rejected' },
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
  if (status === 'pending' || (!approvedBy?.displayName && !approvedAt)) {
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

export default function ChimeCashappWithdrawals() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: DEFAULT_PAGE_SIZE })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [methodFilter, setMethodFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveModalRow, setApproveModalRow] = useState(null)
  const [paidFromTag, setPaidFromTag] = useState('')
  const [tab, setTab] = useState('requests')
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

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit }
    if (statusFilter) params.status = statusFilter
    if (methodFilter) params.payoutType = methodFilter
    if (providerFilter) params.paymentProvider = providerFilter
    getChimeCashappWithdrawals(params)
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
  }, [statusFilter, methodFilter, providerFilter, page, limit, toast])

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
    getChimeCashappWithdrawalAccountTotals(params)
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

  const canSeeAccountTotals =
    user?.role === ROLES.MASTER_ADMIN && canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS)

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
  }, [statusFilter, methodFilter, providerFilter, limit])

  function closeApproveModal() {
    if (approvingId != null) return
    setApproveModalRow(null)
    setPaidFromTag('')
  }

  function startApprove(row) {
    if (!row) return
    if (needsPaidFromTag(row)) {
      setApproveModalRow(row)
      setPaidFromTag('')
      return
    }
    approve(row)
  }

  async function approve(row, paidFromTagOverride) {
    if (!row?.id) return
    const isAuto = isAutomatedPayout(row)
    const autoLabel = String(row?.paymentProvider || '').toLowerCase() === 'xxpay' ? 'Xpay' : 'Dpay'
    const requireTag = needsPaidFromTag(row)
    const tag = normalizePaidFromTag(paidFromTagOverride ?? paidFromTag)

    if (requireTag && !tag) {
      return
    }

    if (row.neverDeposited && !requireTag) {
      const ok = await confirm({
        title: 'This user has not deposited yet',
        message:
          'This user has not deposited yet. After you approve this withdrawal request, their wallet will be set to 0.',
        confirmLabel: 'Approve anyway',
        cancelLabel: 'Cancel',
        variant: 'danger'
      })
      if (!ok) return
    }
    setApprovingId(row.id)
    try {
      await approveChimeCashappWithdrawal(row.id, requireTag ? { paidFromTag: tag } : {})
      toast.success(
        isAuto
          ? `Approved. ${autoLabel} is paying automatically — status will update when done.`
          : 'Approved. Pay the player manually (Manual request). Player balance updated.'
      )
      setApproveModalRow(null)
      setPaidFromTag('')
      await load()
    } catch (err) {
      toast.error(err.message || 'Approve failed')
    } finally {
      setApprovingId(null)
    }
  }

  async function reject(id) {
    if (rejectingId !== id) {
      setRejectingId(id)
      setRejectReason('')
      return
    }
    try {
      await rejectChimeCashappWithdrawal(id, rejectReason.trim())
      toast.success('Request rejected. Frozen funds released.')
      setRejectingId(null)
      setRejectReason('')
      await load()
    } catch (err) {
      toast.error(err.message || 'Reject failed')
    }
  }

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

  const showStoreColumn = user?.role === ROLES.MASTER_ADMIN || user?.role === ROLES.DISTRIBUTOR_ADMIN
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const colCount = showStoreColumn ? 13 : 12
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
        <h1 className="ccw-title">Chime, CashApp and PayPal withdrawals</h1>
        <p className="ccw-subtitle">
          <strong>Manual</strong> = you pay the player yourself after approve. For Chime / Cash App, enter the tag you are paying from.
          {' '}
          <strong>Automatic (Dpay / Xpay)</strong> = system pays after you approve; wait for Processing → Completed.
        </p>
      </header>

      {canSeeAccountTotals ? (
        <div className="ccd-tabs" role="tablist" aria-label="Withdrawal sections">
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
              label="Paid"
              startDate={totalsStartDate}
              endDate={totalsEndDate}
              onStartDateChange={setTotalsStartDate}
              onEndDateChange={setTotalsEndDate}
            />
            <div className="ccw-toolbar ccd-totals-toolbar">
              {showStoreColumn ? (
                <>
                  <label htmlFor="ccw-totals-store" className="ccw-filter-label">
                    Store
                  </label>
                  <select
                    id="ccw-totals-store"
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
              <label htmlFor="ccw-totals-tag" className="ccw-filter-label">
                Paid from tag
              </label>
              <input
                id="ccw-totals-tag"
                type="search"
                className="ccd-filter-input"
                value={totalsUsername}
                onChange={(e) => setTotalsUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyTotalsFilters()
                }}
                placeholder="Search paid-from tag"
                aria-label="Filter by paid from tag"
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
            Total USD paid from each staff tag on completed manual Chime / Cash App withdrawals.
            Date filter uses approval time (when staff paid).
            {totalsSummary ? (
              <>
                {' '}
                <strong>{formatAmount(totalsSummary.totalAmount, totalsSummary.currency)}</strong>
                {' '}across {totalsSummary.accountCount} tag
                {totalsSummary.accountCount === 1 ? '' : 's'}
                {' '}({totalsSummary.payoutCount} payout
                {totalsSummary.payoutCount === 1 ? '' : 's'}).
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
                    <th scope="col">Paid from tag</th>
                    {showStoreColumn && <th scope="col">Store</th>}
                    <th scope="col">Payouts</th>
                    <th scope="col">Total paid</th>
                    <th scope="col">Last paid</th>
                  </tr>
                </thead>
                <tbody>
                  {totalsList.length === 0 ? (
                    <tr>
                      <td colSpan={totalsColCount} className="ccw-empty">
                        No completed manual Chime / Cash App payouts match this filter.
                      </td>
                    </tr>
                  ) : (
                    totalsList.map((r, idx) => (
                      <tr key={`${r.paidFromTag || 'unknown'}-${r.storeCode || ''}-${idx}`}>
                        <td title={r.paidFromTag || undefined}>
                          {r.paidFromTag || <span className="ccw-dash">Unknown</span>}
                        </td>
                        {showStoreColumn && (
                          <td title={r.storeCode || undefined}>
                            {r.storeCode || <span className="ccw-dash">—</span>}
                          </td>
                        )}
                        <td>{r.payoutCount}</td>
                        <td>{formatAmount(r.totalAmount, r.currency)}</td>
                        <td>
                          {r.lastPaidAt ? formatDate(r.lastPaidAt) : <span className="ccw-dash">—</span>}
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
        <label htmlFor="ccw-status" className="ccw-filter-label">
          Status
        </label>
        <select
          id="ccw-status"
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
        <label htmlFor="ccw-method" className="ccw-filter-label">
          Method
        </label>
        <select
          id="ccw-method"
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="ccw-select"
          aria-label="Filter by payment method"
        >
          {METHOD_OPTIONS.map((o) => (
            <option key={o.value || 'all-methods'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label htmlFor="ccw-provider" className="ccw-filter-label">
          Provider
        </label>
        <select
          id="ccw-provider"
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="ccw-select"
          aria-label="Filter by payment provider"
        >
          {PROVIDER_OPTIONS.map((o) => (
            <option key={o.value || 'all-providers'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="ccw-loading">Loading requests…</p>
      ) : (
        <div className="ccw-table-wrap">
          <table className="ccw-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Date</th>
                {showStoreColumn && <th scope="col">Store</th>}
                <th scope="col">User</th>
                <th scope="col">Method</th>
                <th scope="col" title="Manual = staff pays. Automatic = Dpay / Xpay pays.">
                  Mode
                </th>
                <th scope="col">Username</th>
                <th scope="col" title="Chime $cashtag staff paid from on manual payouts">
                  Paid from
                </th>
                <th scope="col" className="ccw-th-amount">
                  Amount
                </th>
                <th scope="col">Status</th>
                <th scope="col">Processed by</th>
                <th scope="col" title="How long after the request was submitted until it was approved. Late if over 3 minutes.">
                  Approval wait
                </th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="ccw-empty">
                    No withdrawal requests match this filter.
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className={r.neverDeposited ? 'ccw-row-never-deposited' : undefined}>
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
                          {r.neverDeposited ? (
                            <span
                              className="ccw-no-deposit-badge"
                              title="This user has not deposited yet. Approving will set their wallet to 0."
                            >
                              No deposit
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="ccw-user-name">—</span>
                      )}
                    </td>
                    <td>
                      <MethodBadge payoutType={r.payoutType} />
                    </td>
                    <td>
                      <ModeBadge paymentProvider={r.paymentProvider} payoutMode={r.payoutMode} />
                    </td>
                    <td className="ccw-td-username" title={r.destinationUsername}>
                      {r.destinationUsername || '—'}
                    </td>
                    <td className="ccw-td-username" title={r.paidFromTag || undefined}>
                      {r.paidFromTag || <span className="ccw-dash">—</span>}
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
                      <div className="ccw-actions">
                        {r.userId ? (
                          <Link
                            className="admin-btn admin-btn-sm admin-btn-edit"
                            to={`/users/${r.userId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open user profile in a new tab to review details before payout"
                          >
                            Open profile
                          </Link>
                        ) : null}
                        {r.status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-success"
                              disabled={approvingId === r.id}
                              onClick={() => startApprove(r)}
                              title={
                                r.neverDeposited
                                  ? 'This user has not deposited yet. Approving will set their wallet to 0.'
                                  : isAutomatedPayout(r)
                                    ? `Approve and send via ${
                                        String(r.paymentProvider || '').toLowerCase() === 'xxpay'
                                          ? 'Xpay'
                                          : 'Dpay'
                                      } (Automatic)`
                                    : needsPaidFromTag(r)
                                      ? 'Approve Manual payout — enter the tag you are paying from'
                                      : 'Approve Manual payout — then pay the player yourself'
                              }
                            >
                              {approvingId === r.id
                                ? 'Approving…'
                                : r.payoutMode === 'automatic' ||
                                    ['dollarpay', 'xxpay'].includes(String(r.paymentProvider || '').toLowerCase())
                                  ? 'Approve (Auto)'
                                  : 'Approve (Manual)'}
                            </button>
                            {rejectingId !== r.id ? (
                              <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => reject(r.id)}>
                                Reject
                              </button>
                            ) : (
                              <div className="ccw-reject-inline">
                                <input
                                  type="text"
                                  placeholder="Reason (optional)"
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  className="ccw-reject-input"
                                  aria-label="Rejection reason"
                                />
                                <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => reject(r.id)}>
                                  Confirm
                                </button>
                                <button type="button" className="admin-btn admin-btn-sm" onClick={() => { setRejectingId(null); setRejectReason('') }}>
                                  Cancel
                                </button>
                              </div>
                            )}
                          </>
                        ) : r.status === 'processing' ? (
                          <span className="ccw-muted">
                            Waiting for {String(r.paymentProvider || '').toLowerCase() === 'xxpay' ? 'Xpay' : 'Dpay'}…
                          </span>
                        ) : !r.userId ? (
                          <span className="ccw-muted">—</span>
                        ) : null}
                      </div>
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
            <label htmlFor="ccw-per-page">Per page</label>
            <select
              id="ccw-per-page"
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
          aria-labelledby="ccw-approve-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeApproveModal()
          }}
        >
          <div className="ccd-approve-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 id="ccw-approve-modal-title" className="ccd-approve-modal-title">
              Confirm manual {payoutMethodLabel(approveModalRow.payoutType)} payout
            </h2>
            <p className="ccd-approve-modal-lead">
              Please enter the paying tag you pay{' '}
              <strong>{formatAmount(approveModalRow.amount, approveModalRow.currency)}</strong>
              {' '}to this user.
            </p>
            <dl className="ccd-approve-modal-dl">
              <div className="ccd-approve-modal-row">
                <dt>Player</dt>
                <dd>
                  <span className="ccd-approve-modal-strong">ID {approveModalRow.userId}</span>
                  {approveModalRow.user?.username ? (
                    <span className="ccd-approve-modal-sub"> @{approveModalRow.user.username}</span>
                  ) : null}
                </dd>
              </div>
              <div className="ccd-approve-modal-row">
                <dt>Pay to</dt>
                <dd className="ccd-approve-modal-mono">{approveModalRow.destinationUsername || '—'}</dd>
              </div>
              <div className="ccd-approve-modal-row ccd-approve-modal-row-highlight">
                <dt>Amount</dt>
                <dd className="ccd-approve-modal-amount">
                  {formatAmount(approveModalRow.amount, approveModalRow.currency)}
                </dd>
              </div>
            </dl>
            {approveModalRow.neverDeposited ? (
              <p className="ccw-paid-from-warning">
                This user has not deposited yet. Approving will set their wallet to 0.
              </p>
            ) : null}
            <label htmlFor="ccw-paid-from-tag" className="ccd-paid-from-field">
              Paying from tag
              <input
                id="ccw-paid-from-tag"
                type="text"
                value={paidFromTag}
                onChange={(e) => setPaidFromTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && normalizePaidFromTag(paidFromTag) && approvingId == null) {
                    e.preventDefault()
                    approve(approveModalRow, paidFromTag)
                  }
                }}
                className="ccd-paid-from-input"
                placeholder="$yourtag"
                autoComplete="off"
                autoFocus
                disabled={approvingId != null}
                aria-required="true"
              />
            </label>
            <div className="ccd-approve-modal-actions">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={approvingId != null}
                onClick={closeApproveModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-success"
                disabled={approvingId != null || !normalizePaidFromTag(paidFromTag)}
                onClick={() => approve(approveModalRow, paidFromTag)}
              >
                {approvingId === approveModalRow.id ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
