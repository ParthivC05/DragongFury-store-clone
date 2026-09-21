import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getStoreRoles, deleteStoreRole, getUsersFilterOptions } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import './StoreRoles.css'
import './Users.css'

function storeOptionValue(distributorCode, storeCode) {
  return `${distributorCode}||${storeCode}`
}

function parseStoreOptionValue(value) {
  if (!value || !value.includes('||')) return { distributorCode: '', storeCode: '' }
  const [distributorCode, storeCode] = value.split('||')
  return { distributorCode: distributorCode || '', storeCode: storeCode || '' }
}

export default function StoreRoles({ embedded = false }) {
  const toast = useToast()
  const { confirm } = useConfirm()
  const { user } = useAuth()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const [searchParams, setSearchParams] = useSearchParams()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const distributorCode = searchParams.get('distributorCode') || ''
  const storeCode = searchParams.get('storeCode') || ''
  const selectedStoreValue = distributorCode && storeCode
    ? storeOptionValue(distributorCode, storeCode)
    : ''

  useEffect(() => {
    if (!isMaster) return
    getUsersFilterOptions()
      .then((opts) => setStores(opts.stores || []))
      .catch(() => setStores([]))
  }, [isMaster])

  const sortedStores = useMemo(() => {
    return [...stores].sort((a, b) => {
      const left = `${a.storeCode || ''} ${a.distributorCode || ''}`.toLowerCase()
      const right = `${b.storeCode || ''} ${b.distributorCode || ''}`.toLowerCase()
      return left.localeCompare(right)
    })
  }, [stores])

  const load = () => {
    if (isMaster && (!distributorCode || !storeCode)) {
      setList([])
      setLoading(false)
      return
    }
    setLoading(true)
    const params = isMaster ? { distributorCode, storeCode } : {}
    getStoreRoles(params)
      .then((res) => setList(res.list || []))
      .catch((err) => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [isMaster, distributorCode, storeCode])

  const onStoreChange = (value) => {
    const next = new URLSearchParams()
    const parsed = parseStoreOptionValue(value)
    if (parsed.distributorCode) next.set('distributorCode', parsed.distributorCode)
    if (parsed.storeCode) next.set('storeCode', parsed.storeCode)
    setSearchParams(next)
  }

  const handleDelete = async (id, name) => {
    const ok = await confirm({ title: 'Delete role?', message: `Delete "${name}"?`, confirmLabel: 'Delete', variant: 'danger' })
    if (!ok) return
    deleteStoreRole(id)
      .then(() => { toast.success('Deleted.'); load() })
      .catch((err) => toast.error(err.message || 'Delete failed'))
  }

  const scopeQuery = isMaster && distributorCode && storeCode
    ? `?distributorCode=${encodeURIComponent(distributorCode)}&storeCode=${encodeURIComponent(storeCode)}`
    : ''

  const canManage = !isMaster || (distributorCode && storeCode)

  return (
    <div className="store-roles-page">
      {!embedded && (
        <div className="page-header" style={{ marginBottom: '2rem' }}>
          <h2>Store roles</h2>
          <p className="page-description">
            {isMaster
              ? 'Pick a store, then create or edit roles for that store.'
              : 'Create and manage roles for your store. Assign permissions to each role, then assign roles to store staff.'}
          </p>
          <div className="page-header-actions store-roles-actions">
            {canManage && (
              <Link to={`/store-roles/new${scopeQuery}`} className="admin-btn admin-btn-primary">Add role</Link>
            )}
          </div>
        </div>
      )}
      {embedded && canManage && (
        <div className="team-access-toolbar">
          <Link to={`/store-roles/new${scopeQuery}`} className="admin-btn admin-btn-primary">Add role</Link>
        </div>
      )}

      {!embedded && isMaster && (
        <div className="users-filters-card" style={{ marginBottom: '1.25rem' }}>
          <div className="users-filters-body">
            <div className="users-filters-row">
              <div className="users-filter-field">
                <label htmlFor="store-roles-filter-store">Store</label>
                <select
                  id="store-roles-filter-store"
                  value={selectedStoreValue}
                  onChange={(e) => onStoreChange(e.target.value)}
                  aria-label="Select store"
                >
                  <option value="">Select store</option>
                  {sortedStores.map((s) => (
                    <option
                      key={`${s.distributorCode}-${s.storeCode}`}
                      value={storeOptionValue(s.distributorCode, s.storeCode)}
                    >
                      {s.storeCode}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {isMaster && !canManage ? (
        <div className="page-loading">Select a store to manage roles.</div>
      ) : loading ? (
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
                <tr><td colSpan={5}>No store roles yet. Use “Add role” to create one.</td></tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td><code className="slug-cell">{r.slug || '—'}</code></td>
                    <td>{r.userCount ?? 0}</td>
                    <td>{Object.keys(r.permissions || {}).filter((k) => r.permissions[k]).length} enabled</td>
                    <td>
                      <Link to={`/store-roles/${r.id}/edit${scopeQuery}`} className="admin-btn admin-btn-sm admin-btn-edit">Edit</Link>
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
