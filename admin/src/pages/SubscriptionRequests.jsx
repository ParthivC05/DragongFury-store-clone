import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getSubscriptionRequests, approveSubscriptionRequest, rejectSubscriptionRequest } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import './Distributors.css'
import './Users.css'
import './MySubscription.css'

const PER_PAGE_OPTIONS = [10, 20, 50]
const STATUS_OPTIONS = ['', 'pending', 'approved', 'rejected']

export default function SubscriptionRequests() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)

  useEffect(() => {
    setLoading(true)
    const params = { page, limit }
    if (statusFilter) params.status = statusFilter
    getSubscriptionRequests(params)
      .then(setData)
      .catch((err) => {
        toast.error(err.message || 'Failed to load requests')
        setData({ list: [], total: 0, page: 1, limit: 20 })
      })
      .finally(() => setLoading(false))
  }, [page, limit, statusFilter])

  useEffect(() => setPage(1), [statusFilter, limit])

  function refresh() {
    setLoading(true)
    const params = { page, limit }
    if (statusFilter) params.status = statusFilter
    getSubscriptionRequests(params)
      .then(setData)
      .finally(() => setLoading(false))
  }

  function isRenewal(req) {
    return req.currentPlanSummary && req.currentPlanSummary.planName && req.subscriptionName &&
      String(req.currentPlanSummary.planName).trim() === String(req.subscriptionName).trim()
  }

  async function handleApprove(req) {
    const renewal = isRenewal(req)
    const message = renewal
      ? `Approve renewal of "${req.subscriptionName}" for store ${req.storeCode}? The current plan will be extended (same plan, next period).`
      : `Approve plan change to "${req.subscriptionName}" for store ${req.storeCode}? The current plan will end and the new plan will start (manual process – no payment).`
    const ok = await confirm({
      title: renewal ? 'Approve renewal?' : 'Approve plan change?',
      message,
      confirmLabel: 'Approve',
      cancelLabel: 'Cancel',
      variant: 'primary'
    })
    if (!ok) return
    setActionId(req.id)
    approveSubscriptionRequest(req.id, {})
      .then(() => {
        toast.success('Request approved. Subscription is now active for the store.')
        refresh()
      })
      .catch((err) => toast.error(err.message || 'Approve failed'))
      .finally(() => setActionId(null))
  }

  async function handleReject(req) {
    const renewal = isRenewal(req)
    const message = renewal
      ? `Reject renewal request for store ${req.storeCode}? Their current plan will continue as-is.`
      : `Reject plan change request for store ${req.storeCode}? Their current plan will continue as-is.`
    const ok = await confirm({
      title: 'Reject request?',
      message,
      confirmLabel: 'Reject',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    setActionId(req.id)
    rejectSubscriptionRequest(req.id, {})
      .then(() => {
        toast.success('Request rejected.')
        refresh()
      })
      .catch((err) => toast.error(err.message || 'Reject failed'))
      .finally(() => setActionId(null))
  }

  const totalPages = Math.ceil(data.total / limit) || 1
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, data.total)
  const list = data.list || []

  return (
    <div className="distributors-page">
      <div className="page-header">
        <h2>Subscription requests</h2>
        <div className="page-header-actions">
          <Link to="/subscriptions" className="admin-btn admin-btn-secondary">Manage subscriptions</Link>
        </div>
      </div>
      <p className="subscriptions-intro">
        Store admins request to buy or change subscriptions manually. Approve or reject requests here (no payment is processed).
      </p>
      <div className="users-filters-card">
        <div className="users-filters-body">
          <div className="users-filters-row">
            <div className="users-filter-field">
              <label htmlFor="req-status">Status</label>
              <select
                id="req-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s || 'all'} value={s}>{s || 'All'}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Store</th>
                  <th>Type</th>
                  <th>Requested plan</th>
                  {(user?.role === ROLES.DISTRIBUTOR_ADMIN || user?.role === ROLES.MASTER_ADMIN) && <th>Current plan (period)</th>}
                  <th>Price (display)</th>
                  {user?.role === ROLES.DISTRIBUTOR_ADMIN && <th>Calculated amount</th>}
                  <th>Requested at</th>
                  <th>Status</th>
                  {(user?.role === ROLES.DISTRIBUTOR_ADMIN || user?.role === ROLES.MASTER_ADMIN) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role === ROLES.STORE_ADMIN ? 7 : user?.role === ROLES.DISTRIBUTOR_ADMIN ? 10 : 9} className="subscription-request-empty">No requests found.</td>
                  </tr>
                ) : (
                  list.map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{r.storeCode}</td>
                      <td>
                        {(user?.role === ROLES.DISTRIBUTOR_ADMIN || user?.role === ROLES.MASTER_ADMIN) && r.currentPlanSummary ? (
                          isRenewal(r) ? (
                            <span className="subscription-request-type subscription-request-type-renewal">Renewal</span>
                          ) : (
                            <span className="subscription-request-type subscription-request-type-change">Change plan</span>
                          )
                        ) : '—'}
                      </td>
                      <td>{r.subscriptionName ?? '—'}</td>
                      {(user?.role === ROLES.DISTRIBUTOR_ADMIN || user?.role === ROLES.MASTER_ADMIN) && (
                        <td className="subscription-request-current-plan">
                          {r.currentPlanSummary ? (
                            <span title={`${r.currentPlanSummary.daysUsed} days used of ${r.currentPlanSummary.totalDays}${r.currentPlanSummary.isExtended ? ' · Extended' : ''}`}>
                              {r.currentPlanSummary.planName ?? '—'}
                              {' · ends '}
                              {r.currentPlanSummary.endsAt ? new Date(r.currentPlanSummary.endsAt).toLocaleDateString() : '—'}
                              {' · '}
                              {r.currentPlanSummary.daysRemaining} day{r.currentPlanSummary.daysRemaining !== 1 ? 's' : ''} left
                              {r.currentPlanSummary.isExtended && ' · Extended'}
                            </span>
                          ) : 'No current plan'}
                        </td>
                      )}
                      <td>{r.subscriptionPriceDisplay ?? '—'}</td>
                      {user?.role === ROLES.DISTRIBUTOR_ADMIN && (
                        <td className="subscription-request-calculated">
                          {r.billingPreview != null ? (
                            <span title={`Based on last 30 days: BOT deposit ${r.billingPreview.gameBotDeposit}, net profit ${r.billingPreview.gameBotNetProfit}`}>
                              ${Number(r.billingPreview.calculatedAmount).toFixed(2)}
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      <td>{r.requestedAt ? new Date(r.requestedAt).toLocaleString() : '—'}</td>
                      <td>
                        <span className={`subscription-request-status subscription-request-status-${r.status}`}>
                          {r.status}
                        </span>
                      </td>
                      {(user?.role === ROLES.DISTRIBUTOR_ADMIN || user?.role === ROLES.MASTER_ADMIN) && (
                        <td>
                          {r.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                className="admin-btn admin-btn-sm admin-btn-primary"
                                disabled={actionId !== null}
                                onClick={() => handleApprove(r)}
                              >
                                Approve
                              </button>
                              {' '}
                              <button
                                type="button"
                                className="admin-btn admin-btn-sm admin-btn-danger"
                                disabled={actionId !== null}
                                onClick={() => handleReject(r)}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {r.status !== 'pending' && '—'}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {(data.total > 0 || totalPages > 1) && (
            <div className="pagination">
              <div className="pagination-per-page">
                <label htmlFor="req-per-page">Per page</label>
                <select
                  id="req-per-page"
                  className="pagination-select"
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1) }}
                  aria-label="Rows per page"
                >
                  {PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <span className="pagination-info">
                {data.total > 0 ? `Showing ${from}–${to} of ${data.total}` : 'No results'}
                {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
              </span>
              <div className="pagination-buttons">
                <button type="button" className="admin-btn admin-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button type="button" className="admin-btn admin-btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
