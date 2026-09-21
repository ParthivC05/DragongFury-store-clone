import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getAdminStaff, getAdminRoles, deleteAdminStaff, updateAdminStaff } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import './StoreStaff.css'
import './Users.css'

const FILTER_ALL = ''
const FILTER_FULL_ADMIN = 'full_admin'

export default function AdminStaff({ embedded = false }) {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()

  const [list, setList] = useState([])
  const [roles, setRoles] = useState([])
  const [roleFilter, setRoleFilter] = useState(FILTER_ALL)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState(null)

  const loadPlatformStaff = () => {
    setLoading(true)
    Promise.all([getAdminStaff(), getAdminRoles()])
      .then(([staffRes, rolesRes]) => {
        setList(staffRes.list || [])
        setRoles(rolesRes.list || [])
      })
      .catch((err) => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadPlatformStaff() }, [])

  const filteredList = useMemo(() => {
    let result = list
    if (roleFilter === FILTER_FULL_ADMIN) result = result.filter((s) => !s.adminRoleId)
    else if (roleFilter !== FILTER_ALL) {
      const id = parseInt(roleFilter, 10)
      result = result.filter((s) => s.adminRoleId === id || s.adminRole?.id === id)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter((s) =>
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.username && s.username.toLowerCase().includes(q))
      )
    }
    return result
  }, [list, roleFilter, search])

  const hasActiveFilters = roleFilter !== FILTER_ALL || search.trim() !== ''
  const clearFilters = () => {
    setRoleFilter(FILTER_ALL)
    setSearch('')
  }

  const isCurrentUser = (staff) => user?.userId === staff.userId

  const handleDelete = async (staff) => {
    if (isCurrentUser(staff)) return
    const ok = await confirm({ title: 'Delete staff?', message: `Remove "${staff.email}" from admin staff?`, confirmLabel: 'Delete', variant: 'danger' })
    if (!ok) return
    deleteAdminStaff(staff.userId)
      .then(() => { toast.success('Staff removed.'); loadPlatformStaff() })
      .catch((err) => toast.error(err.message || 'Delete failed'))
  }

  const handleTogglePlatformStaffActive = async (staff) => {
    if (isCurrentUser(staff)) return
    const next = !staff.isActive
    const ok = await confirm({
      title: next ? 'Activate access?' : 'Deactivate access?',
      message: next
        ? `Allow "${staff.email}" to sign in to the admin panel?`
        : `Block "${staff.email}" from signing in to the admin panel?`,
      confirmLabel: next ? 'Activate' : 'Deactivate',
      variant: next ? 'primary' : 'danger'
    })
    if (!ok) return
    setTogglingId(staff.userId)
    updateAdminStaff(staff.userId, { isActive: next })
      .then(() => {
        toast.success(next ? 'Admin staff activated.' : 'Admin staff deactivated.')
        loadPlatformStaff()
      })
      .catch((err) => toast.error(err.message || 'Update failed'))
      .finally(() => setTogglingId(null))
  }

  return (
    <div className="store-staff-page">
      {!embedded && (
        <div className="page-header">
          <h2>Admin staff</h2>
          <p className="page-subtitle">Add team members to the admin panel and assign them a role. Filter by role or search by email or username.</p>
          <div className="page-header-actions">
            <Link to="/admin-staff/new" className="admin-btn admin-btn-primary">Add staff</Link>
          </div>
        </div>
      )}
      {embedded && (
        <div className="team-access-toolbar">
          <Link to="/admin-staff/new" className="admin-btn admin-btn-primary">Add staff</Link>
        </div>
      )}

      {!embedded && (
      <div className="users-filters-card">
        <div className="users-filters-body">
          <div className="users-search-wrap">
            <svg className="users-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              className="users-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email or username..."
              aria-label="Search by email or username"
            />
          </div>
          <div className="users-filters-row">
            <div className="users-filter-field">
              <label htmlFor="admin-staff-filter-role">Role</label>
              <select
                id="admin-staff-filter-role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                aria-label="Filter by role"
              >
                <option value={FILTER_ALL}>All roles</option>
                <option value={FILTER_FULL_ADMIN}>Full admin</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {hasActiveFilters && (
              <div className="users-filter-field users-filter-clear-wrap">
                <label>&nbsp;</label>
                <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={clearFilters} aria-label="Clear all filters">
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {loading ? (
        <div className="page-loading">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan={5}>{list.length === 0 ? 'No admin staff yet. Use “Add staff” to create one.' : 'No staff match the current filters.'}</td></tr>
              ) : (
                filteredList.map((s) => (
                  <tr key={s.userId}>
                    <td>{s.email || '—'}</td>
                    <td>{s.username || '—'}</td>
                    <td>{s.adminRole ? s.adminRole.name : 'Full admin'}</td>
                    <td>{s.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <Link to={`/admin-staff/${s.userId}/edit`} className="admin-btn admin-btn-sm admin-btn-edit">Edit</Link>
                      {' '}
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-secondary"
                        onClick={() => handleTogglePlatformStaffActive(s)}
                        disabled={isCurrentUser(s) || togglingId === s.userId}
                      >
                        {togglingId === s.userId ? '…' : (s.isActive ? 'Deactivate' : 'Activate')}
                      </button>
                      {' '}
                      <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(s)} disabled={isCurrentUser(s)}>Delete</button>
                      {isCurrentUser(s) && <span className="hint"> (you)</span>}
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
