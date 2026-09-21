import '../pages/GameManualRequests.css'

const ACTION_LABELS = {
  deleted: 'Credentials Deleted',
  updated: 'Credentials Updated'
}

const DONE_BY_LABELS = {
  bot: 'Automation tool',
  store_admin: 'Store Partner',
  distributor_admin: 'Distributor Admin',
  master_admin: 'Super Admin'
}

function formatDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dateStr} ${timeStr}`
}

export default function CredentialHistoryModal({ userName, history, loading, onClose }) {
  return (
    <div className="gmr-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gmr-modal-card gmr-modal-card-wide" style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className="gmr-modal-title" style={{ margin: 0 }}>Credential History — {userName}</h3>
          <button type="button" className="admin-btn admin-btn-sm admin-btn-secondary" onClick={onClose}>Close</button>
        </div>

        {loading ? (
          <p className="gmr-modal-desc">Loading credential history…</p>
        ) : !history || history.length === 0 ? (
          <p className="gmr-modal-desc" style={{ textAlign: 'center', padding: '2rem' }}>
            No credential history found for this user.
          </p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Date &amp; Time</th>
                  <th scope="col">Game</th>
                  <th scope="col">Action</th>
                  <th scope="col">Older Credentials</th>
                  <th scope="col">New Credentials</th>
                  <th scope="col">Performed By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.Game?.name || `Game ${row.gameId}`}</td>
                    <td>
                      <span className={`badge ${row.action === 'deleted' ? 'badge-danger' : 'badge-warning'}`}>
                        {ACTION_LABELS[row.action] || row.action}
                      </span>
                    </td>
                    <td>
                      {row.oldUsername || row.oldPassword ? (
                        <div style={{ fontSize: '0.85rem' }}>
                          <div><strong>U:</strong> <code className="ud-mono">{row.oldUsername || '—'}</code></div>
                          <div><strong>P:</strong> <code className="ud-mono">{row.oldPassword || '—'}</code></div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {row.action === 'deleted' ? (
                        <em style={{ color: '#999' }}>Cleared</em>
                      ) : row.newUsername || row.newPassword ? (
                        <div style={{ fontSize: '0.85rem' }}>
                          <div><strong>U:</strong> <code className="ud-mono">{row.newUsername || '—'}</code></div>
                          <div><strong>P:</strong> <code className="ud-mono">{row.newPassword || '—'}</code></div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div>{row.PerformedByUser?.username || DONE_BY_LABELS[row.operationDoneBy] || row.operationDoneBy || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>{row.operationDoneBy}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
