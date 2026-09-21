import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { getStores, getStoresFilterOptions, deleteStore } from '../api/admin'
import { SortableTh } from '../components/SortableTh'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import './Distributors.css'
import './Users.css'

const DEFAULT_SORT_BY = 'createdAt'
const PER_PAGE_OPTIONS = [10, 20, 50, 100]

export default function Stores() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [distributorCodes, setDistributorCodes] = useState([])
  const [distributorFilter, setDistributorFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY)
  const [sortOrder, setSortOrder] = useState('desc')
  const [loading, setLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(isMasterAdmin)

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

  const displayList = useMemo(() => {
    const list = data.list || []
    if (!list.length) return list
    if (sortBy === 'userCount') {
      const dir = sortOrder === 'asc' ? 1 : -1
      return [...list].sort((a, b) => {
        const va = Number(a.userCount) ?? 0
        const vb = Number(b.userCount) ?? 0
        return dir * (va - vb)
      })
    }
    return list
  }, [data.list, sortBy, sortOrder])

  useEffect(() => {
    if (!isMasterAdmin) {
      setOptionsLoading(false)
      return
    }
    getStoresFilterOptions()
      .then((opts) => setDistributorCodes(opts.distributorCodes || []))
      .catch(() => setDistributorCodes([]))
      .finally(() => setOptionsLoading(false))
  }, [isMasterAdmin])

  useEffect(() => {
    setLoading(true)
    const params = {
      page,
      limit,
      sortBy: sortBy === 'userCount' ? 'createdAt' : sortBy,
      sortOrder: sortOrder === 'asc' ? 'ASC' : 'DESC'
    }
    if (isMasterAdmin && distributorFilter) params.distributorCode = distributorFilter
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (search.trim()) params.search = search.trim()
    getStores(params)
      .then(setData)
      .catch((err) => {
        toast.error(err.message || 'Failed to load stores')
        setData({ list: [], total: 0, page: 1, limit: 20 })
      })
      .finally(() => setLoading(false))
  }, [page, limit, distributorFilter, dateFrom, dateTo, search, sortBy, sortOrder, isMasterAdmin])

  useEffect(() => {
    setPage(1)
  }, [distributorFilter, dateFrom, dateTo, search, limit])

  async function handleDelete(id, label) {
    const ok = await confirm({
      title: 'Deactivate store?',
      message: `Soft-delete store "${label}"? The store and all its users will be deactivated and hidden from this list. User accounts, wallets, and history are kept (not permanently deleted).`,
      confirmLabel: 'Soft delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    deleteStore(id)
      .then((resp) => {
        toast.success(resp?.message || 'Store soft-deleted.')
        setData((prev) => ({
          ...prev,
          list: prev.list.filter((s) => s.userId !== id),
          total: Math.max(0, prev.total - 1)
        }))
      })
      .catch((err) => {
        toast.error(err.message || 'Delete failed')
      })
  }

  const onDateFromChange = (nextFrom) => {
    setDateFrom(nextFrom)
    if (dateTo && nextFrom && dateTo < nextFrom) {
      setDateTo(nextFrom)
    }
  }

  const onDateToChange = (nextTo) => {
    setDateTo(nextTo)
    if (dateFrom && nextTo && nextTo < dateFrom) {
      setDateFrom(nextTo)
    }
  }

  const hasActiveFilters = Boolean((isMasterAdmin && distributorFilter) || dateFrom || dateTo || search.trim())
  const clearFilters = () => {
    setDistributorFilter('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }

  const totalPages = Math.ceil(data.total / limit) || 1
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, data.total)

  if (optionsLoading && isMasterAdmin && distributorCodes.length === 0) return <div className="page-loading">Loading…</div>

  const colCount = isMasterAdmin ? 8 : 7

  return (
    <div className="distributors-page">
      <div className="page-header">
        <h2>Stores</h2>
        <div className="page-header-actions">
          <Link to="/stores/new" className="admin-btn admin-btn-primary">Add store</Link>
        </div>
      </div>

      <div className="users-filters-card">
        <div className="users-filters-body">
          <div className="users-search-wrap">
            <svg className="users-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
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
            {isMasterAdmin && (
              <div className="users-filter-field">
                <label htmlFor="stores-filter-distributor">Distributor code</label>
                <select
                  id="stores-filter-distributor"
                  value={distributorFilter}
                  onChange={(e) => setDistributorFilter(e.target.value)}
                  disabled={optionsLoading}
                >
                  <option value="">All</option>
                  {distributorCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="users-filter-field">
              <label htmlFor="stores-filter-date-from">Date from</label>
              <input
                id="stores-filter-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                max={dateTo || undefined}
              />
            </div>
            <div className="users-filter-field">
              <label htmlFor="stores-filter-date-to">Date to</label>
              <input
                id="stores-filter-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                min={dateFrom || undefined}
              />
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
                  {isMasterAdmin && <SortableTh label="Distributor code" sortKey="distributorCode" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                  <SortableTh label="Store code" sortKey="storeCode" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Users" sortKey="userCount" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableTh label="Status" sortKey="isActive" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayList.length === 0 ? (
                  <tr><td colSpan={colCount}>{hasActiveFilters ? 'No stores match the current filters.' : 'No stores found.'}</td></tr>
                ) : (
                  displayList.map((s) => (
                    <tr key={s.userId}>
                      <td>{s.userId}</td>
                      <td>{s.email || '—'}</td>
                      <td>{s.username || '—'}</td>
                      {isMasterAdmin && <td>{s.distributorCode ?? '—'}</td>}
                      <td>{s.storeCode ?? '—'}</td>
                      <td>{s.userCount ?? 0}</td>
                      <td>{s.isActive ? 'Active' : 'Inactive'}</td>
                      <td className="stores-actions-cell">
                        <Link to={`/stores/${s.userId}`} className="admin-btn admin-btn-sm admin-btn-secondary">View</Link>
                        {' '}
                        <Link to={`/stores/${s.userId}/edit`} className="admin-btn admin-btn-sm admin-btn-edit">Edit</Link>
                        {' '}
                        <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(s.userId, s.storeCode || s.email)}>Deactivate</button>
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
                <label htmlFor="stores-per-page">Per page</label>
                <select
                  id="stores-per-page"
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
