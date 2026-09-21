import { useEffect, useMemo, useState } from 'react'
import { getUsers, getUsersFilterOptions } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { SortableTh } from '../components/SortableTh'
import { useToast } from '../context/ToastContext'
import './Users.css'

const DEFAULT_SORT_BY = 'createdAt'
const PER_PAGE_OPTIONS = [10, 20, 50, 100]

function formatCreatedAt(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export default function UserDirectory() {
  const { user } = useAuth()
  const toast = useToast()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [storeCode, setStoreCode] = useState('')
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY)
  const [sortOrder, setSortOrder] = useState('desc')

  const storeCodes = useMemo(() => {
    return [...new Set((stores || []).map((s) => s.storeCode).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [stores])

  useEffect(() => {
    if (!isMaster) return
    setOptionsLoading(true)
    getUsersFilterOptions()
      .then((opts) => setStores(opts.stores || []))
      .catch(() => setStores([]))
      .finally(() => setOptionsLoading(false))
  }, [isMaster])

  const handleSort = (key) => {
    if (key !== sortBy) {
      setSortBy(key)
      setSortOrder('asc')
      setPage(1)
      return
    }
    if (sortOrder === 'asc') {
      setSortOrder('desc')
      setPage(1)
      return
    }
    setSortBy(DEFAULT_SORT_BY)
    setSortOrder('desc')
    setPage(1)
  }

  useEffect(() => {
    if (!isMaster) {
      setLoading(false)
      return
    }
    setLoading(true)
    const params = {
      page,
      limit,
      sortBy,
      sortOrder: sortOrder === 'asc' ? 'ASC' : 'DESC',
      includePhone: '1'
    }
    if (storeCode) params.storeCode = storeCode
    getUsers(params)
      .then(setData)
      .catch((err) => {
        toast.error(err.message || 'Failed to load users')
      })
      .finally(() => setLoading(false))
  }, [isMaster, page, limit, storeCode, sortBy, sortOrder])

  useEffect(() => {
    setPage(1)
  }, [storeCode, limit])

  const totalPages = Math.ceil(data.total / limit) || 1
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, data.total)

  if (!isMaster) {
    return (
      <div className="users-page">
        <div className="page-header">
          <h2>User directory</h2>
          <p className="page-subtitle">You don’t have access to this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <h2>User directory</h2>
        <p className="page-subtitle">End-user directory. Filter by store.</p>
      </div>

      <div className="users-filters-card">
        <div className="users-filters-body">
          <div className="users-filters-row">
            <div className="users-filter-field">
              <label htmlFor="user-list-filter-store">Store</label>
              <select
                id="user-list-filter-store"
                value={storeCode}
                onChange={(e) => setStoreCode(e.target.value)}
                disabled={optionsLoading}
              >
                <option value="">All stores</option>
                {storeCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            {storeCode ? (
              <div className="users-filter-field users-filter-clear-wrap">
                <label>&nbsp;</label>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-primary"
                  onClick={() => setStoreCode('')}
                  aria-label="Clear store filter"
                >
                  Clear
                </button>
              </div>
            ) : null}
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
                  <SortableTh label="ID" sortKey="userId" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Email" sortKey="email" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Username" sortKey="username" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Phone number" sortKey="phone" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Store code" sortKey="storeCode" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Created at" sortKey="createdAt" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {data.list.length === 0 ? (
                  <tr>
                    <td colSpan={6}>{storeCode ? 'No users match the current store filter.' : 'No users found.'}</td>
                  </tr>
                ) : (
                  data.list.map((u) => (
                    <tr key={u.userId}>
                      <td>{u.userId}</td>
                      <td>{u.email || '—'}</td>
                      <td>{u.username || '—'}</td>
                      <td>{u.phone || '—'}</td>
                      <td>{u.storeCode || '—'}</td>
                      <td>{formatCreatedAt(u.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {(data.total > 0 || totalPages > 1) && (
            <div className="pagination">
              <div className="pagination-per-page">
                <label htmlFor="user-list-per-page">Per page</label>
                <select
                  id="user-list-per-page"
                  className="pagination-select"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value))
                    setPage(1)
                  }}
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
