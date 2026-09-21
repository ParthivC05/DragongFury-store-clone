import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getSubscriptions, updateSubscription, deleteSubscription } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import './Distributors.css'
import './Users.css'

const PER_PAGE_OPTIONS = [10, 20, 50]

export default function Subscriptions() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    setLoading(true)
    const params = { page, limit }
    if (isMasterAdmin) {
      // optional: add distributorCode filter from UI if needed
    }
    getSubscriptions(params)
      .then(setData)
      .catch((err) => {
        toast.error(err.message || 'Failed to load subscriptions')
        setData({ list: [], total: 0, page: 1, limit: 20 })
      })
      .finally(() => setLoading(false))
  }, [page, limit, isMasterAdmin])

  function handleToggleStatus(s) {
    setTogglingId(s.id)
    updateSubscription(s.id, { isActive: !s.isActive })
      .then(() => {
        toast.success(s.isActive ? 'Subscription set to Inactive.' : 'Subscription set to Active.')
        setData((prev) => ({
          ...prev,
          list: prev.list.map((item) =>
            item.id === s.id ? { ...item, isActive: !item.isActive } : item
          )
        }))
      })
      .catch((err) => toast.error(err.message || 'Update failed'))
      .finally(() => setTogglingId(null))
  }

  async function handleDelete(id, name) {
    const ok = await confirm({
      title: 'Delete subscription?',
      message: `Delete subscription "${name}"? This will fail if it is currently active for any store.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    deleteSubscription(id)
      .then(() => {
        toast.success('Subscription deleted.')
        setData((prev) => ({
          ...prev,
          list: prev.list.filter((s) => s.id !== id),
          total: Math.max(0, prev.total - 1)
        }))
      })
      .catch((err) => toast.error(err.message || 'Delete failed'))
  }

  const totalPages = Math.ceil(data.total / limit) || 1
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, data.total)
  const list = data.list || []

  function billingTypeLabel(s) {
    return s.billingType === 'percentage' ? 'Percentage (%)' : 'Flat ($)'
  }

  function billingLabel(s) {
    if (s.billingType === 'percentage') {
      const base = s.percentageBase === 'game_bot_net_profit' ? 'Net Profit' : 'BOT Deposit'
      return `${s.percentageValue ?? 0}% of Game BOT ${base}`
    }
    if (s.flatAmountCents != null) return `$${(Number(s.flatAmountCents) / 100).toFixed(2)}`
    return s.priceDisplay || '—'
  }

  return (
    <div className="distributors-page">
      <div className="page-header">
        <h2>Subscriptions</h2>
        <div className="page-header-actions">
          <Link to="/subscriptions/new" className="admin-btn admin-btn-primary">Add subscription</Link>
          <Link to="/subscription-requests" className="admin-btn admin-btn-secondary">View requests</Link>
        </div>
      </div>
      <p className="subscriptions-intro">
        Create subscription plans for stores. Store admins request to buy or change subscriptions manually (no online payment).
      </p>
      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  {isMasterAdmin && <th>Distributor</th>}
                  <th>Name</th>
                  <th>Billing type</th>
                  <th>Billing</th>
                  <th>Price (display)</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={isMasterAdmin ? 9 : 8}>No subscriptions yet. Add one to get started.</td>
                  </tr>
                ) : (
                  list.map((s) => (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      {isMasterAdmin && <td>{s.distributorCode ?? '—'}</td>}
                      <td>{s.name}</td>
                      <td>{billingTypeLabel(s)}</td>
                      <td>{billingLabel(s)}</td>
                      <td>{s.priceDisplay || '—'}</td>
                      <td>{s.durationMonths} month(s)</td>
                      <td>{s.isActive ? 'Active' : 'Inactive'}</td>
                      <td>
                        <button
                          type="button"
                          className={`admin-btn admin-btn-sm ${s.isActive ? 'admin-btn-warning' : 'admin-btn-success'}`}
                          disabled={togglingId !== null}
                          onClick={() => handleToggleStatus(s)}
                          title={s.isActive ? 'Set to Inactive' : 'Set to Active'}
                        >
                          {togglingId === s.id ? '…' : (s.isActive ? 'Deactivate' : 'Activate')}
                        </button>
                        {' '}
                        <Link to={`/subscriptions/${s.id}/edit`} className="admin-btn admin-btn-sm admin-btn-edit">Edit</Link>
                        {' '}
                        <button
                          type="button"
                          className="admin-btn admin-btn-sm admin-btn-danger"
                          onClick={() => handleDelete(s.id, s.name)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {(data.total > 0 || totalPages > 1) && (
            <div className="pagination">
              <div className="pagination-per-page">
                <label htmlFor="subs-per-page">Per page</label>
                <select
                  id="subs-per-page"
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
