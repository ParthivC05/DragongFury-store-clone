import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getAdminRoles, deleteAdminRole } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import './StoreRoles.css'

export default function AdminRoles({ embedded = false }) {
  const toast = useToast()
  const { confirm } = useConfirm()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    getAdminRoles()
      .then((res) => setList(res.list || []))
      .catch((err) => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id, name) => {
    const ok = await confirm({ title: 'Delete role?', message: `Delete "${name}"?`, confirmLabel: 'Delete', variant: 'danger' })
    if (!ok) return
    deleteAdminRole(id)
      .then(() => { toast.success('Deleted.'); load() })
      .catch((err) => toast.error(err.message || 'Delete failed'))
  }

  return (
    <div className="store-roles-page">
      {!embedded && (
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <h2>Admin roles</h2>
          <p className="page-description">Create and manage roles for the admin panel. Assign permissions to each role (including technical error email notification), then assign roles to admin staff.</p>
          <div className="page-header-actions store-roles-actions">
            <Link to="/admin-roles/new" className="admin-btn admin-btn-primary">Add role</Link>
          </div>
        </div>
      )}
      {embedded && (
        <div className="team-access-toolbar">
          <Link to="/admin-roles/new" className="admin-btn admin-btn-primary">Add role</Link>
        </div>
      )}

      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Users</th>
                <th>Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={5}>No admin roles yet. Use “Add role” to create one.</td></tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td><code className="slug-cell">{r.slug || '—'}</code></td>
                    <td>{r.userCount ?? 0}</td>
                    <td>{Object.keys(r.permissions || {}).filter((k) => r.permissions[k]).length} enabled</td>
                    <td>
                      <Link to={`/admin-roles/${r.id}/edit`} className="admin-btn admin-btn-sm admin-btn-edit">Edit</Link>
                      {' '}
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(r.id, r.name)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
