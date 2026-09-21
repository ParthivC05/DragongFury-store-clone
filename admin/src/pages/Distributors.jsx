import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getDistributors, deleteDistributor } from '../api/admin'
import { SortableTh } from '../components/SortableTh'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import './Distributors.css'
import './Users.css'

const DEFAULT_SORT_BY = 'createdAt'
const PER_PAGE_OPTIONS = [10, 20, 50, 100]

export default function Distributors() {
  const toast = useToast()
  const { confirm } = useConfirm()
  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY)
  const [sortOrder, setSortOrder] = useState('desc')
  const [loading, setLoading] = useState(true)

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
    if (sortBy === 'storesCount' || sortBy === 'usersCount') {
      const dir = sortOrder === 'asc' ? 1 : -1
      return [...list].sort((a, b) => {
        const va = Number(a[sortBy]) ?? 0
        const vb = Number(b[sortBy]) ?? 0
        return dir * (va - vb)
      })
    }
    return list
  }, [data.list, sortBy, sortOrder])

  useEffect(() => {
    setLoading(true)
    const params = {
      page,
      limit,
      sortBy: ['storesCount', 'usersCount'].includes(sortBy) ? 'createdAt' : sortBy,
      sortOrder: sortOrder === 'asc' ? 'ASC' : 'DESC'
    }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (search.trim()) params.search = search.trim()
    getDistributors(params)
      .then(setData)
      .catch((err) => {
        toast.error(err.message || 'Failed to load distributors')
        setData({ list: [], total: 0, page: 1, limit: 20 })
      })
      .finally(() => setLoading(false))
  }, [page, limit, dateFrom, dateTo, search, sortBy, sortOrder])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, search, limit])

  async function handleDelete(id, name) {
    const ok = await confirm({
      title: 'Delete distributor?',
      message: `Delete distributor "${name}"? This will permanently delete all child stores, store users, and related history/transactions.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    deleteDistributor(id)
      .then((resp) => {
        toast.success(resp?.message || 'Distributor deleted.')
        setData((prev) => ({
          ...prev,
          list: prev.list.filter((d) => d.userId !== id),
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

  const hasActiveFilters = Boolean(dateFrom || dateTo || search.trim())
  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }

  const totalPages = Math.ceil(data.total / limit) || 1
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, data.total)

  return (
    <div className="distributors-page">
      <div className="page-header">
        <h2>Distributors</h2>
        <div className="page-header-actions">
          <Link to="/distributors/new" className="admin-btn admin-btn-primary">Add distributor</Link>
        </div>
      </div>

      <div className="users-filters-card">
        <div className="users-filters-body">
          <div className="users-search-wrap">
            <svg className="users-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              className="users-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, username or distributor code..."
              aria-label="Search distributors by email, username or distributor code"
            />
          </div>
          <div className="users-filters-row">
            <div className="users-filter-field">
              <label htmlFor="distributors-filter-date-from">Date from</label>
              <input
                id="distributors-filter-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                max={dateTo || undefined}
              />
            </div>
            <div className="users-filter-field">
              <label htmlFor="distributors-filter-date-to">Date to</label>
              <input
                id="distributors-filter-date-to"
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
              <SortableTh label="Email" sortKey="email" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="Username" sortKey="username" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="Distributor code" sortKey="distributorCode" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="Stores" sortKey="storesCount" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="Users" sortKey="usersCount" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableTh label="Status" sortKey="isActive" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayList.length === 0 ? (
              <tr><td colSpan={7}>{hasActiveFilters ? 'No distributors match the current filters.' : 'No distributors yet.'}</td></tr>
            ) : (
              displayList.map((d) => (
                <tr key={d.userId}>
                  <td>{d.email || '—'}</td>
                  <td>{d.username || '—'}</td>
                  <td>{d.distributorCode || '—'}</td>
                  <td>{d.storesCount ?? 0}</td>
                  <td>{d.usersCount ?? 0}</td>
                  <td>{d.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <Link to={`/distributors/${d.userId}/edit`} className="admin-btn admin-btn-sm admin-btn-edit">Edit</Link>
                    {' '}
                    <button type="button" className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(d.userId, d.email || d.username)}>Delete</button>
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
            <label htmlFor="distributors-per-page">Per page</label>
            <select
              id="distributors-per-page"
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
