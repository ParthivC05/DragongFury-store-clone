import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAutomationUsageGames, getAutomationUsageErrors, getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import { getPresetRange, formatDateRangeLabel, PRESETS } from '../utils/dateRange'
import './AutomationUsage.css'

const defaultRange = getPresetRange(PRESETS.TODAY)
const PAGE_SIZES = [10, 25, 50]

function formatDateTime(d) {
  if (!d) return '—'
  const date = new Date(d)
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dateStr} ${timeStr}`
}

function calcRate(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 1000) / 10
}

function formatPct(rate, totalCalls) {
  if (!totalCalls) return ''
  if (rate == null || Number.isNaN(rate)) return ''
  return `${rate}%`
}

function sortGamesByFailures(games) {
  return [...games].sort((a, b) => {
    const aRate = a.errorRate ?? calcRate(a.errorCalls, a.totalCalls)
    const bRate = b.errorRate ?? calcRate(b.errorCalls, b.totalCalls)
    if (bRate !== aRate) return bRate - aRate
    if (b.errorCalls !== a.errorCalls) return b.errorCalls - a.errorCalls
    if (b.totalCalls !== a.totalCalls) return b.totalCalls - a.totalCalls
    return (a.gameName || '').localeCompare(b.gameName || '')
  })
}

export default function AutomationUsage() {
  const toast = useToast()
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [storeFilter, setStoreFilter] = useState('all')
  const [storeOptions, setStoreOptions] = useState([])
  const [errorsGameFilter, setErrorsGameFilter] = useState('all')
  const [errorsStoreFilter, setErrorsStoreFilter] = useState('all')

  const [summary, setSummary] = useState(null)
  const [gameGroups, setGameGroups] = useState([])
  const [errors, setErrors] = useState({ rows: [], total: 0, page: 1, limit: 25, totalPages: 0 })
  const [loadingGames, setLoadingGames] = useState(false)
  const [loadingErrors, setLoadingErrors] = useState(false)

  useEffect(() => {
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((res) => {
        const codes = [...new Set((res?.list || [])
          .map((s) => String(s?.storeCode || '').trim())
          .filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
        setStoreOptions(codes)
      })
      .catch(() => setStoreOptions([]))
  }, [])

  const fetchGames = useCallback(() => {
    setLoadingGames(true)
    const params = { startDate, endDate }
    if (storeFilter && storeFilter !== 'all') params.storeCode = storeFilter
    getAutomationUsageGames(params)
      .then((data) => {
        setSummary(data?.summary || null)
        setGameGroups(Array.isArray(data?.games) ? data.games : [])
      })
      .catch((err) => {
        toast.error(err?.message || 'Failed to load data')
        setSummary(null)
        setGameGroups([])
      })
      .finally(() => setLoadingGames(false))
  }, [startDate, endDate, storeFilter, toast])

  const fetchErrors = useCallback(() => {
    setLoadingErrors(true)
    const params = {
      startDate,
      endDate,
      page: errors.page,
      limit: errors.limit
    }
    if (errorsGameFilter && errorsGameFilter !== 'all') params.gameName = errorsGameFilter
    if (errorsStoreFilter && errorsStoreFilter !== 'all') params.storeCode = errorsStoreFilter
    getAutomationUsageErrors(params)
      .then((data) => setErrors({
        rows: data.rows || [],
        total: data.total || 0,
        page: data.page || 1,
        limit: data.limit || 25,
        totalPages: data.totalPages || 0
      }))
      .catch(() => setErrors({ rows: [], total: 0, page: 1, limit: 25, totalPages: 0 }))
      .finally(() => setLoadingErrors(false))
  }, [startDate, endDate, errorsGameFilter, errorsStoreFilter, errors.page, errors.limit])

  useEffect(() => { fetchGames() }, [fetchGames])
  useEffect(() => { fetchErrors() }, [fetchErrors])
  useEffect(() => {
    setErrors((prev) => ({ ...prev, page: 1 }))
  }, [startDate, endDate, errorsGameFilter, errorsStoreFilter])

  const totals = useMemo(() => {
    const totalCalls = summary?.totalCalls || 0
    const successCalls = summary?.successCalls || 0
    const errorCalls = summary?.errorCalls || 0
    return {
      successCalls,
      errorCalls,
      totalCalls,
      successRate: summary?.successRate ?? calcRate(successCalls, totalCalls),
      errorRate: summary?.errorRate ?? calcRate(errorCalls, totalCalls)
    }
  }, [summary])

  const hasFailures = totals.errorCalls > 0
  const hasErrorsFilters = errorsGameFilter !== 'all' || errorsStoreFilter !== 'all'

  const errorsGameOptions = useMemo(() => {
    const names = new Set(gameGroups.map((g) => String(g.gameName || '').trim()).filter(Boolean))
    const hasOrionStars = [...names].some((name) => /orionstars?/i.test(name))
    const hasFirekirin = [...names].some((name) => /fire\s*kirin|firekirin/i.test(name))
    const hasMilkyway = [...names].some((name) => /milky\s*way|milkyway/i.test(name))
    if (hasOrionStars) {
      names.add('Orionstars (Agent API)')
      names.add('Orionstars (Bot API)')
    }
    if (hasFirekirin) {
      names.add('Firekirin (Agent API)')
      names.add('Firekirin (Bot API)')
    }
    if (hasMilkyway) {
      names.add('Milkyway (Agent API)')
      names.add('Milkyway (Bot API)')
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [gameGroups])

  const visibleGameGroups = useMemo(
    () => sortGamesByFailures(gameGroups),
    [gameGroups]
  )

  return (
    <div className="au-page">
      <header className="au-header">
        <h1 className="au-title">Automation usage</h1>
        <p className="au-subtitle">
          Third-party API calls per game — success and failure counts for the selected period.
        </p>
      </header>

      <div className="dashboard-filter-bar au-filter-bar">
        <DateRangeFilter
          embedded
          label="Period"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <label className="dashboard-filter-field" htmlFor="au-store-filter">
          <span className="dashboard-filter-field-label">Store</span>
          <select
            id="au-store-filter"
            className="dashboard-filter-input au-store-select"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label="Filter by store"
          >
            <option value="all">All stores</option>
            {storeOptions.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="au-range-label">{formatDateRangeLabel(startDate, endDate)}</p>

      <div className="au-summary">
        <div className="au-summary-item">
          <span className="au-summary-label">Total calls</span>
          <span className="au-summary-value">{totals.totalCalls}</span>
        </div>
        <div className="au-summary-item success">
          <span className="au-summary-label">Success</span>
          <span className="au-summary-value">{totals.successCalls}</span>
          {totals.totalCalls > 0 && (
            <span className="au-summary-pct">{formatPct(totals.successRate, totals.totalCalls)} success rate</span>
          )}
        </div>
        <div className="au-summary-item failure">
          <span className="au-summary-label">Failure</span>
          <span className="au-summary-value">{totals.errorCalls}</span>
          {totals.totalCalls > 0 && (
            <span className="au-summary-pct">{formatPct(totals.errorRate, totals.totalCalls)} failure rate</span>
          )}
        </div>
      </div>

      <section className="au-block">
        <h2 className="au-block-title">Calls by game</h2>
        <div className="au-table-wrap">
          {loadingGames ? (
            <p className="au-empty">Loading…</p>
          ) : (
            <table className="au-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th className="num">Success</th>
                  <th className="num">Success %</th>
                  <th className="num">Failure</th>
                  <th className="num">Failure %</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {visibleGameGroups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="au-empty">No automation games found.</td>
                  </tr>
                ) : (
                  visibleGameGroups.map((g) => {
                    const successRate = g.successRate ?? calcRate(g.successCalls, g.totalCalls)
                    const errorRate = g.errorRate ?? calcRate(g.errorCalls, g.totalCalls)
                    return (
                      <tr key={g.gameKey} className={g.errorCalls > 0 ? 'has-failure' : ''}>
                        <td className="au-game-name">{g.gameName}</td>
                        <td className="num au-num-success">{g.successCalls}</td>
                        <td className="num au-pct-success">{formatPct(successRate, g.totalCalls)}</td>
                        <td className="num au-num-failure">{g.errorCalls}</td>
                        <td className="num au-pct-failure">{formatPct(errorRate, g.totalCalls)}</td>
                        <td className="num">{g.totalCalls}</td>
                      </tr>
                    )
                  })
                )}
                {visibleGameGroups.length > 1 && (
                  <tr className="au-total-row">
                    <td><strong>Total</strong></td>
                    <td className="num au-num-success"><strong>{totals.successCalls}</strong></td>
                    <td className="num au-pct-success"><strong>{formatPct(totals.successRate, totals.totalCalls)}</strong></td>
                    <td className="num au-num-failure"><strong>{totals.errorCalls}</strong></td>
                    <td className="num au-pct-failure"><strong>{formatPct(totals.errorRate, totals.totalCalls)}</strong></td>
                    <td className="num"><strong>{totals.totalCalls}</strong></td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="au-block">
        <h2 className="au-block-title">Failed API calls</h2>
        {!hasFailures && !hasErrorsFilters && !loadingErrors ? (
          <p className="au-no-failures">No failures in this period. All API calls succeeded.</p>
        ) : (
          <>
            <div className="dashboard-filter-bar au-errors-filter-bar">
              <label className="dashboard-filter-field" htmlFor="au-errors-game-filter">
                <span className="dashboard-filter-field-label">Game</span>
                <select
                  id="au-errors-game-filter"
                  className="dashboard-filter-input au-errors-filter-select"
                  value={errorsGameFilter}
                  onChange={(e) => {
                    setErrorsGameFilter(e.target.value)
                    setErrors((p) => ({ ...p, page: 1 }))
                  }}
                  aria-label="Filter failed API calls by game"
                >
                  <option value="all">All games</option>
                  {errorsGameOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="dashboard-filter-field" htmlFor="au-errors-store-filter">
                <span className="dashboard-filter-field-label">Store</span>
                <select
                  id="au-errors-store-filter"
                  className="dashboard-filter-input au-errors-filter-select"
                  value={errorsStoreFilter}
                  onChange={(e) => {
                    setErrorsStoreFilter(e.target.value)
                    setErrors((p) => ({ ...p, page: 1 }))
                  }}
                  aria-label="Filter failed API calls by store"
                >
                  <option value="all">All stores</option>
                  {storeOptions.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="au-table-wrap au-table-failures">
              {loadingErrors ? (
                <p className="au-empty">Loading…</p>
              ) : (
                <table className="au-table">
                  <thead>
                    <tr>
                      <th>Date & time</th>
                      <th>Game</th>
                      <th>Store</th>
                      <th>Game username</th>
                      <th>Operation</th>
                      <th>Endpoint</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="au-empty">
                          {hasErrorsFilters
                            ? 'No failure records found for the selected filters.'
                            : 'No failure records found.'}
                        </td>
                      </tr>
                    ) : (
                      errors.rows.map((row) => (
                        <tr key={row.id}>
                          <td className="au-nowrap">{formatDateTime(row.createdAt)}</td>
                          <td>{row.gameName || '—'}</td>
                          <td>{row.storeName || row.storeCode || 'Unassigned'}</td>
                          <td className="au-game-username">{row.gameUsername || '—'}</td>
                          <td>{row.operation || '—'}</td>
                          <td>{row.apiEndpoint || '—'}</td>
                          <td className="au-error-text">{row.errorMessage || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
            {errors.totalPages > 1 && (
              <div className="au-pagination">
                <span>Page {errors.page} of {errors.totalPages}</span>
                <div>
                  <button
                    type="button"
                    disabled={errors.page <= 1 || loadingErrors}
                    onClick={() => setErrors((p) => ({ ...p, page: p.page - 1 }))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={errors.page >= errors.totalPages || loadingErrors}
                    onClick={() => setErrors((p) => ({ ...p, page: p.page + 1 }))}
                  >
                    Next
                  </button>
                  <select
                    value={errors.limit}
                    onChange={(e) => setErrors((p) => ({ ...p, limit: Number(e.target.value), page: 1 }))}
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
