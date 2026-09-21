import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  getDailyScReportSummary,
  getDailyScReportEntries,
  getDailyScReportFilterOptions
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import { formatTransactionDateTime, getPresetRange, PRESETS } from '../utils/dateRange'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './BonusScUsageReport.css'
import './WalletScReconciliation.css'
import './DailyScReport.css'

const defaultRange = getPresetRange(PRESETS.TODAY)
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatSc(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '0.00'
  return Number(amount).toFixed(2)
}

function playerLabel(row) {
  return row.displayName || row.username || `Player #${row.userId}`
}

function ClickNum({ value, metric, onOpen, tone = 'neutral', date }) {
  return (
    <button
      type="button"
      className={`wsc-clicknum wsc-clicknum-${tone}`}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(metric, date)
      }}
      title="Click to see every transaction in this number"
    >
      <strong>{formatSc(value)}</strong>
    </button>
  )
}

function scTypeLabel(key) {
  if (key === 'bought') return 'Bought SC'
  if (key === 'bonus') return 'Bonus SC'
  return 'Win SC'
}

function scTypeHint(key) {
  if (key === 'bought') return 'SC players purchased with a deposit.'
  if (key === 'bonus') return 'Free / promo SC (package extra, welcome, daily, codes).'
  return 'SC won from games. This is the redeemable (cash-out) jar.'
}

function FlowLine({ label, value, metric, date, tone, onOpen }) {
  return (
    <div className="dsr-flow-row">
      <span>{label}</span>
      {metric ? (
        <ClickNum value={value} metric={metric} date={date} tone={tone} onOpen={onOpen} />
      ) : (
        <strong>{formatSc(value)}</strong>
      )}
    </div>
  )
}

function NestedKids({ children }) {
  if (!children?.length) return null
  return (
    <ul className="dsr-list dsr-list-nested">
      {children}
    </ul>
  )
}

export default function DailyScReport() {
  const toast = useToast()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [storeFilter, setStoreFilter] = useState('')
  const [storeOptions, setStoreOptions] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(null)
  const [tab, setTab] = useState('flow')

  const [drill, setDrill] = useState(null)
  const [drillRows, setDrillRows] = useState([])
  const [drillTotal, setDrillTotal] = useState(0)
  const [drillAmount, setDrillAmount] = useState(0)
  const [drillPage, setDrillPage] = useState(1)
  const [drillPageSize, setDrillPageSize] = useState(25)
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    if (isStoreAdmin) return
    getDailyScReportFilterOptions()
      .then((res) => setStoreOptions(Array.isArray(res?.storeCodes) ? res.storeCodes : []))
      .catch(() => setStoreOptions([]))
  }, [isStoreAdmin])

  const load = useCallback(() => {
    setLoading(true)
    const params = { startDate, endDate }
    if (storeFilter) params.storeCode = storeFilter
    getDailyScReportSummary(params)
      .then((res) => {
        setData(res || null)
        setSelectedDate((prev) => {
          const days = Array.isArray(res?.days) ? res.days : []
          if (prev && days.some((d) => d.date === prev)) return prev
          return days.length ? days[days.length - 1].date : null
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Could not load the Daily SC report')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [startDate, endDate, storeFilter, toast])

  useEffect(() => {
    load()
  }, [load])

  const openMetric = useCallback((metric, date) => {
    if (!metric || metric === 'from_yesterday' || metric === 'remaining') return
    setDrill({ metric, date: date || selectedDate || startDate })
    setDrillPage(1)
    setDrillRows([])
  }, [selectedDate, startDate])

  useEffect(() => {
    if (!drill) return undefined
    setDrillLoading(true)
    const params = {
      startDate: drill.date,
      endDate: drill.date,
      metric: drill.metric,
      page: drillPage,
      limit: drillPageSize
    }
    if (storeFilter) params.storeCode = storeFilter
    if (drill.productId) params.productId = drill.productId
    if (drill.providerId) params.providerId = drill.providerId
    if (drill.gameId) params.gameId = drill.gameId
    getDailyScReportEntries(params)
      .then((res) => {
        setDrillRows(Array.isArray(res?.rows) ? res.rows : [])
        setDrillTotal(Number(res?.total) || 0)
        setDrillAmount(Number(res?.totalAmount) || 0)
      })
      .catch((err) => {
        toast.error(err.message || 'Could not load those transactions')
        setDrillRows([])
        setDrillTotal(0)
        setDrillAmount(0)
      })
      .finally(() => setDrillLoading(false))
    return undefined
  }, [drill, drillPage, drillPageSize, storeFilter, toast])

  const days = Array.isArray(data?.days) ? data.days : []
  const totals = data?.totals || {}
  const checks = data?.checks || {}
  const todayStr = toLocalDateStr(new Date())
  const todayRow = days.find((d) => d.date === todayStr) || null
  const selected = days.find((d) => d.date === selectedDate) || null
  const drillDay = days.find((d) => d.date === drill?.date) || null
  const drillPages = Math.max(1, Math.ceil(drillTotal / drillPageSize) || 1)

  const exportCsv = () => {
    const header = [
      'Date',
      'From yesterday',
      'Deposits',
      'Bonuses',
      'Game wins',
      'Other in',
      'Total in',
      'Casino used',
      'Platform used',
      'Withdrawals',
      'Other out',
      'Total out',
      'Today remaining',
      'Total remaining'
    ]
    const rows = days.map((d) => [
      d.date,
      formatSc(d.fromYesterday),
      formatSc(d.deposits),
      formatSc(d.bonuses),
      formatSc(d.gameWins),
      formatSc(d.otherIn),
      formatSc(d.totalIn),
      formatSc(d.casinoUsed),
      formatSc(d.platformUsed),
      formatSc(d.withdrawals),
      formatSc(d.otherOut),
      formatSc(d.totalOut),
      formatSc(d.remaining),
      formatSc(d.totalRemaining ?? d.leftoverSitting)
    ])
    rows.push([
      'Totals',
      formatSc(totals.fromYesterday),
      formatSc(totals.deposits),
      formatSc(totals.bonuses),
      formatSc(totals.gameWins),
      formatSc(totals.otherIn),
      formatSc(totals.totalIn),
      formatSc(totals.casinoUsed),
      formatSc(totals.platformUsed),
      formatSc(totals.withdrawals),
      formatSc(totals.otherOut),
      formatSc(totals.totalOut),
      formatSc(totals.remaining),
      formatSc(totals.totalRemaining ?? totals.leftoverSitting)
    ])
    const escape = (v) => {
      const str = v == null ? '' : String(v)
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str
    }
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `daily-sc-report-${startDate}-to-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="ccw-page wsc-page dsr-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Daily SC report</h1>
        <p className="ccw-subtitle">
          Today’s remaining is only in minus out for that day. Total remaining also includes leftover from yesterday.
        </p>
      </header>

      <div className="dashboard-filter-bar bsu-filter-bar wsc-filter-bar">
        <DateRangeFilter
          embedded
          label="Dates"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        {!isStoreAdmin ? (
          <label className="dashboard-filter-field" htmlFor="dsr-store">
            <span className="dashboard-filter-field-label">Store</span>
            <select
              id="dsr-store"
              className="dashboard-filter-input bsu-store-select"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="">All stores</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="dashboard-filter-field">
          <span className="dashboard-filter-field-label">Export</span>
          <button type="button" className="wsc-chip" onClick={exportCsv} disabled={!days.length}>CSV</button>
        </div>
      </div>

      {checks.ok === false ? (
        <div className="wsc-alert" role="alert">
          <strong>These numbers do not add up</strong>
          {!checks.totalsMatch ? <span> Daily rows do not match the source transactions.</span> : null}
          {!checks.carryOk ? <span> A day’s remaining does not match the next day’s from yesterday.</span> : null}
          {!checks.formulaOk ? <span> A day’s remaining or total remaining does not add up.</span> : null}
        </div>
      ) : null}
      {checks.ok ? (
        <p className="dsr-ok">Every transaction in this date range is counted. Today’s remaining is in − out. Total remaining includes leftover from yesterday.</p>
      ) : null}

      {loading ? (
        <p className="ccw-loading">Counting SC…</p>
      ) : (
        <>
          {todayRow ? (
            <section className="dsr-today" aria-label="Today remaining">
              <div className="dsr-today-pair">
                <div className="dsr-today-main">
                  <span className="dsr-today-label">Today’s remaining</span>
                  <strong className="dsr-today-value">{formatSc(todayRow.remaining)}</strong>
                  <span className="dsr-today-hint">In today − out today. Does not include leftover from yesterday.</span>
                </div>
                <div className="dsr-today-main dsr-today-total">
                  <span className="dsr-today-label">Total remaining</span>
                  <strong className="dsr-today-value">{formatSc(todayRow.totalRemaining ?? todayRow.leftoverSitting)}</strong>
                  <span className="dsr-today-hint">From yesterday + in today − out today.</span>
                </div>
              </div>
              <div className="dsr-today-stats">
                <div>
                  <span>From yesterday</span>
                  <strong>{formatSc(todayRow.fromYesterday)}</strong>
                </div>
                <div>
                  <span>In today</span>
                  <ClickNum value={todayRow.totalIn} metric="total_in" date={todayRow.date} tone="in" onOpen={openMetric} />
                </div>
                <div>
                  <span>Out today</span>
                  <ClickNum value={todayRow.totalOut} metric="total_out" date={todayRow.date} tone="out" onOpen={openMetric} />
                </div>
              </div>
            </section>
          ) : (
            <p className="dsr-today-missing">Pick a date range that includes today to see today’s remaining.</p>
          )}

          {days.length > 1 ? (
            <label className="dashboard-filter-field dsr-day-pick" htmlFor="dsr-day">
              <span className="dashboard-filter-field-label">Day</span>
              <select
                id="dsr-day"
                className="dashboard-filter-input bsu-store-select"
                value={selectedDate || ''}
                onChange={(e) => { setSelectedDate(e.target.value); setTab('flow') }}
              >
                {days.map((day) => (
                  <option key={day.date} value={day.date}>{day.date}{day.date === todayStr ? ' (today)' : ''}</option>
                ))}
              </select>
            </label>
          ) : null}

          {selected ? (
            <section className="dsr-day">
              <div className="wsc-section-head dsr-day-head">
                <div>
                  <h2>{selected.date === todayStr ? `Today · ${selected.date}` : selected.date}</h2>
                  <p className="wsc-subtitle-block">
                    Today remaining {formatSc(selected.remaining)} (in − out)
                    {` · total remaining ${formatSc(selected.totalRemaining ?? selected.leftoverSitting)} (includes leftover ${formatSc(selected.fromYesterday)})`}
                  </p>
                </div>
                <div className="dsr-day-remain-pair">
                  <div className="dsr-day-remain">
                    <span>{selected.date === todayStr ? 'Today’s remaining' : 'Remaining this day'}</span>
                    <strong>{formatSc(selected.remaining)}</strong>
                  </div>
                  <div className="dsr-day-remain dsr-day-remain-total">
                    <span>Total remaining</span>
                    <strong>{formatSc(selected.totalRemaining ?? selected.leftoverSitting)}</strong>
                  </div>
                </div>
              </div>
              <div className="dsr-tabs">
                <button type="button" className={`wsc-chip ${tab !== 'types' ? 'is-on' : ''}`} onClick={() => setTab('flow')}>In / Out</button>
                <button type="button" className={`wsc-chip ${tab === 'types' ? 'is-on' : ''}`} onClick={() => setTab('types')}>SC types</button>
              </div>

              {tab !== 'types' ? (
                <div className="dsr-flow">
                  <div className="dsr-flow-col dsr-flow-in">
                    <h3>In</h3>
                    <ul className="dsr-list">
                      <li>
                        <FlowLine label="SC deposits" value={selected.deposits} metric="deposits" date={selected.date} tone="in" onOpen={openMetric} />
                      </li>
                      <li>
                        <FlowLine label="Bonuses" value={selected.bonuses} metric="bonuses" date={selected.date} tone="in" onOpen={openMetric} />
                        <NestedKids>
                          {(selected.bonusByType || []).map((row) => (
                            <li key={`bonus-${row.key}`}>
                              <FlowLine label={row.label} value={row.amount} metric={`bonus_type:${row.key}`} date={selected.date} tone="in" onOpen={openMetric} />
                            </li>
                          ))}
                        </NestedKids>
                      </li>
                      <li>
                        <FlowLine label="Casino won" value={selected.casinoWins} metric="casino_wins" date={selected.date} tone="in" onOpen={openMetric} />
                        <NestedKids>
                          {(selected.casinoByProvider || []).filter((row) => row.wins > 0.0001).map((row) => (
                            <li key={`win-${row.key}`}>
                              <FlowLine label={row.label} value={row.wins} metric={`casino_win_provider:${row.key}`} date={selected.date} tone="in" onOpen={openMetric} />
                            </li>
                          ))}
                        </NestedKids>
                      </li>
                      <li>
                        <FlowLine label="Platform redeemed" value={selected.platformWins} metric="platform_wins" date={selected.date} tone="in" onOpen={openMetric} />
                        <NestedKids>
                          {(selected.platformByGame || []).filter((row) => row.redeemed > 0.0001).map((row) => (
                            <li key={`redeem-${row.key}`}>
                              <FlowLine label={row.label} value={row.redeemed} metric={`platform_redeem:${row.productId || row.key}`} date={selected.date} tone="in" onOpen={openMetric} />
                            </li>
                          ))}
                        </NestedKids>
                      </li>
                      <li>
                        <FlowLine label="Other in (admin add, refunds)" value={selected.otherIn} metric="other_in" date={selected.date} tone="in" onOpen={openMetric} />
                      </li>
                    </ul>
                  </div>
                  <div className="dsr-flow-col dsr-flow-out">
                    <h3>Out</h3>
                    <ul className="dsr-list">
                      <li>
                        <FlowLine label="Casino bets" value={selected.casinoUsed} metric="casino_used" date={selected.date} tone="out" onOpen={openMetric} />
                        <NestedKids>
                          {(selected.casinoByProvider || []).filter((row) => row.bets > 0.0001).map((row) => (
                            <li key={`bet-${row.key}`}>
                              <FlowLine label={row.label} value={row.bets} metric={`casino_provider:${row.key}`} date={selected.date} tone="out" onOpen={openMetric} />
                            </li>
                          ))}
                        </NestedKids>
                      </li>
                      <li>
                        <FlowLine label="Platform top up" value={selected.platformUsed} metric="platform_used" date={selected.date} tone="out" onOpen={openMetric} />
                        <NestedKids>
                          {(selected.platformByGame || []).filter((row) => row.topUp > 0.0001).map((row) => (
                            <li key={`topup-${row.key}`}>
                              <FlowLine label={row.label} value={row.topUp} metric={`platform_game:${row.productId || row.key}`} date={selected.date} tone="out" onOpen={openMetric} />
                            </li>
                          ))}
                        </NestedKids>
                      </li>
                      <li>
                        <FlowLine label="SC withdrawals (RSC)" value={selected.withdrawals} metric="withdrawals" date={selected.date} tone="out" onOpen={openMetric} />
                      </li>
                      <li>
                        <FlowLine label="Other out (admin remove, expired, void)" value={selected.otherOut} metric="other_out" date={selected.date} tone="out" onOpen={openMetric} />
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="dsr-types">
                  {['bought', 'bonus', 'win'].map((key) => {
                    const block = selected.scTypes?.[key] || {}
                    const metricBase = key === 'bought' ? 'sc_bought' : key === 'bonus' ? 'sc_bonus' : 'sc_win'
                    return (
                      <div key={key} className={`dsr-type-card dsr-type-${key}`}>
                        <h3>{scTypeLabel(key)}</h3>
                        <p className="dsr-type-hint">{scTypeHint(key)}</p>
                        <p>From yesterday: <strong>{formatSc(block.fromYesterday)}</strong></p>
                        <p>In today: <ClickNum value={block.inToday} metric={`${metricBase}_in`} date={selected.date} tone="in" onOpen={openMetric} /></p>
                        <p>Out today: <ClickNum value={block.outToday} metric={`${metricBase}_out`} date={selected.date} tone="out" onOpen={openMetric} /></p>
                        <p>Today remaining (in − out): <strong>{formatSc(block.remaining)}</strong></p>
                        <p>Total remaining: <strong>{formatSc(block.totalRemaining ?? block.leftoverSitting)}</strong></p>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          ) : null}
        </>
      )}

      {drill && typeof document !== 'undefined' ? createPortal(
        <div className="dsr-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dsr-modal-title" onClick={() => setDrill(null)}>
          <div className="dsr-modal" onClick={(e) => e.stopPropagation()}>
            <header className="wsc-modal-head">
              <h2 id="dsr-modal-title">Transactions on {drill.date}</h2>
              <button type="button" className="wsc-chip" onClick={() => setDrill(null)}>Close</button>
            </header>
            {drillDay ? (
              <p className="dsr-modal-remain">
                {drill.date === todayStr ? 'Today’s remaining' : 'Remaining this day'}: <strong>{formatSc(drillDay.remaining)}</strong> SC
                {' · '}
                Total remaining: <strong>{formatSc(drillDay.totalRemaining ?? drillDay.leftoverSitting)}</strong> SC
              </p>
            ) : null}
            {drillLoading ? (
              <p className="ccw-loading">Loading…</p>
            ) : (
              <>
                <p className="wsc-modal-count">{drillTotal} moves · {formatSc(drillAmount)} SC</p>
                <div className="ccw-table-wrap dsr-modal-table">
                  <table className="ccw-table bsu-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Player</th>
                        <th>Store</th>
                        <th>SC type</th>
                        <th>In / out</th>
                        <th>Amount</th>
                        <th>Why</th>
                        <th>Game</th>
                        <th>Bonus type</th>
                        <th>Id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillRows.length === 0 ? (
                        <tr><td colSpan={10}>No transactions in this number for this day.</td></tr>
                      ) : drillRows.map((row) => (
                        <tr key={row.id}>
                          <td>{formatTransactionDateTime(row.createdAt)}</td>
                          <td>
                            <Link className="bsu-user-link" to={`/users/${row.userId}`}>{playerLabel(row)}</Link>
                          </td>
                          <td>{row.storeCode || '—'}</td>
                          <td>{row.walletType === 'BONUS' ? 'Bonus SC' : row.walletType === 'RSC' ? 'Win SC' : 'Bought SC'}</td>
                          <td>{row.direction === 'CREDIT' ? 'In' : 'Out'}</td>
                          <td>{formatSc(row.amount)}</td>
                          <td>{row.remarks || row.eventType}</td>
                          <td>{row.gameName || row.productId || row.providerId || '—'}</td>
                          <td>{row.bonusType || '—'}</td>
                          <td>{row.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="wsc-pager">
                  <button type="button" className="wsc-chip" disabled={drillPage <= 1} onClick={() => setDrillPage((p) => p - 1)}>Back</button>
                  <span>Page {drillPage} of {drillPages}</span>
                  <button type="button" className="wsc-chip" disabled={drillPage >= drillPages} onClick={() => setDrillPage((p) => p + 1)}>Next</button>
                  <select value={drillPageSize} onChange={(e) => { setDrillPageSize(Number(e.target.value)); setDrillPage(1) }}>
                    {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  )
}
