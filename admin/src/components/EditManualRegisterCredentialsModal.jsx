import { useState, useEffect } from 'react'
import '../pages/GameManualRequests.css'

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

export default function EditManualRegisterCredentialsModal({
  userName,
  gameName,
  credentials,
  logs,
  loadingCredentials,
  onConfirm,
  onClose,
  saving
}) {
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
          Update the game credentials for <strong>{userName}</strong> on <strong>{gameName}</strong>.
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
