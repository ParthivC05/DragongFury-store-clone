import { useState, useEffect, useMemo } from 'react'
import {
  getSubscriptionsCurrent,
  getSubscriptions,
  getSubscriptionRequests,
  createSubscriptionRequest,
  cancelSubscriptionRequest
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import './Distributors.css'
import './Users.css'
import './MySubscription.css'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Ensure price is shown with $ if it looks like a number (e.g. "99" or "99/month" -> "$99" or "$99/month"). */
function formatPrice(priceDisplay) {
  if (!priceDisplay || typeof priceDisplay !== 'string') return null
  const t = priceDisplay.trim()
  if (!t) return null
  if (/^\$/.test(t)) return t
  if (/^[\d.,]+/.test(t)) return `$${t}`
  return t
}

function getDaysRemaining(endsAt) {
  if (!endsAt) return null
  const end = new Date(endsAt)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
  return diff
}

function getProgressPercent(startsAt, endsAt) {
  if (!startsAt || !endsAt) return 0
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  const now = Date.now()
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.round(((now - start) / (end - start)) * 100)
}

export default function MySubscription() {
  const toast = useToast()
  const [current, setCurrent] = useState({ active: null, subscription: null })
  const [availablePlans, setAvailablePlans] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [requestingId, setRequestingId] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)

  function load() {
    setLoading(true)
    Promise.all([
      getSubscriptionsCurrent(),
      getSubscriptions({ limit: 100 }),
      getSubscriptionRequests({ limit: 20 })
    ])
      .then(([currentRes, plansRes, reqRes]) => {
        setCurrent(currentRes)
        setAvailablePlans((plansRes.list || []).filter((p) => p.isActive))
        setRequests(reqRes.list || [])
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load subscription data')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function handleRequestSubscription(subscriptionId) {
    setRequestingId(subscriptionId)
    createSubscriptionRequest({ subscriptionId })
      .then(() => {
        toast.success('Request sent. Your distributor will process it manually (no payment online).')
        load()
      })
      .catch((err) => toast.error(err.message || 'Request failed'))
      .finally(() => setRequestingId(null))
  }

  function handleCancelRequest(requestId) {
    setCancellingId(requestId)
    cancelSubscriptionRequest(requestId)
      .then(() => {
        toast.success('Request cancelled.')
        load()
      })
      .catch((err) => toast.error(err.message || 'Cancel failed'))
      .finally(() => setCancellingId(null))
  }

  const hasPending = requests.some((r) => r.status === 'pending')
  const pendingRequest = requests.find((r) => r.status === 'pending')
  const active = current?.active
  const subscription = current?.subscription
  const summary = current?.summary
  const subscriptionHistory = current?.subscriptionHistory ?? []
  const activeSubscriptionId = active?.subscriptionId ?? subscription?.id
  const daysRemaining = summary?.daysRemaining ?? (active?.endsAt ? getDaysRemaining(active.endsAt) : null)
  const progressPercent = useMemo(
    () => (active?.startsAt && active?.endsAt ? getProgressPercent(active.startsAt, active.endsAt) : 0),
    [active?.startsAt, active?.endsAt]
  )
  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0

  if (loading) {
    return (
      <div className="my-subscription-page">
        <div className="page-loading">Loading…</div>
      </div>
    )
  }

  return (
    <div className="my-subscription-page">
      <div className="page-header my-subscription-header">
        <div className="page-header-text">
          <h2>My subscription</h2>
          <p className="page-subtitle">
            View your current plan, how long it runs, and request a new or different plan.
          </p>
        </div>
      </div>

      <div className="my-subscription-parts">
        <div className="my-subscription-part my-subscription-part-left">
          <div className="my-subscription-cards">
        {active && subscription ? (
          <>
            <div className="my-subscription-card-summary my-subscription-card-active">
              <div className="my-subscription-card-summary-header">
                <span className="my-subscription-card-label">Current plan</span>
                <span className="my-subscription-badge my-subscription-badge-active">Active</span>
              </div>
              <div className="my-subscription-card-row my-subscription-card-joined">
                <span className="my-subscription-row-label">Joined on</span>
                <span className="my-subscription-row-value">{formatDate(active.startsAt)}</span>
              </div>
              <div className="my-subscription-card-plan-title">
                <span className="my-subscription-card-summary-name">{subscription.name}</span>
                <span className="my-subscription-card-frequency">
                  {subscription.durationMonths} month{subscription.durationMonths !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="my-subscription-card-row my-subscription-card-next-payment">
                <span className="my-subscription-row-label">Valid until</span>
                <span className="my-subscription-row-value">{formatDate(active.endsAt)}</span>
              </div>
              {summary && (summary.totalDays != null || summary.daysUsed != null) && (
                <div className="my-subscription-card-row my-subscription-card-usage">
                  <span className="my-subscription-row-label">Usage</span>
                  <span className="my-subscription-row-value">
                    {summary.daysUsed} day{summary.daysUsed !== 1 ? 's' : ''} used
                    {summary.totalDays != null ? ` of ${summary.totalDays}` : ''}
                  </span>
                </div>
              )}
              {summary?.isExtended && active?.extendedAt && (
                <div className="my-subscription-card-row my-subscription-card-extended">
                  <span className="my-subscription-row-label">Extended on</span>
                  <span className="my-subscription-row-value">{formatDate(active.extendedAt)}</span>
                </div>
              )}
              {(subscription.priceDisplay || subscription.priceDisplay === 0) && (
                <div className="my-subscription-card-price-block">
                  <span className="my-subscription-price-label">Plan price</span>
                  <span className="my-subscription-price-amount">
                    {formatPrice(subscription.priceDisplay) ?? subscription.priceDisplay}
                  </span>
                </div>
              )}
              {subscription.description && (
                <p className="my-subscription-card-summary-desc">{subscription.description}</p>
              )}
              <div className="my-subscription-timeline">
                <div className="my-subscription-timeline-labels">
                  <span>{formatDate(active.startsAt)}</span>
                  <span>{formatDate(active.endsAt)}</span>
                </div>
                <div className="my-subscription-progress-track">
                  <div
                    className="my-subscription-progress-fill"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="my-subscription-days-left">
                  {daysRemaining !== null && (
                    <>
                      {daysRemaining > 0 ? (
                        <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining</strong>
                      ) : daysRemaining === 0 ? (
                        <strong className="my-subscription-expires-today">Expires today</strong>
                      ) : (
                        <strong className="my-subscription-expired">Expired</strong>
                      )}
                    </>
                  )}
                </div>
              </div>
              {isExpiringSoon && daysRemaining > 0 && (
                <div className="my-subscription-expiring-alert">
                  Your plan expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}. Request a renewal below.
                </div>
              )}
            </div>
            {pendingRequest && (
              <div className="my-subscription-card-summary my-subscription-card-next">
                <span className="my-subscription-card-label">
                  {pendingRequest.subscriptionId === activeSubscriptionId ? 'Renewal request (pending)' : 'Plan change request (pending)'}
                </span>
                <div className="my-subscription-card-summary-name">{pendingRequest.subscriptionName}</div>
                <p className="my-subscription-next-hint">
                  Your request is awaiting distributor approval. You’ll get an email when it’s activated. If rejected, your current plan continues as-is.
                </p>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-danger"
                  disabled={cancellingId !== null}
                  onClick={() => handleCancelRequest(pendingRequest.id)}
                >
                  {cancellingId === pendingRequest.id ? 'Cancelling…' : 'Cancel request'}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="my-subscription-card-summary my-subscription-card-none">
            <span className="my-subscription-card-label">Current plan</span>
            <p className="my-subscription-no-plan">You don’t have an active subscription. Request a plan below.</p>
          </div>
        )}
          </div>
        </div>

        <div className="my-subscription-part my-subscription-part-right">
      {/* Request a subscription */}
      <section className="my-subscription-section" aria-labelledby="request-subscription-heading">
        <div className="users-filters-card my-subscription-section-card">
          <div className="users-filters-card-header">
            <h3 id="request-subscription-heading" className="users-filters-card-title">Request a subscription</h3>
          </div>
          <div className="users-filters-body my-subscription-plans-body">
            {hasPending && (
              <div className="my-subscription-pending">
                You have a pending request. Wait for your distributor to approve or reject it. You can cancel it above.
              </div>
            )}
            {availablePlans.length === 0 ? (
              <p className="my-subscription-no-plans">No subscription plans available. Contact your distributor.</p>
            ) : (
              <div className="my-subscription-plans-grid">
                {availablePlans.map((plan) => {
                  const isCurrentPlan = activeSubscriptionId != null && plan.id === activeSubscriptionId
                  const canRequestNew = !hasPending && requestingId === null && !isCurrentPlan
                  const canRequestRenewal = !hasPending && requestingId === null && isCurrentPlan
                  return (
                    <div
                      key={plan.id}
                      className={`my-subscription-plan-card ${isCurrentPlan ? 'my-subscription-plan-card-current' : ''}`}
                    >
                      <div className="my-subscription-plan-card-header">
                        <span className="my-subscription-plan-card-name">{plan.name}</span>
                        {isCurrentPlan && <span className="my-subscription-plan-badge-current">Current plan</span>}
                      </div>
                      {(plan.priceDisplay != null && plan.priceDisplay !== '') && (
                        <div className="my-subscription-plan-card-price">
                          <span className="my-subscription-plan-price-amount">
                            {formatPrice(plan.priceDisplay) ?? plan.priceDisplay}
                          </span>
                          <span className="my-subscription-plan-price-period">
                            / {plan.durationMonths} month{plan.durationMonths !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                      {!plan.priceDisplay && (
                        <div className="my-subscription-plan-card-meta">
                          <span>{plan.durationMonths} month{plan.durationMonths !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                      {plan.description && (
                        <p className="my-subscription-plan-card-desc">{plan.description}</p>
                      )}
                      {!isCurrentPlan && (
                        <button
                          type="button"
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          disabled={!canRequestNew}
                          onClick={() => handleRequestSubscription(plan.id)}
                        >
                          {requestingId === plan.id ? 'Requesting…' : 'Request this plan'}
                        </button>
                      )}
                      {isCurrentPlan && (
                        <>
                          <button
                            type="button"
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            disabled={!canRequestRenewal}
                            onClick={() => handleRequestSubscription(plan.id)}
                          >
                            {requestingId === plan.id ? 'Requesting…' : 'Request renewal (same plan for next period)'}
                          </button>
                          <p className="my-subscription-plan-current-hint">Same plan cannot be “updated”; request a renewal to continue for the next period. To change plan, request a different plan above.</p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Plan history: time periods of each plan */}
      {subscriptionHistory.length > 0 && (
        <section className="my-subscription-section" aria-labelledby="plan-history-heading">
          <div className="users-filters-card">
            <div className="users-filters-card-header">
              <h3 id="plan-history-heading" className="users-filters-card-title">Plan history (time periods)</h3>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Period</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionHistory.map((h) => {
                    const start = h.startsAt ? new Date(h.startsAt) : null
                    const end = h.endsAt ? new Date(h.endsAt) : null
                    const totalDays = start && end ? Math.ceil((end - start) / (24 * 60 * 60 * 1000)) : null
                    return (
                      <tr key={h.id}>
                        <td>{h.planName ?? '—'}</td>
                        <td>{start ? formatDate(start) : '—'}</td>
                        <td>{end ? formatDate(end) : '—'}</td>
                        <td>{totalDays != null ? `${totalDays} days` : '—'}</td>
                        <td>
                          <span className={`subscription-request-status subscription-request-status-${h.status}`}>
                            {h.status}
                            {h.isExtended ? ' (extended)' : ''}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Your requests table */}
      {requests.length > 0 && (
        <section className="my-subscription-section" aria-labelledby="your-requests-heading">
          <div className="users-filters-card">
            <div className="users-filters-card-header">
              <h3 id="your-requests-heading" className="users-filters-card-title">Your requests</h3>
            </div>
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Requested plan</th>
                    <th>Requested at</th>
                    <th>Plan period</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.subscriptionName ?? '—'}</td>
                      <td>{r.requestedAt ? new Date(r.requestedAt).toLocaleString() : '—'}</td>
                      <td className="my-subscription-days-used">
                        {r.status === 'approved' && r.approvedPlanUsage != null
                          ? `${formatDate(r.approvedPlanUsage.startsAt)} – ${formatDate(r.approvedPlanUsage.endsAt)}`
                          : '—'}
                      </td>
                      <td>
                        <span className={`subscription-request-status subscription-request-status-${r.status}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        {r.status === 'pending' && (
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-danger"
                            disabled={cancellingId !== null}
                            onClick={() => handleCancelRequest(r.id)}
                          >
                            {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
        </div>
      </div>
    </div>
  )
}
