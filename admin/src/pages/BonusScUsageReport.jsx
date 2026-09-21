import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBonusScUsageSummary, getBonusScUsageFilterOptions } from '../api/admin'
import { useToast } from '../context/ToastContext'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import { getPresetRange, PRESETS } from '../utils/dateRange'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './BonusScUsageReport.css'

const defaultRange = getPresetRange(PRESETS.TODAY)
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function formatSc(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '0.00'
  return Number(amount).toFixed(2)
}

export default function BonusScUsageReport() {
  const toast = useToast()
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [storeFilter, setStoreFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const [storeOptions, setStoreOptions] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBonusScUsageFilterOptions()
      .then((res) => setStoreOptions(Array.isArray(res?.storeCodes) ? res.storeCodes : []))
      .catch(() => setStoreOptions([]))
  }, [])

  useEffect(() => {
    setPage(1)
  }, [startDate, endDate, storeFilter])

  const load = useCallback(() => {
    setLoading(true)
    const params = { startDate, endDate, page, limit: pageSize }
    if (storeFilter) params.storeCode = storeFilter

    getBonusScUsageSummary(params)
      .then((res) => setData(res || null))
      .catch((err) => {
        toast.error(err.message || 'Failed to load Bonus SC report')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [startDate, endDate, storeFilter, page, pageSize, toast])

  useEffect(() => {
    load()
  }, [load])

  const totals = data?.totals || { unused: 0, used: 0, given: 0 }
  const storeRows = Array.isArray(data?.storeRows) ? data.storeRows : []
  const rows = Array.isArray(data?.rows) ? data.rows : []
  const total = Number(data?.total) || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const hints = data?.hints || {
    unused: 'Bonus SC players still have in their wallet right now (not used yet).',
    used: 'Bonus SC spent in games or taken away by admin in this date range.',
    given: 'Bonus SC we gave to players in this date range.'
  }

  return (
    <div className="ccw-page bsu-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Bonus SC: used &amp; left</h1>
        <p className="ccw-subtitle">
          Simple picture of free Bonus SC — how much is still sitting with players, and how much was already used.
        </p>
      </header>

      <div className="bsu-help" role="note">
        <p className="bsu-help-title">How to read this (super easy)</p>
        <ul>
          <li>
            <span className="bsu-dot bsu-dot-left" aria-hidden="true" />
            <strong>Still left</strong> — Bonus SC players have not used yet. (right now)
          </li>
          <li>
            <span className="bsu-dot bsu-dot-used" aria-hidden="true" />
            <strong>Already used</strong> — Bonus SC spent in games (or taken away) in the dates you pick.
          </li>
          <li>
            <span className="bsu-dot bsu-dot-given" aria-hidden="true" />
            <strong>Given</strong> — Bonus SC we gave out in those same dates.
          </li>
        </ul>
      </div>

      <div className="dashboard-filter-bar bsu-filter-bar">
        <DateRangeFilter
          embedded
          label="Dates for Used & Given"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <label className="dashboard-filter-field" htmlFor="bsu-store">
          <span className="dashboard-filter-field-label">Store</span>
          <select
            id="bsu-store"
            className="dashboard-filter-input bsu-store-select"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label="Filter by store"
          >
            <option value="">All stores</option>
            {storeOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p className="ccw-loading">Loading…</p>
      ) : (
        <>
          <div className="bsu-cards" aria-live="polite">
            <article className="bsu-card bsu-card-left" title={hints.unused}>
              <h2 className="bsu-card-label">Still left</h2>
              <p className="bsu-card-amount">{formatSc(totals.unused)} <span>SC</span></p>
              <p className="bsu-card-hint">Not used yet (right now)</p>
            </article>
            <article className="bsu-card bsu-card-used" title={hints.used}>
              <h2 className="bsu-card-label">Already used</h2>
              <p className="bsu-card-amount">{formatSc(totals.used)} <span>SC</span></p>
              <p className="bsu-card-hint">In the dates you picked</p>
            </article>
            <article className="bsu-card bsu-card-given" title={hints.given}>
              <h2 className="bsu-card-label">Given</h2>
              <p className="bsu-card-amount">{formatSc(totals.given)} <span>SC</span></p>
              <p className="bsu-card-hint">In the dates you picked</p>
            </article>
          </div>

          <section className="bsu-table-section">
            <h2 className="bsu-table-title">By store</h2>
            <div className="ccw-table-wrap">
              <table className="ccw-table bsu-table">
                <thead>
                  <tr>
                    <th scope="col">Store</th>
                    <th scope="col" className="bsu-col-num">Players</th>
                    <th scope="col" className="bsu-col-num">Still left</th>
                    <th scope="col" className="bsu-col-num">Already used</th>
                    <th scope="col" className="bsu-col-num">Given</th>
                  </tr>
                </thead>
                <tbody>
                  {storeRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="ccw-empty">
                        No store numbers found for this filter.
                      </td>
                    </tr>
                  ) : (
                    storeRows.map((r) => (
                      <tr key={r.storeCode}>
                        <td>{r.storeCode || '—'}</td>
                        <td className="bsu-col-num">{r.players ?? 0}</td>
                        <td className="bsu-col-num bsu-num-left">{formatSc(r.unused)}</td>
                        <td className="bsu-col-num bsu-num-used">{formatSc(r.used)}</td>
                        <td className="bsu-col-num bsu-num-given">{formatSc(r.given)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {storeRows.length > 0 && (
                  <tfoot>
                    <tr className="bsu-tfoot">
                      <td><strong>All together</strong></td>
                      <td className="bsu-col-num"><strong>{total}</strong></td>
                      <td className="bsu-col-num bsu-num-left"><strong>{formatSc(totals.unused)}</strong></td>
                      <td className="bsu-col-num bsu-num-used"><strong>{formatSc(totals.used)}</strong></td>
                      <td className="bsu-col-num bsu-num-given"><strong>{formatSc(totals.given)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          <section className="bsu-table-section">
            <h2 className="bsu-table-title">Players</h2>
            <div className="ccw-table-wrap">
              <table className="ccw-table bsu-table">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Name</th>
                    <th scope="col">Email / Phone</th>
                    <th scope="col">Store</th>
                    <th scope="col" className="bsu-col-num">Still left</th>
                    <th scope="col" className="bsu-col-num">Already used</th>
                    <th scope="col" className="bsu-col-num">Given</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="ccw-empty">
                        No Bonus SC numbers found for this filter.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.userId}>
                        <td>
                          {r.userId ? (
                            <Link to={`/users/${r.userId}`} className="bsu-user-link">
                              @{r.username || `user-${r.userId}`}
                            </Link>
                          ) : (
                            <span>{r.username || '—'}</span>
                          )}
                        </td>
                        <td>{r.name || '—'}</td>
                        <td>
                          <div className="bsu-contact">
                            <span>{r.email || '—'}</span>
                            {r.phone ? <span className="bsu-phone">{r.phone}</span> : null}
                          </div>
                        </td>
                        <td>{r.storeCode || '—'}</td>
                        <td className="bsu-col-num bsu-num-left">{formatSc(r.unused)}</td>
                        <td className="bsu-col-num bsu-num-used">{formatSc(r.used)}</td>
                        <td className="bsu-col-num bsu-num-given">{formatSc(r.given)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="bsu-tfoot">
                      <td colSpan={4}><strong>All together</strong></td>
                      <td className="bsu-col-num bsu-num-left"><strong>{formatSc(totals.unused)}</strong></td>
                      <td className="bsu-col-num bsu-num-used"><strong>{formatSc(totals.used)}</strong></td>
                      <td className="bsu-col-num bsu-num-given"><strong>{formatSc(totals.given)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {total > 0 && (
              <div className="dep-pager">
                <div className="dep-page-size-group">
                  <label className="dep-page-size-label" htmlFor="bsu-page-size">
                    Entries
                  </label>
                  <select
                    id="bsu-page-size"
                    className="dep-page-size-select"
                    value={pageSize}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      if (!Number.isFinite(next)) return
                      setPageSize(next)
                      setPage(1)
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <div className="dep-pager-controls">
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(1)}
                  >
                    First
                  </button>
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
