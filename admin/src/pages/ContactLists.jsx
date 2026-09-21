import { useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadContactList,
  getContactList,
  getContactListDownloads,
  getContactListFilterOptions
} from '../api/admin'
import { ADMIN_FEATURE_KEYS, canAccessAdminFeature } from '../constants/permissions'
import { SortableTh } from '../components/SortableTh'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import './Users.css'
import './ContactLists.css'

const DEFAULT_SORT_BY = 'createdAt'
const PER_PAGE_OPTIONS = [10, 20, 50, 100]
const SEARCH_DEBOUNCE_MS = 350
const TABS = [
  { id: 'email', label: 'Email list' },
  { id: 'phone', label: 'Mobile number list' },
  { id: 'tracking', label: 'Download tracking' }
]

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function safeDownloadName(name) {
  const cleaned = String(name || 'contact-list.csv').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
  return cleaned.toLowerCase().endsWith('.csv') ? cleaned : `${cleaned || 'contact-list'}.csv`
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeDownloadName(fileName)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function downloaderLabel(row) {
  const name = String(row.downloadedByName || '').trim()
  const username = String(row.downloadedByUsername || '').trim()
  const email = String(row.downloadedByEmail || '').trim()
  if (name) return name
  if (username) return username
  if (email) return email
  if (row.downloadedByUserId) return `User #${row.downloadedByUserId}`
  return '—'
}

export default function ContactLists() {
  const { user } = useAuth()
  const toast = useToast()
  const canAccess = canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.CONTACT_LISTS)
  const requestIdRef = useRef(0)

  const [tab, setTab] = useState('email')
  const [data, setData] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [downloads, setDownloads] = useState({ list: [], total: 0, page: 1, limit: 20 })
  const [storeCodes, setStoreCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [storeCode, setStoreCode] = useState('')
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY)
  const [sortOrder, setSortOrder] = useState('desc')

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [searchInput])

  const listParams = useMemo(() => {
    const params = {
      listType: tab === 'phone' ? 'phone' : 'email',
      page,
      limit,
      sortBy,
      sortOrder: sortOrder === 'asc' ? 'ASC' : 'DESC'
    }
    if (storeCode) params.storeCode = storeCode
    if (verifiedOnly) params.verifiedOnly = '1'
    if (search) params.search = search
    return params
  }, [tab, page, limit, sortBy, sortOrder, storeCode, verifiedOnly, search])

  useEffect(() => {
    if (!canAccess) return
    setOptionsLoading(true)
    getContactListFilterOptions()
      .then((opts) => setStoreCodes(Array.isArray(opts?.storeCodes) ? opts.storeCodes : []))
      .catch(() => setStoreCodes([]))
      .finally(() => setOptionsLoading(false))
  }, [canAccess])

  useEffect(() => {
    setPage(1)
    setSortBy(DEFAULT_SORT_BY)
    setSortOrder('desc')
  }, [tab])

  useEffect(() => {
    setPage(1)
  }, [storeCode, verifiedOnly, limit, search])

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
    if (!canAccess) {
      setLoading(false)
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    const request = tab === 'tracking'
      ? getContactListDownloads({
          page,
          limit,
          ...(storeCode ? { storeCode } : {})
        })
      : getContactList(listParams)

    request
      .then((result) => {
        if (requestId !== requestIdRef.current) return
        if (tab === 'tracking') setDownloads(result)
        else setData(result)
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return
        toast.error(err.message || (tab === 'tracking' ? 'Failed to load download tracking' : 'Failed to load list'))
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return
        setLoading(false)
      })
  }, [canAccess, tab, listParams, page, limit, storeCode])

  const handleDownload = async () => {
    if (tab === 'tracking' || downloading) return
    setDownloading(true)
    try {
      const result = await downloadContactList({
        listType: tab === 'phone' ? 'phone' : 'email',
        storeCode: storeCode || undefined,
        verifiedOnly,
        search: search || undefined,
        sortBy,
        sortOrder: sortOrder === 'asc' ? 'ASC' : 'DESC'
      })
      if (!result?.blob || result.blob.size === 0) {
        throw new Error('Download failed')
      }
      triggerBlobDownload(result.blob, result.fileName)
      const noun = tab === 'phone' ? 'mobile numbers' : 'emails'
      toast.success(
        result.rowCount == null
          ? `Downloaded ${noun}`
          : `Downloaded ${result.rowCount} ${noun}`
      )
    } catch (err) {
      toast.error(err.message || 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const activeTotal = tab === 'tracking' ? downloads.total : data.total
  const totalPages = Math.ceil(activeTotal / limit) || 1
  const from = activeTotal === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, activeTotal)
  const contactCol = tab === 'phone' ? 'phone' : 'email'
  const verifiedLabel = tab === 'phone' ? 'Phone verified' : 'Email verified'
  const hasFilters = Boolean(storeCode || verifiedOnly || searchInput.trim())

  if (!canAccess) {
    return (
      <div className="users-page">
        <div className="page-header">
          <h2>Email & phone lists</h2>
          <p className="page-subtitle">You don’t have access to this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="users-page contact-lists-page">
      <div className="contact-lists-header">
        <div>
          <h2>Email & phone lists</h2>
          <p className="page-subtitle">
            Player emails and mobile numbers. Super admin always has access. Technical staff only if this permission is granted on their role. Every download is tracked.
          </p>
        </div>
        {tab !== 'tracking' ? (
          <button
            type="button"
            className="reports-export-btn"
            onClick={handleDownload}
            disabled={downloading || loading}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        ) : null}
      </div>

      <div className="contact-lists-tabs" role="tablist" aria-label="Contact list type">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`contact-lists-tab${tab === item.id ? ' contact-lists-tab-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="users-filters-card">
        <div className="users-filters-body">
          <div className="users-filters-row">
            <div className="users-filter-field">
              <label htmlFor="contact-list-filter-store">Store</label>
              <select
                id="contact-list-filter-store"
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
            {tab !== 'tracking' ? (
              <>
                <div className="users-filter-field">
                  <label htmlFor="contact-list-filter-verified">Verified</label>
                  <select
                    id="contact-list-filter-verified"
                    value={verifiedOnly ? '1' : ''}
                    onChange={(e) => setVerifiedOnly(e.target.value === '1')}
                  >
                    <option value="">All</option>
                    <option value="1">Verified only</option>
                  </select>
                </div>
                <div className="users-filter-field contact-lists-search-field">
                  <label htmlFor="contact-list-search">Search</label>
                  <input
                    id="contact-list-search"
                    type="search"
                    maxLength={80}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={tab === 'phone' ? 'Phone, username, or ID' : 'Email, username, or ID'}
                  />
                </div>
              </>
            ) : null}
            {hasFilters ? (
              <div className="users-filter-field users-filter-clear-wrap">
                <label>&nbsp;</label>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-primary"
                  onClick={() => {
                    setStoreCode('')
                    setVerifiedOnly(false)
                    setSearchInput('')
                    setSearch('')
                  }}
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
      ) : tab === 'tracking' ? (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Downloaded at</th>
                <th>Downloaded by</th>
                <th>Role</th>
                <th>List</th>
                <th>Store</th>
                <th>Verified only</th>
                <th>Search</th>
                <th>Rows</th>
                <th>File</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {downloads.list.length === 0 ? (
                <tr>
                  <td colSpan={10}>No downloads yet.</td>
                </tr>
              ) : (
                downloads.list.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>
                      <div>{downloaderLabel(row)}</div>
                      {row.downloadedByUsername && downloaderLabel(row) !== row.downloadedByUsername ? (
                        <div className="contact-lists-muted">{row.downloadedByUsername}</div>
                      ) : null}
                      {row.downloadedByEmail ? (
                        <div className="contact-lists-muted">{row.downloadedByEmail}</div>
                      ) : null}
                      {row.downloadedByUserId ? (
                        <div className="contact-lists-muted">ID {row.downloadedByUserId}</div>
                      ) : null}
                    </td>
                    <td>{row.downloadedByRole || '—'}</td>
                    <td>{row.listType === 'phone' ? 'Mobile numbers' : 'Emails'}</td>
                    <td>{row.storeCode || 'All stores'}</td>
                    <td>{row.verifiedOnly ? 'Yes' : 'No'}</td>
                    <td>{row.search || '—'}</td>
                    <td>{row.rowCount}</td>
                    <td>{row.fileName || '—'}</td>
                    <td>{row.ipAddress || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <SortableTh label="ID" sortKey="userId" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableTh
                  label={tab === 'phone' ? 'Mobile number' : 'Email'}
                  sortKey={contactCol}
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableTh label="Username" sortKey="username" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableTh label="Store" sortKey="storeCode" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableTh
                  label={verifiedLabel}
                  sortKey={tab === 'phone' ? 'isPhoneVerified' : 'isEmailVerified'}
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableTh label="Created at" sortKey="createdAt" currentSortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {data.list.length === 0 ? (
                <tr>
                  <td colSpan={6}>No {tab === 'phone' ? 'mobile numbers' : 'emails'} match the current filters.</td>
                </tr>
              ) : (
                data.list.map((row) => (
                  <tr key={`${tab}-${row.userId}`}>
                    <td>{row.userId}</td>
                    <td>{(tab === 'phone' ? row.phone : row.email) || '—'}</td>
                    <td>{row.username || '—'}</td>
                    <td>{row.storeCode || '—'}</td>
                    <td>{row.verified ? 'Yes' : 'No'}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (activeTotal > 0 || totalPages > 1) ? (
        <div className="pagination">
          <div className="pagination-per-page">
            <label htmlFor="contact-list-per-page">Per page</label>
            <select
              id="contact-list-per-page"
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
            {activeTotal > 0 ? `Showing ${from}–${to} of ${activeTotal}` : 'No results'}
            {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
          </span>
          <div className="pagination-buttons">
            <button type="button" className="admin-btn admin-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className="admin-btn admin-btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
