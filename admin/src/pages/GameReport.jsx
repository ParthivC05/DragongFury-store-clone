import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getGameReport, getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { getPresetRange, PRESETS } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './SlotsTransactions.css'
import './BonusReport.css'
import './GameReport.css'

const defaultRange = getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'All providers' },
  { value: 'gitslotpark', label: 'GitSlotPark' },
  { value: 'bona', label: 'Bona Games' },
  { value: 'onegamehub', label: '1GameHub' },
  { value: 'scorpio', label: 'Scorpio Play' },
  { value: 'win568', label: 'Win568' }
]

function formatAmount(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '0.00'
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatPayout(payout) {
  if (payout == null || !Number.isFinite(Number(payout))) return '—'
  return `${Number(payout).toFixed(2)}%`
}

function SortHeader({ id, label, orderBy, orderDirection, onSort, align = 'left' }) {
  const active = orderBy === id
  const arrow = !active ? '' : orderDirection === 'ASC' ? ' ↑' : ' ↓'
  return (
    <th scope="col" className={align === 'right' ? 'gr-th gr-th-num' : 'gr-th gr-th-text'}>
      <button
        type="button"
        className={`gr-sort-btn${active ? ' is-active' : ''}`}
        onClick={() => onSort(id)}
      >
        {label}{arrow}
      </button>
    </th>
  )
}

export default function GameReport() {
  const { user } = useAuth()
  const toast = useToast()

  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [providerInput, setProviderInput] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [storeInput, setStoreInput] = useState('')
  const [tab, setTab] = useState('game')

  const [appliedProvider, setAppliedProvider] = useState('all')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedStore, setAppliedStore] = useState('')
  const [appliedStartDate, setAppliedStartDate] = useState(defaultRange.startDate)
  const [appliedEndDate, setAppliedEndDate] = useState(defaultRange.endDate)
  const [applyKey, setApplyKey] = useState(0)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [orderBy, setOrderBy] = useState('sc_wagered')
  const [orderDirection, setOrderDirection] = useState('DESC')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [storeOptions, setStoreOptions] = useState([])
  const [filtersLoading, setFiltersLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = {
      page,
      limit: pageSize,
      tab,
      orderBy,
      orderDirection,
      provider: appliedProvider || 'all'
    }
    if (appliedStartDate) params.startDate = appliedStartDate
    if (appliedEndDate) params.endDate = appliedEndDate
    if (appliedSearch) params.search = appliedSearch
    if (isMaster && appliedStore) params.storeCode = appliedStore

    getGameReport(params)
      .then((res) => {
        setRows(res.rows || [])
        setSummary(res.summary || null)
        setTotal(typeof res.total === 'number' ? res.total : 0)
      })
      .catch((err) => {
        toast.error(err?.message || 'Failed to load casino games report')
        setRows([])
        setSummary(null)
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [
    page,
    pageSize,
    tab,
    orderBy,
    orderDirection,
    appliedProvider,
    appliedSearch,
    appliedStore,
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
    let cancelled = false
    setFiltersLoading(true)
    ;(async () => {
      try {
        const codes = new Set()
        let storePage = 1
        let storeTotal = Infinity
        const storePageSize = 100
        while (!cancelled && (storePage - 1) * storePageSize < storeTotal && storePage <= 50) {
          const storesRes = await getStores({ limit: storePageSize, page: storePage, sortBy: 'storeCode', sortOrder: 'ASC' })
          storeTotal = typeof storesRes?.total === 'number' ? storesRes.total : 0
          const list = storesRes?.list || []
          for (const s of list) {
            const code = (s?.storeCode || '').toString().trim()
            if (code) codes.add(code)
          }
          if (list.length === 0) break
          storePage += 1
        }
        if (!cancelled) setStoreOptions([...codes].sort((a, b) => a.localeCompare(b)))
      } catch {
        if (!cancelled) setStoreOptions([])
      } finally {
        if (!cancelled) setFiltersLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user, isMaster])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const isProviderTab = tab === 'provider'
  const colCount = isProviderTab ? 6 : 8
  const hasGcTotals = summary && (Number(summary.gcWagered) !== 0 || Number(summary.gcWon) !== 0)

  function handlePreset(range) {
    if (!range?.startDate || range?.endDate == null) return
    setStartDate(range.startDate)
    setEndDate(range.endDate)
  }

  function applyFilters() {
    setAppliedProvider(providerInput)
    setAppliedSearch(searchInput.trim())
    setAppliedStore(storeInput.trim())
    setAppliedStartDate(startDate)
    setAppliedEndDate(endDate)
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function clearFilters() {
    const range = getPresetRange(PRESETS.LAST_7) || getPresetRange(PRESETS.TODAY)
    setProviderInput('all')
    setSearchInput('')
    setStoreInput('')
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setAppliedProvider('all')
    setAppliedSearch('')
    setAppliedStore('')
    setAppliedStartDate(range.startDate)
    setAppliedEndDate(range.endDate)
    setOrderBy('sc_wagered')
    setOrderDirection('DESC')
    setPage(1)
    setApplyKey((k) => k + 1)
  }

  function handleSort(nextKey) {
    if (orderBy === nextKey) {
      setOrderDirection((d) => (d === 'ASC' ? 'DESC' : 'ASC'))
    } else {
      setOrderBy(nextKey)
      setOrderDirection(nextKey === 'game_name' || nextKey === 'provider' || nextKey === 'game_id' || nextKey === 'currency' ? 'ASC' : 'DESC')
    }
    setPage(1)
  }

  function handleTab(nextTab) {
    if (nextTab === tab) return
    setTab(nextTab)
    setPage(1)
    if (nextTab === 'provider' && (orderBy === 'game_id' || orderBy === 'game_name')) {
      setOrderBy('provider')
      setOrderDirection('ASC')
    }
    if (nextTab === 'game' && orderBy === 'provider') {
      setOrderBy('sc_wagered')
      setOrderDirection('DESC')
    }
  }

  return (
    <div className="ccw-page dep-page stx-page br-page gr-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Casino games report</h1>
        <p className="ccw-subtitle">
          See how much players bet and won on each slots game, and how much the house kept.
        </p>
      </header>

      <div className="stx-help-box gr-help-box" role="note">
        <strong>How we count the numbers</strong>
        <p className="gr-help-lead">
          Think of one piggy bank for each game and currency. Players put coins in when they bet. They take coins out when they win. What is left is the house result. 1GameHub Gold Coin play is counted separately as <b>GC</b> so it is never mixed with Sweep Coins.
        </p>
        <div className="gr-formula">
          <div className="gr-formula-row">
            <span className="gr-formula-label">Wagered</span>
            <span className="gr-formula-eq">=</span>
            <span className="gr-formula-text">all coins players <b>bet</b> in that currency (SC or GC)</span>
          </div>
          <div className="gr-formula-row">
            <span className="gr-formula-label">Won</span>
            <span className="gr-formula-eq">=</span>
            <span className="gr-formula-text">all coins players <b>won back</b> in that currency</span>
          </div>
          <div className="gr-formula-row">
            <span className="gr-formula-label">GGR</span>
            <span className="gr-formula-eq">=</span>
            <span className="gr-formula-text"><b>Wagered − Won</b> for the same currency</span>
          </div>
          <div className="gr-formula-row">
            <span className="gr-formula-label">Payout</span>
            <span className="gr-formula-eq">=</span>
            <span className="gr-formula-text">(Won ÷ Wagered) × 100</span>
          </div>
        </div>
        <div className="gr-example">
          <strong>Easy example</strong>
          <p>
            Players bet <b>1,000 SC</b>. Players won <b>920 SC</b>.
          </p>
          <p className="gr-example-math">
            GGR = 1,000 − 920 = <b>80 SC</b> (house kept 80)
            <br />
            Payout = 920 ÷ 1,000 = <b>92%</b> (players got 92% back)
          </p>
          <p className="gr-example-hint">
            Green GGR = house is ahead. Red GGR = players won more than they bet. GC rows use the same math in Gold Coins.
          </p>
        </div>
      </div>

      <div className="ccw-toolbar dep-filters stx-filters">
        {isMaster && (
          <div className="stx-filter-field">
            <label className="ccw-filter-label" htmlFor="gr-store">Store</label>
            <select
              id="gr-store"
              className="dep-filter-input"
              value={storeInput}
              disabled={filtersLoading}
              onChange={(e) => setStoreInput(e.target.value)}
              aria-label="Store filter"
            >
              <option value="">All stores</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
        )}

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="gr-provider">Provider</label>
          <select
            id="gr-provider"
            className="dep-filter-input"
            value={providerInput}
            onChange={(e) => setProviderInput(e.target.value)}
            aria-label="Provider filter"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="stx-filter-field">
          <label className="ccw-filter-label" htmlFor="gr-search">Game</label>
          <input
            id="gr-search"
            type="search"
            className="dep-filter-input"
            placeholder="Name or ID"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyFilters() }}
            aria-label="Game name search"
          />
        </div>

        <div className="stx-filter-field stx-date-field">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onPresetClick={handlePreset}
            label="Date range"
            embedded
          />
        </div>

        <div className="stx-filter-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={applyFilters}>
            Apply filters
          </button>
          <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={clearFilters}>
            Clear
          </button>
        </div>
      </div>

      <div className="gr-tabs" role="tablist" aria-label="Casino games report view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'game'}
          className={`gr-tab${tab === 'game' ? ' is-active' : ''}`}
          onClick={() => handleTab('game')}
        >
          Game
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'provider'}
          className={`gr-tab${tab === 'provider' ? ' is-active' : ''}`}
          onClick={() => handleTab('provider')}
        >
          Provider
        </button>
      </div>

      {loading ? (
        <p className="ccw-loading">Loading casino games report…</p>
      ) : (
        <>
          <div className="ccw-table-wrap dep-table-wrap">
            <table className="ccw-table stx-table gr-table">
              <thead>
                <tr>
                  {!isProviderTab && (
                    <SortHeader id="game_id" label="ID" orderBy={orderBy} orderDirection={orderDirection} onSort={handleSort} />
                  )}
                  <SortHeader
                    id={isProviderTab ? 'provider' : 'game_name'}
                    label={isProviderTab ? 'Provider' : 'Name'}
                    orderBy={orderBy}
                    orderDirection={orderDirection}
                    onSort={handleSort}
                  />
                  {!isProviderTab && (
                    <SortHeader id="provider" label="Provider" orderBy={orderBy} orderDirection={orderDirection} onSort={handleSort} />
                  )}
                  <SortHeader id="currency" label="Currency" orderBy={orderBy} orderDirection={orderDirection} onSort={handleSort} />
                  <SortHeader id="sc_wagered" label="Wagered" orderBy={orderBy} orderDirection={orderDirection} onSort={handleSort} align="right" />
                  <SortHeader id="sc_won" label="Won" orderBy={orderBy} orderDirection={orderDirection} onSort={handleSort} align="right" />
                  <SortHeader id="ggr" label="GGR" orderBy={orderBy} orderDirection={orderDirection} onSort={handleSort} align="right" />
                  <SortHeader id="payout" label="Payout" orderBy={orderBy} orderDirection={orderDirection} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="ccw-empty">
                      No slot play found for these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={`${row.provider || 'gsp'}-${row.currency || 'SC'}-${row.gameId || row.gameName}`}>
                      {!isProviderTab && (
                        <td className="gr-td-text gr-id">{row.gameId || <span className="ccw-dash">—</span>}</td>
                      )}
                      <td className="gr-td-text gr-name">{isProviderTab ? (row.providerLabel || row.gameName) : row.gameName}</td>
                      {!isProviderTab && (
                        <td className="gr-td-text">{row.providerLabel || <span className="ccw-dash">—</span>}</td>
                      )}
                      <td className="gr-td-text">
                        <span className={`gr-currency ${row.currency === 'GC' ? 'gr-currency--gc' : 'gr-currency--sc'}`}>
                          {row.currency === 'GC' ? 'GC' : 'SC'}
                        </span>
                      </td>
                      <td className="gr-td-num">{formatAmount(row.scWagered)}</td>
                      <td className="gr-td-num">{formatAmount(row.scWon)}</td>
                      <td className={`gr-td-num ${Number(row.ggr) >= 0 ? 'gr-ggr-pos' : 'gr-ggr-neg'}`}>
                        {formatAmount(row.ggr)}
                      </td>
                      <td className="gr-td-num">{formatPayout(row.payout)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 && summary && (
                <tfoot>
                  <tr className="gr-totals-row">
                    <td colSpan={isProviderTab ? 2 : 4} className="gr-td-text gr-name">
                      SC totals ({summary.gameCount || total} {isProviderTab ? 'rows' : 'games'})
                    </td>
                    <td className="gr-td-num">{formatAmount(summary.scWagered)}</td>
                    <td className="gr-td-num">{formatAmount(summary.scWon)}</td>
                    <td className={`gr-td-num ${Number(summary.ggr) >= 0 ? 'gr-ggr-pos' : 'gr-ggr-neg'}`}>
                      {formatAmount(summary.ggr)}
                    </td>
                    <td className="gr-td-num">{formatPayout(summary.payout)}</td>
                  </tr>
                  {hasGcTotals ? (
                    <tr className="gr-totals-row gr-totals-row--gc">
                      <td colSpan={isProviderTab ? 2 : 4} className="gr-td-text gr-name">
                        GC totals
                      </td>
                      <td className="gr-td-num">{formatAmount(summary.gcWagered)}</td>
                      <td className="gr-td-num">{formatAmount(summary.gcWon)}</td>
                      <td className={`gr-td-num ${Number(summary.gcGgr) >= 0 ? 'gr-ggr-pos' : 'gr-ggr-neg'}`}>
                        {formatAmount(summary.gcGgr)}
                      </td>
                      <td className="gr-td-num">{formatPayout(summary.gcPayout)}</td>
                    </tr>
                  ) : null}
                </tfoot>
              )}
            </table>
          </div>

          <div className="dep-pager">
            <div className="dep-page-size-group">
              <label className="dep-page-size-label" htmlFor="gr-page-size">
                Entries
              </label>
              <select
                id="gr-page-size"
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
                  <option key={opt} value={opt}>{opt}</option>
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
                onClick={() => setPage((p) => p + 1)}
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
        </>
      )}
    </div>
  )
}
