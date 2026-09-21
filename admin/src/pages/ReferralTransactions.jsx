import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getReferralTransactions, getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { canViewPlayerEmail, canShowPlayerEmailColumn } from '../utils/playerEmailVisibility'
import { formatTransactionDateTime } from '../utils/dateRange'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './ReferralTransactions.css'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const SIMPLE_FILTERS = [
  { value: '', label: 'Show all' },
  { value: 'classic_10pct', label: 'Old 10% deposit program' },
  { value: 'friend_waiting', label: 'Friend did not get signup SC yet' },
  { value: 'inviter_waiting', label: 'Inviter still waiting for SC' },
  { value: 'both_received', label: 'Both already got SC (Give/Get)' },
  { value: 'inviter_blocked', label: 'Inviter blocked by weekly limit' }
]

function formatDate(d) {
  return formatTransactionDateTime(d)
}

function UserCell({ user, label, showPlayerEmail }) {
  if (!user?.userId) return <span className="ccw-dash">—</span>
  return (
    <div className="rt-user-cell">
      {label ? <span className="rt-user-role">{label}</span> : null}
      <Link to={`/users/${user.userId}`} className="rt-user-link">
        ID {user.userId}
      </Link>
      {user.username ? <span className="ccw-user-email">@{user.username}</span> : null}
      {showPlayerEmail && user.email ? <span className="ccw-user-email">{user.email}</span> : null}
    </div>
  )
}

function ProgramBadge({ program }) {
  if (!program) return <span className="ccw-dash">—</span>
  const cls =
    program.key === 'classic_10pct'
      ? 'rt-program rt-program-classic'
      : 'rt-program rt-program-giveget'
  return (
    <div className="rt-program-wrap">
      <span className={cls}>{program.label}</span>
      {program.detail ? <span className="rt-program-detail">{program.detail}</span> : null}
    </div>
  )
}

function BonusAnswer({ bonus }) {
  if (!bonus) return <span className="ccw-dash">—</span>
  const cls =
    bonus.key === 'received'
      ? 'rt-answer rt-answer-yes'
      : bonus.key === 'blocked' || bonus.key === 'classic_no_signup' || bonus.key === 'got_welcome_instead'
        ? 'rt-answer rt-answer-no'
        : bonus.key === 'not_yet' || bonus.key === 'not_started'
          ? 'rt-answer rt-answer-no'
          : 'rt-answer rt-answer-wait'

  return (
    <div className="rt-answer-wrap">
      <span className={cls}>{bonus.label}</span>
      {bonus.detail ? <span className="rt-answer-detail">{bonus.detail}</span> : null}
      {bonus.amount != null && (bonus.key === 'received' || bonus.key === 'got_welcome_instead') ? (
        <span className="rt-answer-amount">{Number(bonus.amount).toFixed(2)} SC</span>
      ) : null}
      {bonus.at && bonus.key === 'waiting_payout' ? (
        <span className="rt-answer-detail">Due: {formatDate(bonus.at)}</span>
      ) : null}
      {bonus.at && (bonus.key === 'received' || bonus.key === 'got_welcome_instead') ? (
        <span className="rt-answer-detail">On {formatDate(bonus.at)}</span>
      ) : null}
    </div>
  )
}

export default function ReferralTransactions() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [storeOptions, setStoreOptions] = useState([])
  const [filtersLoading, setFiltersLoading] = useState(false)

  const [storeInput, setStoreInput] = useState('')
  const [filterInput, setFilterInput] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [startDateInput, setStartDateInput] = useState('')
  const [endDateInput, setEndDateInput] = useState('')

  const [appliedStore, setAppliedStore] = useState('')
  const [appliedFilter, setAppliedFilter] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState('')
  const [appliedEndDate, setAppliedEndDate] = useState('')
  const [applyKey, setApplyKey] = useState(0)

  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const showStoreColumn = user?.role === ROLES.MASTER_ADMIN
  const showPlayerEmail = canShowPlayerEmailColumn(user?.role)
  const canSearchByEmail = canViewPlayerEmail(user?.role)

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit: pageSize }
    if (isMaster && appliedStore) params.storeCode = appliedStore
    if (appliedFilter) params.simpleFilter = appliedFilter
    if (appliedSearch) params.search = appliedSearch
    if (appliedStartDate) params.startDate = appliedStartDate
    if (appliedEndDate) params.endDate = appliedEndDate
    getReferralTransactions(params)
      .then((res) => {
        setList(res.list || [])
        setTotal(typeof res.total === 'number' ? res.total : 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load referral report')
        setList([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [
    page,
    pageSize,
    appliedStore,
    appliedFilter,
    appliedSearch,
    appliedStartDate,
    appliedEndDate,
    applyKey,
    isMaster,
    toast
  ])

  useEffect(() => {
    if (!user || !isMaster) {
      setStoreOptions([])
      return
    }
    setFiltersLoading(true)
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((storesRes) => {
        const stores = [...new Set((storesRes?.list || [])
          .map((s) => (s?.storeCode || '').toString().trim())
          .filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
        setStoreOptions(stores)
      })
      .catch(() => setStoreOptions([]))
      .finally(() => setFiltersLoading(false))
  }, [user, isMaster])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function handleStartDateChange(nextStart) {
    setStartDateInput(nextStart)
    if (endDateInput && nextStart && endDateInput < nextStart) {
      setEndDateInput(nextStart)
    }
  }

  function handleEndDateChange(nextEnd) {
    setEndDateInput(nextEnd)
    if (startDateInput && nextEnd && nextEnd < startDateInput) {
      setStartDateInput(nextEnd)
    }
  }

  function applyFilters() {
    setAppliedStore(storeInput.trim())
    setAppliedFilter(filterInput.trim().toLowerCase())
    setAppliedSearch(searchInput.trim())
    setAppliedStartDate(startDateInput)
    setAppliedEndDate(endDateInput)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function clearFilters() {
    setStoreInput('')
    setFilterInput('')
    setSearchInput('')
    setStartDateInput('')
    setEndDateInput('')
    setAppliedStore('')
    setAppliedFilter('')
    setAppliedSearch('')
    setAppliedStartDate('')
    setAppliedEndDate('')
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  const colCount = 6 + (showStoreColumn ? 1 : 0)

  return (
    <div className="ccw-page dep-page rt-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Referral report</h1>
        <p className="ccw-subtitle">
          Who invited whom, which program applied, and who got SC.
        </p>
      </header>

      <div className="rt-howto" role="note">
        <p className="rt-howto-title">How to read this page</p>
        <ol className="rt-howto-list">
          <li>
            <strong>Old 10% deposit</strong> = before Give/Get. Friend gets <em>no</em> signup SC.
            Inviter gets <strong>10% of the friend’s deposits</strong> (up to 3 times).
          </li>
          <li>
            <strong>Give / Get</strong> = current program. Friend gets signup SC; inviter gets fixed SC after friend deposits &amp; plays.
          </li>
          <li>
            <strong>Friend got SC?</strong> = referral signup bonus. If they got welcome SC by mistake, that reason is shown.
          </li>
          <li>
            <strong>Inviter got SC?</strong> = bonus to the person who shared the link (fixed SC or 10% of deposits).
          </li>
        </ol>
      </div>

      <div className="ccw-toolbar dep-filters">
        {isMaster && (
          <>
            <label className="ccw-filter-label" htmlFor="rt-store">
              Store
            </label>
            <select
              id="rt-store"
              className="dep-filter-input"
              value={storeInput}
              disabled={filtersLoading}
              onChange={(e) => setStoreInput(e.target.value)}
            >
              <option value="">All stores</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="ccw-filter-label" htmlFor="rt-filter">
          Show
        </label>
        <select
          id="rt-filter"
          className="dep-filter-input"
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
        >
          {SIMPLE_FILTERS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label className="ccw-filter-label" htmlFor="rt-search">
          Find player
        </label>
        <input
          id="rt-search"
          type="search"
          className="dep-filter-input rt-search-input"
          placeholder={canSearchByEmail ? 'Name or email' : 'Name or user ID'}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyFilters()
          }}
        />

        <div className="dep-date-range">
          <div className="dep-date-field">
            <label className="ccw-filter-label" htmlFor="rt-date-start">
              Friend joined from
            </label>
            <input
              id="rt-date-start"
              type="date"
              className="dep-filter-input"
              value={startDateInput}
              onChange={(e) => handleStartDateChange(e.target.value)}
              max={endDateInput || undefined}
            />
          </div>
          <div className="dep-date-field">
            <label className="ccw-filter-label" htmlFor="rt-date-end">
              to
            </label>
            <input
              id="rt-date-end"
              type="date"
              className="dep-filter-input"
              value={endDateInput}
              onChange={(e) => handleEndDateChange(e.target.value)}
              min={startDateInput || undefined}
            />
          </div>
        </div>

        <button type="button" className="admin-btn admin-btn-secondary dep-apply" onClick={applyFilters}>
          Apply
        </button>
        <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={clearFilters}>
          Clear
        </button>
      </div>

      {loading ? (
        <p className="ccw-loading">Loading…</p>
      ) : (
        <>
          <div className="ccw-table-wrap dep-table-wrap">
            <table className="ccw-table dep-table rt-table">
              <thead>
                <tr>
                  <th scope="col">Friend joined</th>
                  {showStoreColumn && <th scope="col">Store</th>}
                  <th scope="col">Program</th>
                  <th scope="col">Who invited</th>
                  <th scope="col">Friend</th>
                  <th scope="col">Friend got SC?</th>
                  <th scope="col">Inviter got SC?</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="ccw-empty">
                      No invites found yet.
                    </td>
                  </tr>
                ) : (
                  list.map((r) => (
                    <tr key={r.id}>
                      <td className="ccw-td-date" title={formatDate(r.createdAt)}>
                        {formatDate(r.createdAt)}
                      </td>
                      {showStoreColumn && (
                        <td className="ccw-td-store" title={r.storeCode || undefined}>
                          {r.storeCode || <span className="ccw-dash">—</span>}
                        </td>
                      )}
                      <td>
                        <ProgramBadge program={r.program} />
                      </td>
                      <td>
                        <UserCell user={r.whoInvited} showPlayerEmail={showPlayerEmail} />
                      </td>
                      <td>
                        <UserCell user={r.friend} showPlayerEmail={showPlayerEmail} />
                      </td>
                      <td>
                        <BonusAnswer bonus={r.friendBonus} />
                      </td>
                      <td>
                        <BonusAnswer bonus={r.inviterBonus} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="dep-pager">
            <div className="dep-page-size-group">
              <label className="dep-page-size-label" htmlFor="rt-page-size">
                Rows
              </label>
              <select
                id="rt-page-size"
                className="dep-page-size-select"
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  if (!Number.isFinite(next)) return
                  setPageSize(next)
                  setPage(1)
                }}
              >
                {PAGE_SIZE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {total > pageSize && (
              <div className="dep-pager-controls">
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="dep-pager-meta">
                  Page {page} of {totalPages} ({total} total)
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
