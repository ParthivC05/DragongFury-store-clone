import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { getPaymentReportSummary, getPaymentReportFilterOptions } from '../api/admin'
import { useToast } from '../context/ToastContext'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import {
  getPresetRange,
  formatDateRangeLabel,
  PRESETS,
  getAdminTimeZone,
  getTodayDateStr,
  getCurrentTimeStr,
  getDefaultEndTimeForDate,
  compareDateTime,
  clampTimeStr
} from '../utils/dateRange'
import './PaymentReport.css'

const defaultRange = getPresetRange(PRESETS.TODAY)
const defaultStartTime = '00:00'
const defaultEndTime = getDefaultEndTimeForDate(defaultRange.endDate)

function calcRate(part, total) {
  if (!total) return 0
  return Math.round((part / total) * 1000) / 10
}

function formatMoney(amount, loading = false) {
  if (loading) return '…'
  if (amount == null || !Number.isFinite(Number(amount))) return '0.00'
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function getRates(row) {
  const worked = row?.success || 0
  const failed = row?.failed || 0
  const rejected = row?.rejected || 0
  const waiting = (row?.pending || 0) + (row?.expired || 0)
  const finished = row?.settledTotal ?? (worked + failed + rejected)
  return {
    worked,
    failed,
    rejected,
    waiting,
    total: row?.total || 0,
    finished,
    money: row?.successAmount || 0,
    workedPct: row?.settledSuccessRate ?? calcRate(worked, finished),
    failedPct: row?.settledFailureRate ?? calcRate(failed, finished),
    rejectedPct: row?.settledRejectedRate ?? calcRate(rejected, finished)
  }
}

/** Green / red / amber bar: worked vs failed vs rejected. */
function ScoreBar({ worked, failed, rejected }) {
  const total = worked + failed + rejected
  if (!total) {
    return (
      <div className="pr-scorebar empty" aria-hidden="true">
        <span className="pr-scorebar-empty">No finished payments yet</span>
      </div>
    )
  }
  const workedPct = (worked / total) * 100
  const failedPct = (failed / total) * 100
  const rejectedPct = (rejected / total) * 100
  return (
    <div
      className="pr-scorebar"
      role="img"
      aria-label={`${worked} worked, ${failed} failed, ${rejected} rejected`}
    >
      <span className="pr-scorebar-ok" style={{ width: `${workedPct}%` }} />
      <span className="pr-scorebar-bad" style={{ width: `${failedPct}%` }} />
      <span className="pr-scorebar-rej" style={{ width: `${rejectedPct}%` }} />
    </div>
  )
}

function formatBarText(r) {
  if (!r.finished) return 'Still waiting'
  const parts = [`${r.workedPct}% worked`]
  if (r.failed > 0 || r.failedPct > 0) parts.push(`${r.failedPct}% failed`)
  if (r.rejected > 0 || r.rejectedPct > 0) parts.push(`${r.rejectedPct}% rejected`)
  return parts.join(' · ')
}

function plainSummary(r) {
  if (!r.finished && !r.waiting) return 'No payments yet.'
  if (!r.finished) return `${r.waiting} payment${r.waiting === 1 ? '' : 's'} still waiting.`
  const money = formatMoney(r.money)
  const parts = []
  if (r.worked > 0) parts.push(`${r.worked} worked`)
  if (r.failed > 0) parts.push(`${r.failed} failed`)
  if (r.rejected > 0) parts.push(`${r.rejected} rejected`)
  if (parts.length === 0) return `No finished payments. Money got: ${money}`
  if (parts.length === 1 && r.worked === r.finished) {
    return `All ${r.worked} finished payments worked. Money got: ${money}`
  }
  return `${parts.join(', ')}. Money got: ${money}`
}

function formatSc(amount, loading = false) {
  if (loading) return '…'
  if (amount == null || !Number.isFinite(Number(amount))) return '0.00'
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatUsers(count, loading = false) {
  if (loading) return '…'
  const n = Number(count) || 0
  return n.toLocaleString('en-US')
}

function GameFlowRow({ row, nested, loading }) {
  const deposited = Number(row?.depositedSc) || 0
  const withdrawn = Number(row?.withdrawnSc) || 0
  return (
    <tr className={nested ? 'pr-game-nested' : undefined}>
      <td className="pr-method-name">{nested ? row.label : <b>{row.label}</b>}</td>
      <td className="num">{formatUsers(row.depositUsers, loading)}</td>
      <td className="num money">{formatSc(deposited, loading)}</td>
      <td className="num">{formatUsers(row.withdrawUsers, loading)}</td>
      <td className="num money">{formatSc(withdrawn, loading)}</td>
    </tr>
  )
}

function ProviderBlock({ provider, loading }) {
  const r = getRates(provider)
  const methods = Array.isArray(provider.methods) ? provider.methods : []
  const name =
    provider.label ||
    (provider.provider === 'dollarpay'
      ? 'Dpay'
      : provider.provider === 'xxpay'
        ? 'Xpay'
        : provider.provider)

  return (
    <section className="pr-provider">
      <div className="pr-provider-top">
        <div className="pr-provider-heading">
          <h3 className="pr-provider-name">{name}</h3>
          <p className="pr-provider-plain">{loading ? 'Loading updated totals…' : plainSummary(r)}</p>
        </div>
        <div className="pr-provider-numbers">
          <div className="pr-pill ok">
            <span className="pr-pill-num">{loading ? '…' : (r.finished ? `${r.workedPct}%` : '—')}</span>
            <span className="pr-pill-label">worked</span>
          </div>
          <div className="pr-pill bad">
            <span className="pr-pill-num">{loading ? '…' : (r.finished ? `${r.failedPct}%` : '—')}</span>
            <span className="pr-pill-label">failed</span>
          </div>
          <div className="pr-pill rej">
            <span className="pr-pill-num">{loading ? '…' : (r.finished ? `${r.rejectedPct}%` : '—')}</span>
            <span className="pr-pill-label">rejected</span>
          </div>
        </div>
      </div>

      <ScoreBar worked={loading ? 0 : r.worked} failed={loading ? 0 : r.failed} rejected={loading ? 0 : r.rejected} />

      <div className="pr-provider-meta">
        <span><b className="ok">{loading ? '…' : r.worked}</b> worked</span>
        <span><b className="bad">{loading ? '…' : r.failed}</b> failed</span>
        <span><b className="rej">{loading ? '…' : r.rejected}</b> rejected</span>
        {(r.waiting > 0 || loading) && <span><b>{loading ? '…' : r.waiting}</b> waiting</span>}
        <span>Money got: <b>{formatMoney(r.money, loading)}</b></span>
      </div>

      {methods.length > 0 && (
        <div className="pr-methods">
          <h4 className="pr-methods-title">Ways to pay with {name}</h4>
          <table className="pr-methods-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>How it did</th>
                <th className="num">Worked</th>
                <th className="num">Failed</th>
                <th className="num">Rejected</th>
                <th className="num">Money got</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => {
                const mr = getRates(m)
                return (
                  <tr key={`${provider.provider}-${m.method}`}>
                    <td className="pr-method-name">{m.label || m.method}</td>
                    <td className="pr-method-bar-cell">
                      <ScoreBar
                        worked={loading ? 0 : mr.worked}
                        failed={loading ? 0 : mr.failed}
                        rejected={loading ? 0 : mr.rejected}
                      />
                      <span className="pr-method-bar-text">{loading ? 'Loading…' : formatBarText(mr)}</span>
                    </td>
                    <td className="num ok">{loading ? '…' : mr.worked}</td>
                    <td className="num bad">{loading ? '…' : mr.failed}</td>
                    <td className="num rej">{loading ? '…' : mr.rejected}</td>
                    <td className="num money">{formatMoney(mr.money, loading)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function PaymentReport() {
  const toast = useToast()
  const adminTimeZone = getAdminTimeZone()
  const todayStr = getTodayDateStr()
  const currentTimeStr = getCurrentTimeStr()
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [startTime, setStartTime] = useState(defaultStartTime)
  const [endTime, setEndTime] = useState(defaultEndTime)
  const [appliedStartDate, setAppliedStartDate] = useState(defaultRange.startDate)
  const [appliedEndDate, setAppliedEndDate] = useState(defaultRange.endDate)
  const [appliedStartTime, setAppliedStartTime] = useState(defaultStartTime)
  const [appliedEndTime, setAppliedEndTime] = useState(defaultEndTime)
  const [storeFilter, setStoreFilter] = useState('all')
  const [storeOptions, setStoreOptions] = useState([])
  const [summary, setSummary] = useState(null)
  const [byProvider, setByProvider] = useState([])
  const [gameFlow, setGameFlow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const sameDay = Boolean(startDate && endDate && startDate === endDate)
  const rangeInvalid = Boolean(
    startDate
    && endDate
    && compareDateTime(startDate, startTime, endDate, endTime) > 0
  )
  const endTimeMin = sameDay ? startTime : '00:00'
  const endTimeMax = endDate === todayStr ? currentTimeStr : '23:59'
  const startTimeMax = sameDay
    ? clampTimeStr(endTime, undefined, endDate === todayStr ? currentTimeStr : '23:59')
    : (startDate === todayStr ? currentTimeStr : '23:59')

  const applyRange = useCallback((nextStart, nextEnd, nextStartTime, nextEndTime) => {
    setLoading(true)
    setAppliedStartDate(nextStart)
    setAppliedEndDate(nextEnd)
    setAppliedStartTime(nextStartTime || defaultStartTime)
    setAppliedEndTime(nextEndTime || getDefaultEndTimeForDate(nextEnd))
    setRefreshKey((n) => n + 1)
  }, [])

  const clampEndTimeForDates = (nextStart, nextEnd, currentStartTime, currentEndTime) => {
    const maxEnd = nextEnd === todayStr ? currentTimeStr : '23:59'
    const isSameDay = nextStart && nextEnd && nextStart === nextEnd
    let nextEndTime = clampTimeStr(
      currentEndTime,
      isSameDay ? currentStartTime : '00:00',
      maxEnd
    )
    if (isSameDay && compareDateTime(nextStart, currentStartTime, nextEnd, nextEndTime) > 0) {
      nextEndTime = currentStartTime
    }
    return nextEndTime
  }

  const handleStartDateChange = (next) => {
    setStartDate(next)
    let nextEnd = endDate
    if (endDate && next && endDate < next) {
      nextEnd = next
      setEndDate(next)
    }
    const nextEndTime = clampEndTimeForDates(next, nextEnd, startTime, endTime)
    if (nextEndTime !== endTime) setEndTime(nextEndTime)
    applyRange(next, nextEnd, startTime, nextEndTime)
  }

  const handleEndDateChange = (next) => {
    setEndDate(next)
    let nextStart = startDate
    if (startDate && next && next < startDate) {
      nextStart = next
      setStartDate(next)
    }
    const nextEndTime = clampEndTimeForDates(nextStart, next, startTime, endTime)
    if (nextEndTime !== endTime) setEndTime(nextEndTime)
    applyRange(nextStart, next, startTime, nextEndTime)
  }

  const handlePresetClick = (range) => {
    const resetEndTime = getDefaultEndTimeForDate(range.endDate)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setStartTime(defaultStartTime)
    setEndTime(resetEndTime)
    applyRange(range.startDate, range.endDate, defaultStartTime, resetEndTime)
  }

  const handleApplyTimes = () => {
    if (rangeInvalid) {
      toast.error('End date/time must be on or after start date/time')
      return
    }
    applyRange(startDate, endDate, startTime || defaultStartTime, endTime || getDefaultEndTimeForDate(endDate))
  }

  useEffect(() => {
    getPaymentReportFilterOptions()
      .then((data) => {
        setStoreOptions(Array.isArray(data?.storeCodes) ? data.storeCodes : [])
      })
      .catch(() => setStoreOptions([]))
  }, [])

  const fetchReport = useCallback(() => {
    if (
      appliedStartDate
      && appliedEndDate
      && compareDateTime(appliedStartDate, appliedStartTime, appliedEndDate, appliedEndTime) > 0
    ) {
      return
    }
    setLoading(true)
    const params = {
      startDate: appliedStartDate,
      endDate: appliedEndDate,
      startTime: appliedStartTime || defaultStartTime,
      endTime: appliedEndTime || getDefaultEndTimeForDate(appliedEndDate)
    }
    if (storeFilter && storeFilter !== 'all') params.storeCode = storeFilter
    getPaymentReportSummary(params)
      .then((data) => {
        setSummary(data?.summary || null)
        setByProvider(Array.isArray(data?.byProvider) ? data.byProvider : [])
        setGameFlow(data?.gameFlow || null)
      })
      .catch((err) => {
        toast.error(err?.message || 'Failed to load payment report')
        setSummary(null)
        setByProvider([])
        setGameFlow(null)
      })
      .finally(() => setLoading(false))
  }, [
    appliedStartDate,
    appliedEndDate,
    appliedStartTime,
    appliedEndTime,
    storeFilter,
    refreshKey,
    toast
  ])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const overall = useMemo(() => getRates(summary), [summary])
  const purchaseBreakdown = useMemo(() => {
    const amountWeGot = Number(overall.money) || 0
    const totalSc = Number(gameFlow?.purchase?.scGiven) || 0
    return {
      amountWeGot,
      packageBonus: Math.round((totalSc - amountWeGot) * 100) / 100,
      totalSc,
      uniqueUsers: gameFlow?.purchase?.uniqueUsers || 0
    }
  }, [overall.money, gameFlow])
  const rangeLabel = [
    formatDateRangeLabel(appliedStartDate, appliedEndDate),
    `${appliedStartTime || defaultStartTime}–${appliedEndTime || defaultEndTime}`
  ].filter(Boolean).join(' · ')

  return (
    <div className="pr-page">
      <header className="pr-header">
        <h1 className="pr-title">Payment report</h1>
        <p className="pr-subtitle">
          See which payment companies worked well, which ways to pay worked best,
          and where SC went after purchase (1GameHub, Bona, GitSlotPark, Scorpio Play, and platform games).
          Money got uses the same deposit amounts as Payment totals.
        </p>
      </header>

      <div className="pr-filters">
        <section className="pr-filter-section">
          <h2 className="pr-filter-section-title">Date range</h2>
          <DateRangeFilter
            embedded
            label=""
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
            onPresetClick={handlePresetClick}
          />
        </section>

        <section className="pr-filter-section">
          <h2 className="pr-filter-section-title">Time and store</h2>
          <div className="pr-filter-row">
            <label className="pr-filter-field" htmlFor="pr-start-time">
              <span className="pr-filter-field-label">Start time</span>
              <input
                id="pr-start-time"
                type="time"
                className="pr-filter-input"
                value={startTime}
                onChange={(e) => {
                  const next = clampTimeStr(
                    e.target.value,
                    '00:00',
                    sameDay ? startTimeMax : (startDate === todayStr ? currentTimeStr : '23:59')
                  )
                  setStartTime(next)
                  if (sameDay && compareDateTime(startDate, next, endDate, endTime) > 0) {
                    setEndTime(next)
                  }
                }}
                max={sameDay ? startTimeMax : (startDate === todayStr ? currentTimeStr : undefined)}
              />
            </label>
            <label className="pr-filter-field" htmlFor="pr-end-time">
              <span className="pr-filter-field-label">End time</span>
              <input
                id="pr-end-time"
                type="time"
                className="pr-filter-input"
                value={endTime}
                onChange={(e) => {
                  setEndTime(clampTimeStr(e.target.value, endTimeMin, endTimeMax))
                }}
                onBlur={(e) => {
                  setEndTime(clampTimeStr(e.target.value, endTimeMin, endTimeMax))
                }}
                min={endTimeMin}
                max={endTimeMax}
                aria-invalid={sameDay && endTime < startTime}
              />
            </label>
            <label className="pr-filter-field" htmlFor="pr-store-filter">
              <span className="pr-filter-field-label">Store</span>
              <select
                id="pr-store-filter"
                className="pr-filter-input pr-store-select"
                value={storeFilter}
                onChange={(e) => {
                  setLoading(true)
                  setStoreFilter(e.target.value)
                }}
                aria-label="Filter by store"
              >
                <option value="all">All stores</option>
                {storeOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary pr-filter-apply"
              disabled={rangeInvalid || loading}
              onClick={handleApplyTimes}
              aria-busy={loading}
            >
              {loading ? 'Loading…' : 'Apply filter'}
            </button>
          </div>
        </section>

        {rangeInvalid && (
          <p className="pr-time-error" role="alert">
            {sameDay
              ? 'End time cannot be before start time'
              : 'End date/time must be on or after start date/time'}
          </p>
        )}
        <p className="pr-tz-note">
          Dates and times use your local timezone{adminTimeZone && adminTimeZone !== 'local' ? ` (${adminTimeZone})` : ''}.
          {' '}Quick ranges and From/To apply immediately. After changing start or end time, click Apply filter.
        </p>
      </div>
      <p className="pr-range-label">{rangeLabel}</p>

      {loading && !summary ? (
        <p className="pr-empty">Loading…</p>
      ) : (
        <>
          <section className="pr-story" aria-label="Overall result" aria-busy={loading}>
            <div className="pr-story-left">
              <p className="pr-story-kicker">Overall</p>
              <p className="pr-story-text">
                {loading && 'Loading updated totals…'}
                {!loading && overall.finished === 0 && overall.waiting === 0 && 'No payments in this period.'}
                {!loading && overall.finished === 0 && overall.waiting > 0 && (
                  <>
                    <b>{overall.waiting}</b> payment{overall.waiting === 1 ? '' : 's'} still waiting.
                    None finished yet.
                  </>
                )}
                {!loading && overall.finished > 0 && (
                  <>
                    Out of <b>{overall.finished}</b> finished payments,{' '}
                    <b className="ok">{overall.worked} worked</b>
                    {overall.failed > 0 && (
                      <>, <b className="bad">{overall.failed} failed</b></>
                    )}
                    {overall.rejected > 0 && (
                      <>, <b className="rej">{overall.rejected} rejected</b></>
                    )}
                    {overall.failed === 0 && overall.rejected === 0 && <> and none failed or rejected</>}
                    .
                    {overall.waiting > 0 && (
                      <> Also <b>{overall.waiting}</b> still waiting.</>
                    )}
                  </>
                )}
              </p>
              <p className="pr-story-money">
                Money we got: <strong>{formatMoney(overall.money, loading)}</strong>
              </p>
            </div>
            <div className="pr-story-right">
              <ScoreBar
                worked={loading ? 0 : overall.worked}
                failed={loading ? 0 : overall.failed}
                rejected={loading ? 0 : overall.rejected}
              />
              <div className="pr-story-legend">
                <span className="ok-dot">Worked {loading ? '…' : (overall.finished ? `${overall.workedPct}%` : '—')}</span>
                <span className="bad-dot">Failed {loading ? '…' : (overall.finished ? `${overall.failedPct}%` : '—')}</span>
                <span className="rej-dot">Rejected {loading ? '…' : (overall.finished ? `${overall.rejectedPct}%` : '—')}</span>
              </div>
            </div>
          </section>

          <section className="pr-list-section">
            <h2 className="pr-list-title">1. Payment providers</h2>
            <p className="pr-list-help">
              Green = worked. Red = failed (payment error). Amber = rejected (admin/manual reject).
            </p>

            {byProvider.length === 0 ? (
              <p className="pr-empty">No payment providers in this period.</p>
            ) : (
              <div className="pr-provider-list">
                {byProvider.map((p) => (
                  <ProviderBlock key={p.provider} provider={p} loading={loading} />
                ))}
              </div>
            )}
          </section>

          <section className="pr-list-section" aria-label="Purchase and game flow">
            <h2 className="pr-list-title">2. Purchases and game SC</h2>
            <p className="pr-list-help">
              Amount we got is the same cash total as above. Package bonus is extra SC on packages.
              Total SC = amount we got + package bonus. Game deposit is SC sent into play
              (bets for slots, top-ups for platform games). Withdraw / win is SC that came back.
            </p>

            <div className="pr-purchase-formula" aria-label="Purchase breakdown">
              <div className="pr-flow-card">
                <span className="pr-flow-card-label">Amount we got</span>
                <strong className="pr-flow-card-value">{formatMoney(purchaseBreakdown.amountWeGot, loading)}</strong>
                <span className="pr-flow-card-hint">{formatUsers(purchaseBreakdown.uniqueUsers, loading)} users</span>
              </div>
              <span className="pr-purchase-op" aria-hidden="true">+</span>
              <div className="pr-flow-card">
                <span className="pr-flow-card-label">Package bonus</span>
                <strong className="pr-flow-card-value">{formatSc(purchaseBreakdown.packageBonus, loading)}</strong>
                <span className="pr-flow-card-hint">Extra SC on packages</span>
              </div>
              <span className="pr-purchase-op" aria-hidden="true">=</span>
              <div className="pr-flow-card pr-flow-card-total">
                <span className="pr-flow-card-label">Total SC</span>
                <strong className="pr-flow-card-value">{formatSc(purchaseBreakdown.totalSc, loading)}</strong>
                <span className="pr-flow-card-hint">Amount we got + package bonus</span>
              </div>
            </div>

            <div className="pr-flow-cards">
              <div className="pr-flow-card">
                <span className="pr-flow-card-label">Deposited to games</span>
                <strong className="pr-flow-card-value">{formatSc(gameFlow?.totals?.depositedSc, loading)}</strong>
                <span className="pr-flow-card-hint">{formatUsers(gameFlow?.totals?.depositUsers, loading)} users</span>
              </div>
              <div className="pr-flow-card">
                <span className="pr-flow-card-label">Withdrawn / won</span>
                <strong className="pr-flow-card-value">{formatSc(gameFlow?.totals?.withdrawnSc, loading)}</strong>
                <span className="pr-flow-card-hint">{formatUsers(gameFlow?.totals?.withdrawUsers, loading)} users</span>
              </div>
            </div>

            <div className="pr-methods pr-game-flow">
              <h4 className="pr-methods-title">By game family</h4>
              <table className="pr-methods-table">
                <thead>
                  <tr>
                    <th>Game</th>
                    <th className="num">Users deposited</th>
                    <th className="num">SC deposited</th>
                    <th className="num">Users withdrew / won</th>
                    <th className="num">SC withdrawn / won</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(gameFlow?.groups) ? gameFlow.groups : []).map((group) => (
                    <Fragment key={group.key}>
                      <GameFlowRow row={group} loading={loading} />
                      {(group.games || []).map((game) => (
                        <GameFlowRow key={game.key} row={game} nested loading={loading} />
                      ))}
                    </Fragment>
                  ))}
                  <tr className="pr-game-total">
                    <td className="pr-method-name"><b>Total</b></td>
                    <td className="num">{formatUsers(gameFlow?.totals?.depositUsers, loading)}</td>
                    <td className="num money">{formatSc(gameFlow?.totals?.depositedSc, loading)}</td>
                    <td className="num">{formatUsers(gameFlow?.totals?.withdrawUsers, loading)}</td>
                    <td className="num money">{formatSc(gameFlow?.totals?.withdrawnSc, loading)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
