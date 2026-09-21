import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getGameManualRequests,
  approveGameManualRequest,
  rejectGameManualRequest,
  getGameManualRequestCredentials,
  updateGameManualRequestCredentials,
  getGameManualRequestLogs
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } from '../constants/permissions'
import { canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import './GameManualRequests.css'
import './Users.css'

const TYPE_TABS = [
  { id: '', label: 'All' },
  { id: 'register', label: 'Register' },
  { id: 'deposit', label: 'Deposit' },
  { id: 'redeem', label: 'Redeem' }
]

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' }
]

// Map operation_done_by DB values to display; show resolvedByUsername when available
const DONE_BY_LABELS = {
  bot: 'Automation tool',
  store_admin: 'Store Partner',
  distributor_admin: 'Distributor Admin',
  master_admin: 'Super Admin'
}

const LOG_ACTION_LABELS = {
  register_approved: 'Registration approved',
  credentials_updated: 'Credentials updated'
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dateStr} ${timeStr}`
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
function ApprovalWaitCell({ status, createdAt, resolvedAt }) {
  if (status !== 'approved' || !createdAt || !resolvedAt) {
    return <span className="gmr-dash">—</span>
  }
  const start = new Date(createdAt).getTime()
  const end = new Date(resolvedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return <span className="gmr-dash">—</span>
  }
  const waitMs = end - start
  const duration = formatWaitDuration(waitMs)
  const isLate = waitMs > LATE_AFTER_MS
  return (
    <div className={`gmr-wait ${isLate ? 'gmr-wait-late' : 'gmr-wait-ontime'}`}>
      <span className={`gmr-wait-badge ${isLate ? 'gmr-wait-badge-late' : 'gmr-wait-badge-ontime'}`}>
        {isLate ? 'Late' : 'On time'}
      </span>
      <span className="gmr-wait-detail" title={`Approved ${duration} after the request was submitted`}>
        Approved after {duration}
      </span>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending', cls: 'gmr-badge-pending' },
    approved: { label: 'Approved', cls: 'gmr-badge-approved' },
    rejected: { label: 'Rejected', cls: 'gmr-badge-rejected' }
  }
  const s = map[status] || { label: status, cls: '' }
  return <span className={`gmr-badge ${s.cls}`}>{s.label}</span>
}

function showsGameUsername(requestType, status) {
  if (requestType === 'deposit' || requestType === 'redeem') return true
  if (requestType === 'register' && status === 'approved') return true
  return false
}

function TypeBadge({ type }) {
  const map = {
    register: { label: 'Register', cls: 'gmr-type-register' },
    deposit: { label: 'Deposit', cls: 'gmr-type-deposit' },
    redeem: { label: 'Redeem', cls: 'gmr-type-redeem' }
  }
  const t = map[type] || { label: type, cls: '' }
  return <span className={`gmr-type-badge ${t.cls}`}>{t.label}</span>
}

// Modal for approving a register request (needs game credentials)
function ApproveRegisterModal({ request, onConfirm, onClose, saving }) {
  const [form, setForm] = useState({ game_username: '', game_password: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onConfirm({
      game_username: form.game_username.trim(),
      game_password: form.game_password.trim()
    })
  }

  return (
    <div className="gmr-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gmr-modal-card">
        <h3 className="gmr-modal-title">Approve Registration</h3>
        <p className="gmr-modal-desc">
          Enter the game credentials for <strong>{request.User?.username}</strong> on <strong>{request.Game?.name}</strong>.
        </p>
        <p className="gmr-modal-note gmr-modal-note-warning" role="note">
          <strong>Important:</strong> First create the user account in the <strong>{request.Game?.name}</strong> backend panel.
          Only after the account exists there, enter the assigned username and password below.
        </p>
        <form onSubmit={handleSubmit} className="gmr-modal-form">
          <div className="gmr-modal-field">
            <label htmlFor="gmr-username">Game username</label>
            <input
              id="gmr-username"
              type="text"
              value={form.game_username}
              onChange={(e) => setForm((f) => ({ ...f, game_username: e.target.value }))}
              required
              placeholder="Enter the username assigned on the game platform"
            />
          </div>
          <div className="gmr-modal-field">
            <label htmlFor="gmr-password">Game password</label>
            <input
              id="gmr-password"
              type="text"
              value={form.game_password}
              onChange={(e) => setForm((f) => ({ ...f, game_password: e.target.value }))}
              required
              placeholder="Enter the password assigned on the game platform"
            />
          </div>
          <div className="gmr-modal-actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? 'Approving…' : 'Approve & save credentials'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function getManualDepositCredit(request) {
  const wallet = Number(request?.amount)
  const credit = Number(request?.gameCreditAmount)
  if (Number.isFinite(credit) && credit > wallet) return credit
  return Number.isFinite(wallet) ? wallet : null
}

// Modal for approving a deposit or redeem request
function ApproveSimpleModal({ request, onConfirm, onClose, saving }) {
  const typeLabel = request.requestType === 'deposit' ? 'deposit' : 'redeem'
  const gameCredit = request.requestType === 'deposit' ? getManualDepositCredit(request) : null
  const hasDiscount = request.requestType === 'deposit' && gameCredit != null && Number(gameCredit) !== Number(request.amount)
  const walletNote = request.requestType === 'deposit'
    ? (hasDiscount
      ? `The user's wallet funds (${request.amount} SC) are already reserved. Credit ${gameCredit} SC in the game (${Number(request.depositDiscountPercent)}% extra), then approve.`
      : 'The user\'s wallet funds are already reserved. Approving confirms the game account has been topped up.')
    : `Approving will credit ${request.amount} SC to the user's wallet.`

  return (
    <div className="gmr-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gmr-modal-card">
        <h3 className="gmr-modal-title">Approve {typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}</h3>
        <p className="gmr-modal-desc">
          Approve <strong>{typeLabel}</strong> of <strong>{request.amount} SC</strong>
          {hasDiscount ? <> (credit <strong>{gameCredit} SC</strong> in game)</> : null}
          {' '}for{' '}
          <strong>{request.User?.username}</strong> on <strong>{request.Game?.name}</strong>?
        </p>
        {request.gameUsername && (
          <p className="gmr-modal-desc">
            Game username: <strong className="gmr-game-username">{request.gameUsername}</strong>
          </p>
        )}
        <p className="gmr-modal-note">{walletNote}</p>
        <div className="gmr-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={onConfirm} disabled={saving}>
            {saving ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal for editing credentials on an approved register request
function EditRegisterModal({ request, credentials, logs, loadingCredentials, onConfirm, onClose, saving }) {
  const [form, setForm] = useState({ game_username: '', game_password: '' })

  useEffect(() => {
    if (credentials) {
      setForm({
        game_username: credentials.game_username || '',
        game_password: credentials.game_password || ''
      })
    }
  }, [credentials])

  const handleSubmit = (e) => {
    e.preventDefault()
    onConfirm({
      game_username: form.game_username.trim(),
      game_password: form.game_password.trim()
    })
  }

  return (
    <div className="gmr-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gmr-modal-card gmr-modal-card-wide">
        <h3 className="gmr-modal-title">Edit Game Credentials</h3>
        <p className="gmr-modal-desc">
          Update the game credentials for <strong>{request.User?.username}</strong> on <strong>{request.Game?.name}</strong>.
        </p>
        {loadingCredentials ? (
          <p className="gmr-modal-desc">Loading credentials…</p>
        ) : (
          <form onSubmit={handleSubmit} className="gmr-modal-form">
            <div className="gmr-modal-field">
              <label htmlFor="gmr-edit-username">Game username</label>
              <input
                id="gmr-edit-username"
                type="text"
                value={form.game_username}
                onChange={(e) => setForm((f) => ({ ...f, game_username: e.target.value }))}
                required
                placeholder="Enter the username assigned on the game platform"
              />
            </div>
            <div className="gmr-modal-field">
              <label htmlFor="gmr-edit-password">Game password</label>
              <input
                id="gmr-edit-password"
                type="text"
                value={form.game_password}
                onChange={(e) => setForm((f) => ({ ...f, game_password: e.target.value }))}
                required
                placeholder="Enter the password assigned on the game platform"
              />
            </div>
            <div className="gmr-modal-actions">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || loadingCredentials}>
                {saving ? 'Updating…' : 'Update credentials'}
              </button>
            </div>
          </form>
        )}

        {!loadingCredentials && logs && logs.length > 0 && (
          <div className="gmr-credential-logs">
            <h4 className="gmr-credential-logs-title">Credential history</h4>
            <ul className="gmr-credential-logs-list">
              {logs.map((log) => (
                <li key={log.id} className="gmr-credential-log-item">
                  <div className="gmr-credential-log-head">
                    <span className="gmr-credential-log-action">
                      {LOG_ACTION_LABELS[log.actionType] || log.actionType}
                    </span>
                    <span className="gmr-credential-log-date">{formatDate(log.createdAt)}</span>
                  </div>
                  <div className="gmr-credential-log-meta">
                    By <strong>{log.performedByUsername || DONE_BY_LABELS[log.operationDoneBy] || log.operationDoneBy || '—'}</strong>
                  </div>
                  {log.actionType === 'credentials_updated' && log.previousGameUsername && (
                    <div className="gmr-credential-log-change">
                      Username: <span className="gmr-credential-log-old">{log.previousGameUsername}</span>
                      {' → '}
                      <span className="gmr-credential-log-new">{log.gameUsername || '—'}</span>
                    </div>
                  )}
                  {log.actionType === 'register_approved' && log.gameUsername && (
                    <div className="gmr-credential-log-change">
                      Username set to <strong>{log.gameUsername}</strong>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// Modal for rejecting any request
function RejectModal({ request, onConfirm, onClose, saving }) {
  const [reason, setReason] = useState('')
  const refundNote = request.requestType === 'deposit'
    ? ' The user\'s reserved wallet funds will be automatically refunded.'
    : ''

  return (
    <div className="gmr-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gmr-modal-card">
        <h3 className="gmr-modal-title">Reject Request</h3>
        <p className="gmr-modal-desc">
          Reject <strong>{request.requestType}</strong> request for{' '}
          <strong>{request.User?.username}</strong> on <strong>{request.Game?.name}</strong>?{refundNote}
        </p>
        <div className="gmr-modal-field">
          <label htmlFor="gmr-reason">Reason (optional)</label>
          <textarea
            id="gmr-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide a reason for rejection (optional)"
            rows={3}
          />
        </div>
        <div className="gmr-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="admin-btn admin-btn-danger" onClick={() => onConfirm(reason)} disabled={saving}>
            {saving ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GameManualRequests() {
  const toast = useToast()
  const { user } = useAuth()
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const allowedTypes = useMemo(() => {
    if (!user) return ['register', 'deposit', 'redeem']
    if (user.role === 'distributor_admin') return ['register', 'deposit', 'redeem']

    if (user.role === 'master_admin') {
      if (!user.adminRoleId) return ['register', 'deposit', 'redeem']
      const perms = user.adminPermissions || {}
      if (perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS]) return ['register', 'deposit', 'redeem']
      const types = []
      if (perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER]) types.push('register')
      if (perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT]) types.push('deposit')
      if (perms[ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM]) types.push('redeem')
      return types
    }

    if (user.role === 'store_admin') {
      if (!user.storeRoleId) return ['register', 'deposit', 'redeem']
      const perms = user.permissions || {}
      if (perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS]) return ['register', 'deposit', 'redeem']
      const types = []
      if (perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER]) types.push('register')
      if (perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT]) types.push('deposit')
      if (perms[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM]) types.push('redeem')
      return types
    }

    return ['register', 'deposit', 'redeem']
  }, [user])

  const visibleTypeTabs = useMemo(
    () => TYPE_TABS.filter((tab) => tab.id === '' || allowedTypes.includes(tab.id)),
    [allowedTypes]
  )

  const [activeType, setActiveType] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [gameUsernameSearch, setGameUsernameSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit] = useState(20)

  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [loading, setLoading] = useState(false)

  // Modal state
  const [approveModal, setApproveModal] = useState(null) // { request }
  const [rejectModal, setRejectModal] = useState(null)   // { request }
  const [editModal, setEditModal] = useState(null)       // { request, credentials, logs, loadingCredentials }
  const [saving, setSaving] = useState(false)

  const fetchRequests = useCallback(() => {
    setLoading(true)
    const params = { page, limit }
    if (activeType && allowedTypes.includes(activeType)) params.requestType = activeType
    if (statusFilter) params.status = statusFilter
    if (gameUsernameSearch.trim()) params.gameUsername = gameUsernameSearch.trim()

    getGameManualRequests(params)
      .then((res) => setData(res))
      .catch((err) => toast.error(err?.message || 'Failed to load requests'))
      .finally(() => setLoading(false))
  }, [page, limit, activeType, statusFilter, gameUsernameSearch, toast, allowedTypes])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  useEffect(() => {
    if (activeType && !allowedTypes.includes(activeType)) {
      setActiveType('')
      setPage(1)
    }
  }, [activeType, allowedTypes])

  // Reset to page 1 when filters change
  const handleTypeChange = (type) => { setActiveType(type); setPage(1) }
  const handleStatusChange = (e) => { setStatusFilter(e.target.value); setPage(1) }
  const handleGameUsernameSearchChange = (e) => { setGameUsernameSearch(e.target.value); setPage(1) }

  const openApprove = (request) => setApproveModal({ request })
  const openReject = (request) => setRejectModal({ request })
  const closeModals = () => { setApproveModal(null); setRejectModal(null); setEditModal(null) }

  const openEdit = async (request) => {
    setEditModal({ request, credentials: null, logs: [], loadingCredentials: true })
    try {
      const [credentials, logsRes] = await Promise.all([
        getGameManualRequestCredentials(request.id),
        getGameManualRequestLogs(request.id)
      ])
      setEditModal({
        request,
        credentials,
        logs: logsRes?.list || [],
        loadingCredentials: false
      })
    } catch (err) {
      toast.error(err?.message || 'Failed to load credentials.')
      setEditModal(null)
    }
  }

  const handleEdit = async (extraData = {}) => {
    const { request } = editModal
    setSaving(true)
    try {
      await updateGameManualRequestCredentials(request.id, extraData)
      toast.success('Credentials updated successfully.')
      closeModals()
      fetchRequests()
    } catch (err) {
      toast.error(err?.message || 'Failed to update credentials.')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (extraData = {}) => {
    const { request } = approveModal
    setSaving(true)
    try {
      await approveGameManualRequest(request.id, extraData)
      toast.success('Request approved successfully.')
      closeModals()
      fetchRequests()
    } catch (err) {
      toast.error(err?.message || 'Failed to approve request.')
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async (rejectionReason) => {
    const { request } = rejectModal
    setSaving(true)
    try {
      await rejectGameManualRequest(request.id, { rejection_reason: rejectionReason })
      toast.success('Request rejected.')
      closeModals()
      fetchRequests()
    } catch (err) {
      toast.error(err?.message || 'Failed to reject request.')
    } finally {
      setSaving(false)
    }
  }

  const totalPages = Math.ceil(data.total / limit) || 1

  return (
    <div className="gmr-page">
      <header className="gmr-header">
        <div>
          <h1 className="gmr-title">Manual Requests</h1>
          <p className="gmr-subtitle">
            Game operations that need manual processing when the automation tool is unavailable.
          </p>
        </div>
      </header>

      {/* Filters */}
      <div className="gmr-filters">
        <div className="gmr-type-tabs">
          {visibleTypeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`gmr-type-tab ${activeType === tab.id ? 'gmr-type-tab-active' : ''}`}
              onClick={() => handleTypeChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select className="gmr-status-select" value={statusFilter} onChange={handleStatusChange} aria-label="Filter by status">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="users-search-wrap">
          <svg className="users-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            className="users-search-input"
            value={gameUsernameSearch}
            onChange={handleGameUsernameSearchChange}
            placeholder="Search by game username..."
            aria-label="Search by game username"
          />
        </div>
      </div>

      {loading && <p className="gmr-loading">Loading…</p>}

      {!loading && (
        <>
          <div className="gmr-table-wrap">
            <table className="gmr-table">
              <thead>
                <tr>
                  <th>Requested at</th>
                  <th>User</th>
                  <th>Game</th>
                  <th>Game username</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Resolved by</th>
                  <th>Handled by</th>
                  <th title="How long after the request was submitted until it was approved. Late if over 3 minutes.">
                    Approval wait
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.list.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="gmr-empty">No requests found.</td>
                  </tr>
                ) : (
                  data.list.map((r) => (
                    <tr key={r.id}>
                      <td className="gmr-td-date">{formatDate(r.createdAt)}</td>
                      <td>
                        <span className="gmr-username">
                          {r.userId != null ? `ID ${r.userId}` : (r.User?.userId != null ? `ID ${r.User.userId}` : '—')}
                        </span>
                        {r.User?.username ? (
                          <span className="gmr-useremail">@{r.User.username}</span>
                        ) : null}
                        {showPlayerEmail && r.User?.email ? (
                          <span className="gmr-useremail">{r.User.email}</span>
                        ) : null}
                      </td>
                      <td>{r.Game?.name || '—'}</td>
                      <td>
                        {showsGameUsername(r.requestType, r.status) ? (
                          <span className="gmr-game-username">{r.gameUsername || '—'}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td><TypeBadge type={r.requestType} /></td>
                      <td>
                        {r.amount != null
                          ? (r.requestType === 'deposit' && r.gameCreditAmount != null && Number(r.gameCreditAmount) !== Number(r.amount)
                            ? `${Number(r.amount).toFixed(2)} SC → ${Number(r.gameCreditAmount).toFixed(2)} SC in game`
                            : `${Number(r.amount).toFixed(2)} SC`)
                          : '—'}
                      </td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>
                        {r.resolvedByUsername
                          ? <span className="gmr-resolved-by">{r.resolvedByUsername}</span>
                          : <span className="gmr-unresolved">—</span>
                        }
                        {r.resolvedAt && <span className="gmr-resolved-at">{formatDate(r.resolvedAt)}</span>}
                      </td>
                      <td>
                        <span className="gmr-done-by">
                          {r.resolvedByUsername || (r.operationDoneBy ? (DONE_BY_LABELS[r.operationDoneBy] || r.operationDoneBy) : '—')}
                        </span>
                      </td>
                      <td className="gmr-td-wait">
                        <ApprovalWaitCell
                          status={r.status}
                          createdAt={r.createdAt}
                          resolvedAt={r.resolvedAt}
                        />
                      </td>
                      <td>
                        {r.status === 'pending' && (
                          <div className="gmr-actions">
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-primary"
                              onClick={() => openApprove(r)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-danger"
                              onClick={() => openReject(r)}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {r.requestType === 'register' && r.status === 'approved' && (
                          <div className="gmr-actions">
                            <button
                              type="button"
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                              onClick={() => openEdit(r)}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                        {r.status === 'rejected' && r.rejectionReason && (
                          <span className="gmr-rejection-reason" title={r.rejectionReason}>
                            {r.rejectionReason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data.total > 0 && (
            <div className="gmr-pagination">
              <span className="gmr-pagination-info">
                {(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of {data.total}
              </span>
              <div className="gmr-pagination-btns">
                <button type="button" disabled={page <= 1} onClick={() => setPage(1)}>First</button>
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
                <span>Page {page} of {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Approve modal — register needs credentials */}
      {approveModal && approveModal.request.requestType === 'register' && (
        <ApproveRegisterModal
          request={approveModal.request}
          onConfirm={handleApprove}
          onClose={closeModals}
          saving={saving}
        />
      )}

      {/* Approve modal — deposit / redeem simple confirmation */}
      {approveModal && approveModal.request.requestType !== 'register' && (
        <ApproveSimpleModal
          request={approveModal.request}
          onConfirm={() => handleApprove({})}
          onClose={closeModals}
          saving={saving}
        />
      )}

      {/* Reject modal */}
      {rejectModal && (
        <RejectModal
          request={rejectModal.request}
          onConfirm={handleReject}
          onClose={closeModals}
          saving={saving}
        />
      )}

      {/* Edit credentials modal — approved register requests */}
      {editModal && (
        <EditRegisterModal
          request={editModal.request}
          credentials={editModal.credentials}
          logs={editModal.logs}
          loadingCredentials={editModal.loadingCredentials}
          onConfirm={handleEdit}
          onClose={closeModals}
          saving={saving}
        />
      )}
    </div>
  )
}
