import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getStoreStaff, getStoreRoles, deleteStoreStaff, updateStoreStaff, getUsersFilterOptions, getStaffShifts } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import StaffShiftModal from '../components/StaffShiftModal'
import './StoreStaff.css'
import './Users.css'

const FILTER_ALL = ''
const FILTER_FULL_ADMIN = 'full_admin'

export default function StoreStaff({ embedded = false }) {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const [searchParams, setSearchParams] = useSearchParams()
  const [list, setList] = useState([])
  const [roles, setRoles] = useState([])
  const [shiftsByUserId, setShiftsByUserId] = useState({})
  const [shiftStaff, setShiftStaff] = useState(null)
  const [roleFilter, setRoleFilter] = useState(FILTER_ALL)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterOptions, setFilterOptions] = useState({ distributorCodes: [], stores: [] })
  const [togglingId, setTogglingId] = useState(null)
  const distributorCode = searchParams.get('distributorCode') || ''
  const storeCode = searchParams.get('storeCode') || ''

  useEffect(() => {
    if (!isMaster) return
    getUsersFilterOptions()
      .then((opts) => {
        setFilterOptions({
          distributorCodes: opts.distributorCodes || [],
          stores: opts.stores || []
        })
      })
      .catch(() => setFilterOptions({ distributorCodes: [], stores: [] }))
  }, [isMaster])

  const storesForSelectedDistributor = useMemo(() => {
    if (!filterOptions.stores) return []
    if (!distributorCode) return filterOptions.stores
    return filterOptions.stores.filter((s) => s.distributorCode === distributorCode)
  }, [filterOptions.stores, distributorCode])

  const load = () => {
    if (isMaster && (!distributorCode || !storeCode)) {
      setList([])
      setRoles([])
      setShiftsByUserId({})
      setLoading(false)
      return
    }
    setLoading(true)
    const staffParams = isMaster ? { distributorCode, storeCode } : {}
    const rolesParams = isMaster ? { distributorCode, storeCode } : {}
    Promise.all([
      getStoreStaff(staffParams),
      getStoreRoles(rolesParams),
      getStaffShifts(staffParams).catch(() => ({ list: [] }))
    ])
      .then(([staffRes, rolesRes, shiftsRes]) => {
        setList(staffRes.list || [])
        setRoles(rolesRes.list || [])
        const map = {}
        for (const shift of shiftsRes.list || []) {
          if (shift?.userId) map[shift.userId] = shift
        }
        setShiftsByUserId(map)
      })
      .catch((err) => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [isMaster, distributorCode, storeCode])

  const setStoreScope = (dc, sc) => {
    const next = new URLSearchParams()
    if (dc) next.set('distributorCode', dc)
    if (sc) next.set('storeCode', sc)
    setSearchParams(next)
  }

  const filteredList = useMemo(() => {
    let result = list
    if (roleFilter === FILTER_FULL_ADMIN) result = result.filter((s) => !s.storeRoleId)
    else if (roleFilter !== FILTER_ALL) {
      const id = parseInt(roleFilter, 10)
      result = result.filter((s) => s.storeRoleId === id || s.storeRole?.id === id)
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
  const canManage = !isMaster || (distributorCode && storeCode)
  const scopeQuery = isMaster && distributorCode && storeCode
    ? `?distributorCode=${encodeURIComponent(distributorCode)}&storeCode=${encodeURIComponent(storeCode)}`
    : ''

  const handleDelete = async (staff) => {
    if (isCurrentUser(staff)) return
    const ok = await confirm({ title: 'Delete staff?', message: `Remove "${staff.email}" from store staff?`, confirmLabel: 'Delete', variant: 'danger' })
    if (!ok) return
    deleteStoreStaff(staff.userId)
      .then(() => { toast.success('Staff removed.'); load() })
      .catch((err) => toast.error(err.message || 'Delete failed'))
  }

  const handleToggleActive = async (staff) => {
    if (isCurrentUser(staff)) return
    const next = !staff.isActive
    const ok = await confirm({
      title: next ? 'Activate access?' : 'Deactivate access?',
      message: next
        ? `Allow "${staff.email}" to sign in to the store panel?`
        : `Block "${staff.email}" from signing in to the store panel?`,
      confirmLabel: next ? 'Activate' : 'Deactivate',
      variant: next ? 'primary' : 'danger'
    })
    if (!ok) return
    setTogglingId(staff.userId)
    updateStoreStaff(staff.userId, { isActive: next })
      .then(() => {
        toast.success(next ? 'Staff activated.' : 'Staff deactivated.')
        load()
      })
      .catch((err) => toast.error(err.message || 'Update failed'))
      .finally(() => setTogglingId(null))
  }

  return (
    <div className="store-staff-page">
      {!embedded && (
        <div className="page-header">
          <h2>Store staff</h2>
          <p className="page-subtitle">
            {isMaster
              ? 'Manage store admins and staff for any store — assign roles, page permissions, and activate or deactivate access.'
              : 'Add team members and assign them a role. Filter by role or search by email or username.'}
          </p>
          <div className="page-header-actions">
            {canManage && (
              <Link to={`/store-staff/new${scopeQuery}`} className="admin-btn admin-btn-primary">Add staff</Link>
            )}
          </div>
        </div>
      )}
      {embedded && canManage && (
        <div className="team-access-toolbar">
          <Link to={`/store-staff/new${scopeQuery}`} className="admin-btn admin-btn-primary">Add staff</Link>
        </div>
      )}

      {!embedded && isMaster && (
        <div className="users-filters-card" style={{ marginBottom: '1.25rem' }}>
          <div className="users-filters-body">
            <div className="users-filters-row">
              <div className="users-filter-field">
                <label htmlFor="store-staff-filter-distributor">Distributor</label>
                <select
                  id="store-staff-filter-distributor"
                  value={distributorCode}
                  onChange={(e) => setStoreScope(e.target.value, '')}
                  aria-label="Filter by distributor"
                >
                  <option value="">Select distributor</option>
                  {filterOptions.distributorCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="users-filter-field">
                <label htmlFor="store-staff-filter-store-scope">Store</label>
                <select
                  id="store-staff-filter-store-scope"
                  value={storeCode}
                  onChange={(e) => setStoreScope(distributorCode, e.target.value)}
                  aria-label="Filter by store"
                  disabled={!distributorCode}
                >
                  <option value="">Select store</option>
                  {storesForSelectedDistributor.map((s) => (
                    <option key={`${s.distributorCode}-${s.storeCode}`} value={s.storeCode}>{s.storeCode}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {!embedded && canManage && (
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
                <label htmlFor="store-staff-filter-role">Role</label>
                <select
                  id="store-staff-filter-role"
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

      {isMaster && !canManage ? (
        <div className="page-loading">Select a distributor and store to manage staff.</div>
      ) : loading ? (
        <div className="page-loading">Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
                <th>Shift</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan={6}>{list.length === 0 ? 'No staff yet. Use “Add staff” to create one.' : 'No staff match the current filters.'}</td></tr>
              ) : (
                filteredList.map((s) => (
                  <tr key={s.userId}>
                    <td>{s.email || '—'}</td>
                    <td>{s.username || '—'}</td>
                    <td>{s.storeRole ? s.storeRole.name : 'Full admin'}</td>
                    <td>
                      {s.storeRoleId ? (
                        shiftsByUserId[s.userId]
                          ? `${shiftsByUserId[s.userId].timezone} ${shiftsByUserId[s.userId].startTime}–${shiftsByUserId[s.userId].endTime}`
                          : 'Not set (can log in anytime)'
                      ) : '—'}
                    </td>
                    <td>{s.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <Link to={`/store-staff/${s.userId}/edit${scopeQuery}`} className="admin-btn admin-btn-sm admin-btn-edit">Edit</Link>
                      {s.storeRoleId ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            onClick={() => setShiftStaff({ ...s, distributorCode: s.distributorCode || distributorCode, storeCode: s.storeCode || storeCode })}
                          >
                            {shiftsByUserId[s.userId] ? 'Edit shift' : 'Set shift'}
                          </button>
                        </>
                      ) : null}
                      {' '}
                      <button
                        type="button"
                        className="admin-btn admin-btn-sm admin-btn-secondary"
                        onClick={() => handleToggleActive(s)}
                        disabled={isCurrentUser(s) || togglingId === s.userId}
                      >
                        {togglingId === s.userId ? '…' : (s.isActive ? 'Deactivate' : 'Activate')}
                      </button>
                      {s.storeRoleId ? (
                        <>
                          {' '}
                          <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(s)} disabled={isCurrentUser(s)}>Delete</button>
                        </>
                      ) : null}
                      {isCurrentUser(s) && <span className="hint"> (you)</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {shiftStaff && (
        <StaffShiftModal
          staff={shiftStaff}
          shift={shiftsByUserId[shiftStaff.userId] || null}
          onClose={() => setShiftStaff(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
