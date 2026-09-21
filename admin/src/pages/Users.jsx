import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getUsers, getUsersFilterOptions, patchUserAdmin } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { canViewPlayerEmail, canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import { SortableTh } from '../components/SortableTh'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import './Users.css'

const DEFAULT_SORT_BY = 'createdAt'
const PER_PAGE_OPTIONS = [10, 20, 50, 100]

export default function Users() {
  const { user } = useAuth()
  const toast = useToast()
  const { confirm } = useConfirm()
  const role = user?.role
  const isMaster = role === ROLES.MASTER_ADMIN
  const isDistributor = role === ROLES.DISTRIBUTOR_ADMIN
  const isStore = role === ROLES.STORE_ADMIN
  const showPlayerEmail = canShowPlayerEmailColumn(role)
  const canSearchPlayerEmail = canViewPlayerEmail(role)

  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [filterOptions, setFilterOptions] = useState({ distributorCodes: [], stores: [], storeCodes: [] })
  const [loading, setLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(isMaster || isDistributor)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [distributorCode, setDistributorCode] = useState('')
  const [storeCode, setStoreCode] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY)
  const [sortOrder, setSortOrder] = useState('desc')
  const [togglingId, setTogglingId] = useState(null)

  const storesForSelectedDistributor = useMemo(() => {
    if (!isMaster || !filterOptions.stores) return []
    if (!distributorCode) return filterOptions.stores
    return filterOptions.stores.filter((s) => s.distributorCode === distributorCode)
  }, [isMaster, filterOptions.stores, distributorCode])

  useEffect(() => {
    if (!isMaster && !isDistributor) return
    setOptionsLoading(true)
    getUsersFilterOptions()
      .then((opts) => {
        setFilterOptions({
          distributorCodes: opts.distributorCodes || [],
          stores: opts.stores || [],
          storeCodes: opts.storeCodes || []
        })
      })
      .catch(() => setFilterOptions({ distributorCodes: [], stores: [], storeCodes: [] }))
      .finally(() => setOptionsLoading(false))
  }, [isMaster, isDistributor])

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
    setLoading(true)
    const params = { page, limit, sortBy, sortOrder: sortOrder === 'asc' ? 'ASC' : 'DESC' }
    if (isMaster && distributorCode) params.distributorCode = distributorCode
    if ((isMaster || isDistributor) && storeCode) params.storeCode = storeCode
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (search.trim()) params.search = search.trim()
    if (isMaster && activityFilter) params.activityFilter = activityFilter
    getUsers(params)
      .then(setData)
      .catch((err) => {
        toast.error(err.message || 'Failed to load users')
      })
      .finally(() => setLoading(false))
  }, [page, limit, isMaster, isDistributor, distributorCode, storeCode, dateFrom, dateTo, search, activityFilter, sortBy, sortOrder])

  useEffect(() => {
    setPage(1)
  }, [distributorCode, storeCode, dateFrom, dateTo, search, activityFilter, limit])

  const onDistributorChange = (val) => {
    setDistributorCode(val)
    setStoreCode('')
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

  const hasActiveFilters = Boolean(distributorCode || storeCode || dateFrom || dateTo || search.trim() || activityFilter)
  const showPhoneCol = isMaster && activityFilter === 'phone_verified'
  const clearFilters = () => {
    setDistributorCode('')
    setStoreCode('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setActivityFilter('')
    setPage(1)
  }

  const totalPages = Math.ceil(data.total / limit) || 1
  const from = data.total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, data.total)
  const showDistributorFilter = isMaster
  const showStoreFilter = isMaster || isDistributor
  const tableColSpan = (isMaster ? 9 : isDistributor ? 7 : 6) + (showPhoneCol ? 1 : 0)

  const handleToggleActive = async (u) => {
    const next = u.isActive === false
    const ok = await confirm({
      title: next ? 'Activate account' : 'Deactivate account',
      message: next
        ? 'This user will be able to sign in and use the store again.'
        : 'This user will not be able to sign in until the account is activated again.',
      confirmLabel: next ? 'Activate' : 'Deactivate',
      variant: next ? 'primary' : 'danger'
    })
    if (!ok) return
    setTogglingId(u.userId)
    try {
      await patchUserAdmin(u.userId, { isActive: next })
      toast.success(next ? 'Account activated.' : 'Account deactivated.')
      setData((prev) => ({
        ...prev,
        list: prev.list.map((item) =>
          item.userId === u.userId ? { ...item, isActive: next } : item
        )
      }))
    } catch (err) {
      toast.error(err.message || 'Update failed')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <h2>Users</h2>
        <p className="page-subtitle">
          {isMaster && 'All end-users. Filter by distributor, store, date and search by email, username or game username.'}
          {isDistributor && 'Users under your distribution. Filter by store, date and search by username or game username.'}
          {isStore && 'Users under your store. Filter by date and search by user ID, username or game username.'}
        </p>
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
              placeholder={canSearchPlayerEmail ? 'Search by email, username or game username...' : 'Search by user ID, username or game username...'}
              aria-label={canSearchPlayerEmail ? 'Search by email, username or game username' : 'Search by user ID, username or game username'}
            />
          </div>
          <div className="users-filters-row">
            {showDistributorFilter && (
              <div className="users-filter-field">
                <label htmlFor="users-filter-distributor">Distributor</label>
                <select
                  id="users-filter-distributor"
                  value={distributorCode}
                  onChange={(e) => onDistributorChange(e.target.value)}
                  disabled={optionsLoading}
                >
                  <option value="">All distributors</option>
                  {(filterOptions.distributorCodes || []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            {showStoreFilter && (
              <div className="users-filter-field">
                <label htmlFor="users-filter-store">Store</label>
                <select
                  id="users-filter-store"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value)}
                  disabled={optionsLoading}
                >
                  <option value="">All stores</option>
                  {isMaster && storesForSelectedDistributor.map((s) => (
                    <option key={`${s.distributorCode}-${s.storeCode}`} value={s.storeCode}>{s.storeCode}</option>
                  ))}
                  {isDistributor && (filterOptions.storeCodes || []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
            {isMaster && (
              <div className="users-filter-field">
                <label htmlFor="users-filter-activity">Activity filter</label>
                <select
                  id="users-filter-activity"
                  value={activityFilter}
                  onChange={(e) => setActivityFilter(e.target.value)}
                >
                  <option value="">All users</option>
                  <option value="deposit">Deposit</option>
                  <option value="spin_wheel">Spin Wheel</option>
                  <option value="withdrawal">Withdrawal</option>
                  <option value="deposit_withdrawal">Deposit & Withdrawal</option>
                  <option value="phone_verified">Phone verified</option>
                  <option value="email_verified">Email verified</option>
                </select>
              </div>
            )}
            <div className="users-filter-field">
              <label htmlFor="users-filter-date-from">Date from</label>
              <input
                id="users-filter-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                max={dateTo || undefined}
              />
            </div>
            <div className="users-filter-field">
              <label htmlFor="users-filter-date-to">Date to</label>
              <input
                id="users-filter-date-to"
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
                  {showPlayerEmail && <SortableTh label="Email" sortKey="email" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                  {showPhoneCol && <th scope="col">Phone</th>}
                  <SortableTh label="Username" sortKey="username" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  {isMaster && <SortableTh label="Distributor code" sortKey="distributorCode" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                  {(isMaster || isDistributor) && <SortableTh label="Store code" sortKey="storeCode" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />}
                  <th scope="col">Status</th>
                  <th scope="col">Account</th>
                  <SortableTh label="Created" sortKey="createdAt" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.list.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan}>{hasActiveFilters ? 'No users match the current filters.' : 'No users found.'}</td>
                  </tr>
                ) : (
                  data.list.map((u) => (
                    <tr key={u.userId}>
                      <td>{u.userId}</td>
                      {showPlayerEmail && <td>{u.email || '—'}</td>}
                      {showPhoneCol && <td>{u.phone || '—'}</td>}
                      <td>{u.username || '—'}</td>
                      {isMaster && <td>{u.distributorCode ?? '—'}</td>}
                      {(isMaster || isDistributor) && <td>{u.storeCode ?? '—'}</td>}
                      <td>
                        <span
                          className={`users-status-pill ${u.isActive === false ? 'users-status-pill--inactive' : 'users-status-pill--active'}`}
                        >
                          {u.isActive === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`admin-btn admin-btn-sm ${u.isActive === false ? 'admin-btn-success' : 'admin-btn-warning'}`}
                          disabled={togglingId !== null}
                          onClick={() => handleToggleActive(u)}
                          title={u.isActive === false ? 'Activate account' : 'Deactivate account'}
                        >
                          {togglingId === u.userId ? '…' : (u.isActive === false ? 'Activate' : 'Deactivate')}
                        </button>
                      </td>
                      <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <Link className="admin-btn admin-btn-sm admin-btn-edit" to={`/users/${u.userId}`}>Open profile</Link>
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
                <label htmlFor="users-per-page">Per page</label>
                <select
                  id="users-per-page"
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
