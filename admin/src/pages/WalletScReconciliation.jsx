import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getWalletScReconciliationSummary,
  getWalletScReconciliationEntries,
  getWalletScReconciliationFilterOptions
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import DateRangeFilter from '../components/DateRangeFilter'
import '../components/DateRangeFilter.css'
import { formatTransactionDateTime, formatDateRangeLabel, getPresetRange, PRESETS } from '../utils/dateRange'
import './ChimeCashappWithdrawals.css'
import './Deposits.css'
import './BonusScUsageReport.css'
import './WalletScReconciliation.css'

const defaultRange = getPresetRange(PRESETS.TODAY)
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function thisWeekRange() {
  const end = new Date()
  const start = new Date(end)
  const day = start.getDay()
  const mondayOffset = day === 0 ? 6 : day - 1
  start.setDate(start.getDate() - mondayOffset)
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) }
}

function thisMonthRange() {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), 1)
  return { startDate: toLocalDateStr(start), endDate: toLocalDateStr(end) }
}

function formatSc(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '0.00'
  return Number(amount).toFixed(2)
}

function playerLabel(row) {
  return row.displayName || row.username || `Player #${row.userId}`
}

function ClickNum({ value, metric, onOpen, tone = 'neutral', suffix = 'SC' }) {
  const n = formatSc(value)
  return (
    <button
      type="button"
      className={`wsc-clicknum wsc-clicknum-${tone}`}
      onClick={() => onOpen(metric)}
      title="Click to see every coin in this number"
    >
      <strong>{n}</strong> <span>{suffix}</span>
    </button>
  )
}

function SectionHead({ title, subtitle }) {
  return (
    <div className="wsc-section-head">
      <h2>{title}</h2>
      <p className="wsc-subtitle-block">{subtitle}</p>
    </div>
  )
}

function FormulaBar({ title, meaning, color, opening, added, used, extra, extraLabel, closing, difference }) {
  const ok = Math.abs(Number(difference) || 0) < 0.009
  return (
    <div className={`wsc-formula wsc-formula-${color}`}>
      <p className="wsc-formula-title">{title}</p>
      <p className="wsc-formula-meaning">{meaning}</p>
      <ol className="wsc-formula-steps">
        <li>Coins already sitting here before this date: <strong>{formatSc(opening)}</strong></li>
        <li>New coins that came in on this date: <strong>{formatSc(added)}</strong></li>
        <li>Coins that left this jar on this date: <strong>{formatSc(used)}</strong></li>
        {extraLabel ? <li>{extraLabel}: <strong>{formatSc(extra)}</strong></li> : null}
        <li>Coins still sitting here now: <strong>{formatSc(closing)}</strong></li>
      </ol>
      <p className={`wsc-formula-diff ${ok ? 'is-ok' : 'is-bad'}`}>
        {ok ? '✓ This jar’s numbers are correct.' : `✗ This jar’s numbers are wrong by ${formatSc(difference)}.`}
      </p>
    </div>
  )
}

function Row({ label, hint, children }) {
  return (
    <div className="wsc-row">
      <div className="wsc-row-text">
        <span className="wsc-row-label">{label}</span>
        {hint ? <span className="wsc-row-hint">{hint}</span> : null}
      </div>
      <div className="wsc-row-value">{children}</div>
    </div>
  )
}

export default function WalletScReconciliation() {
  const toast = useToast()
  const { user } = useAuth()
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [storeFilter, setStoreFilter] = useState('')
  const [playerQuery, setPlayerQuery] = useState('')
  const [appliedPlayer, setAppliedPlayer] = useState('')

  const [storeOptions, setStoreOptions] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const [drill, setDrill] = useState(null)
  const [drillRows, setDrillRows] = useState([])
  const [drillTotal, setDrillTotal] = useState(0)
  const [drillPage, setDrillPage] = useState(1)
  const [drillPageSize, setDrillPageSize] = useState(25)
  const [drillLoading, setDrillLoading] = useState(false)
  const [drilldown, setDrilldown] = useState(null)

  const week = useMemo(() => thisWeekRange(), [])
  const month = useMemo(() => thisMonthRange(), [])
  const isWeek = startDate === week.startDate && endDate === week.endDate
  const isMonth = startDate === month.startDate && endDate === month.endDate

  useEffect(() => {
    if (isStoreAdmin) return
    getWalletScReconciliationFilterOptions()
      .then((res) => setStoreOptions(Array.isArray(res?.storeCodes) ? res.storeCodes : []))
      .catch(() => setStoreOptions([]))
  }, [isStoreAdmin])

  const load = useCallback(() => {
    setLoading(true)
    const params = { startDate, endDate }
    if (storeFilter) params.storeCode = storeFilter
    if (appliedPlayer) {
      if (/^\d+$/.test(appliedPlayer)) params.userId = appliedPlayer
      else params.username = appliedPlayer
    }
    getWalletScReconciliationSummary(params)
      .then((res) => setData(res || null))
      .catch((err) => {
        toast.error(err.message || 'Could not load the SC coin story')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [startDate, endDate, storeFilter, appliedPlayer, toast])

  useEffect(() => {
    load()
  }, [load])

  const openMetric = useCallback((metric, extra = {}) => {
    setDrill({ metric, ...extra })
    setDrillPage(1)
    setDrillRows([])
    setDrilldown(null)
  }, [])

  useEffect(() => {
    if (!drill) return undefined
    setDrillLoading(true)
    const params = {
      startDate,
      endDate,
      metric: drill.metric,
      page: drillPage,
      limit: drillPageSize
    }
    if (storeFilter) params.storeCode = storeFilter
    if (appliedPlayer) {
      if (/^\d+$/.test(appliedPlayer)) params.userId = appliedPlayer
      else params.username = appliedPlayer
    }
    if (drill.productId) params.productId = drill.productId
    if (drill.providerId) params.providerId = drill.providerId
    if (drill.gameId) params.gameId = drill.gameId
    getWalletScReconciliationEntries(params)
      .then((res) => {
        setDrillRows(Array.isArray(res?.rows) ? res.rows : [])
        setDrillTotal(Number(res?.total) || 0)
        setDrilldown(Array.isArray(res?.drilldown) ? res.drilldown : null)
      })
      .catch((err) => {
        toast.error(err.message || 'Could not load those coins')
        setDrillRows([])
        setDrillTotal(0)
      })
      .finally(() => setDrillLoading(false))
    return undefined
  }, [drill, drillPage, drillPageSize, startDate, endDate, storeFilter, appliedPlayer, toast])

  const psc = data?.psc || {}
  const bonus = data?.bonus || {}
  const rsc = data?.rsc || {}
  const products = Array.isArray(data?.products) ? data.products : []
  const tally = data?.dailyTally || {}
  const drillPages = Math.max(1, Math.ceil(drillTotal / drillPageSize) || 1)

  return (
    <div className="ccw-page wsc-page">
      <header className="ccw-header">
        <h1 className="ccw-title">SC coin story</h1>
        <p className="ccw-subtitle">
          Players have 3 kinds of SC. This page adds them up for the dates you pick.
          Blue = bought with money. Purple = free gift. Gold = redeem coins won in games (RSC).
        </p>
      </header>

      <div className="wsc-legend" role="note">
        <span className="wsc-legend-item wsc-legend-blue"><strong>Bought coins (PSC)</strong> — the player paid real money, so we gave them these SC</span>
        <span className="wsc-legend-item wsc-legend-purple"><strong>Gift coins (BSC)</strong> — we gave these SC for free. Nobody paid money for them</span>
        <span className="wsc-legend-item wsc-legend-gold"><strong>Redeem coins (RSC)</strong> — these SC were won in a game. The player can cash them out</span>
      </div>

      <div className="dashboard-filter-bar bsu-filter-bar wsc-filter-bar">
        <div className="wsc-period">
          <span className="dashboard-filter-field-label">Quick dates</span>
          <div className="wsc-period-btns">
            <button type="button" className={`wsc-chip ${startDate === endDate && startDate === defaultRange.startDate ? 'is-on' : ''}`} onClick={() => { const r = getPresetRange(PRESETS.TODAY); setStartDate(r.startDate); setEndDate(r.endDate) }}>Day</button>
            <button type="button" className={`wsc-chip ${isWeek ? 'is-on' : ''}`} onClick={() => { setStartDate(week.startDate); setEndDate(week.endDate) }}>Week</button>
            <button type="button" className={`wsc-chip ${isMonth ? 'is-on' : ''}`} onClick={() => { setStartDate(month.startDate); setEndDate(month.endDate) }}>Month</button>
          </div>
          <p className="wsc-range-label">{formatDateRangeLabel(startDate, endDate)}</p>
        </div>
        <DateRangeFilter
          embedded
          label="Or pick your own dates"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        {!isStoreAdmin ? (
        <label className="dashboard-filter-field" htmlFor="wsc-store">
          <span className="dashboard-filter-field-label">Store</span>
          <select
            id="wsc-store"
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
        <form
          className="dashboard-filter-field wsc-player"
          onSubmit={(e) => { e.preventDefault(); setAppliedPlayer(playerQuery.trim()) }}
        >
          <span className="dashboard-filter-field-label">One player</span>
          <div className="wsc-player-row">
            <input
              className="dashboard-filter-input"
              placeholder="Name or user id"
              value={playerQuery}
              onChange={(e) => setPlayerQuery(e.target.value)}
              aria-label="Player username or id"
            />
            <button type="submit" className="wsc-chip">Show</button>
            {appliedPlayer ? (
              <button type="button" className="wsc-chip" onClick={() => { setPlayerQuery(''); setAppliedPlayer('') }}>Clear</button>
            ) : null}
          </div>
        </form>
      </div>

      {loading ? (
        <p className="ccw-loading">Counting coins…</p>
      ) : (
        <>
          <section className="wsc-tally">
            <SectionHead
              title="The 3 coin jars"
              subtitle="Read one box at a time. The last line is how many coins are still left in that jar."
            />
            <div className="wsc-tally-grid">
              <FormulaBar
                title="Bought coins (PSC)"
                meaning="This number is SC the player bought with money. It is not a gift and not a game win."
                color="blue"
                opening={tally.psc?.opening}
                added={tally.psc?.added}
                used={tally.psc?.used}
                closing={tally.psc?.closing}
                difference={tally.psc?.difference}
              />
              <FormulaBar
                title="Gift coins (BSC)"
                meaning="This number is free SC we gave (welcome, spin, extra in a package). The player did not pay for these. “We took back” here means the gift expired."
                color="purple"
                opening={tally.bonus?.opening}
                added={tally.bonus?.added}
                used={tally.bonus?.used}
                extra={tally.bonus?.voidedExpired}
                extraLabel="Free coins we removed (they expired or we cancelled the gift). Not a cash-out"
                closing={tally.bonus?.closing}
                difference={tally.bonus?.difference}
              />
              <FormulaBar
                title="Redeem coins (RSC)"
                meaning="This number is SC won from games. Same as redeem / cash-out coins. The player can take these out as money. Cancelling a request does not go in this box."
                color="gold"
                opening={tally.rsc?.opening}
                added={tally.rsc?.generated}
                used={tally.rsc?.withdrawn}
                extra={tally.rsc?.voided}
                extraLabel="RSC used in games, plus staff deduct, plus leftover we wiped or extra win we did not allow"
                closing={tally.rsc?.closing}
                difference={tally.rsc?.difference}
              />
            </div>
          </section>

          <section className="bsu-table-section wsc-games">
            <SectionHead
              title="What happened in each game"
              subtitle="Each row is one game. Left to right: bought coins sent in, gift coins sent in, redeem coins sent in (RSC used to play), then redeem coins the game sent back."
            />
            <div className="ccw-table-wrap">
              <table className="ccw-table bsu-table wsc-games-table">
                <thead>
                  <tr>
                    <th>
                      <span className="wsc-th-title">Game name</span>
                      <span className="wsc-th-help">The game this row is talking about</span>
                    </th>
                    <th>
                      <span className="wsc-th-title">Bought coins sent in</span>
                      <span className="wsc-th-help">PSC the player paid for, then used inside this game</span>
                    </th>
                    <th>
                      <span className="wsc-th-title">Gift coins sent in</span>
                      <span className="wsc-th-help">Free BSC we gave, then used inside this game</span>
                    </th>
                    <th>
                      <span className="wsc-th-title">Redeem coins sent in</span>
                      <span className="wsc-th-help">RSC the player used to play this game. Same coins as We took back #1</span>
                    </th>
                    <th>
                      <span className="wsc-th-title">Redeem coins won</span>
                      <span className="wsc-th-help">RSC this game gave back. These can be cashed out</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr><td colSpan={5}>No game coins in these dates.</td></tr>
                  ) : products.map((p) => (
                    <tr key={p.productId}>
                      <td>
                        <button
                          type="button"
                          className="wsc-linkish"
                          onClick={() => openMetric(`product_${String(p.productId).toLowerCase()}_psc`, { productId: p.productId })}
                        >
                          {p.label}
                        </button>
                      </td>
                      <td><ClickNum value={p.pscUsed} metric={`product_${String(p.productId).toLowerCase()}_psc`} onOpen={(m) => openMetric(m, { productId: p.productId })} tone="out" /></td>
                      <td><ClickNum value={p.bonusUsed} metric={`product_${String(p.productId).toLowerCase()}_bonus`} onOpen={(m) => openMetric(m, { productId: p.productId })} tone="out" /></td>
                      <td><ClickNum value={p.rscUsed} metric={`product_${String(p.productId).toLowerCase()}_rsc_used`} onOpen={(m) => openMetric(m, { productId: p.productId })} tone="out" /></td>
                      <td><ClickNum value={p.rscGenerated} metric={`product_${String(p.productId).toLowerCase()}_rsc`} onOpen={(m) => openMetric(m, { productId: p.productId })} tone="in" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="wsc-jar wsc-jar-psc">
            <SectionHead
              title="Bought coins (PSC) — line by line"
              subtitle="Only coins the player paid money for. Open this if you want to see where those paid coins came from and where they went."
            />
            <Row label="Already in the jar" hint="Bought coins left from before this date"><ClickNum value={psc.opening} metric="psc_credits" onOpen={openMetric} /></Row>
            <Row label="Players bought" hint="New SC they paid money for on this date"><ClickNum value={psc.purchased} metric="psc_purchased" onOpen={openMetric} tone="in" /></Row>
            <Row label="We added by hand" hint="Staff put extra bought coins in"><ClickNum value={psc.manualCredits} metric="psc_manual_credits" onOpen={openMetric} tone="in" /></Row>
            <Row label="Sent into games" hint="Bought coins used to play"><ClickNum value={psc.debits} metric="psc_debits" onOpen={openMetric} tone="out" /></Row>
            <Row label="Still left now" hint="Bought coins the player still has"><ClickNum value={psc.closing} metric="psc_credits" onOpen={openMetric} /></Row>
          </section>

          <section className="wsc-jar wsc-jar-bonus">
            <SectionHead
              title="Gift coins (BSC) — line by line"
              subtitle="Only free coins. The player did not pay money for any number in this box. “We took back” means the gift expired or we cancelled the free coins."
            />
            <Row label="Already in the jar" hint="Free coins left from before this date"><ClickNum value={bonus.opening} metric="bonus_credits" onOpen={openMetric} /></Row>
            <Row label="Extra in a package" hint="Free extra SC on top of the amount they paid"><ClickNum value={bonus.packageBonus} metric="bonus_package" onOpen={openMetric} tone="in" /></Row>
            <Row label="Welcome gift" hint="Free coins for a new player"><ClickNum value={bonus.welcome} metric="bonus_welcome" onOpen={openMetric} tone="in" /></Row>
            <Row label="Spin gift" hint="Free coins from the spin wheel"><ClickNum value={bonus.spin} metric="bonus_spin" onOpen={openMetric} tone="in" /></Row>
            <Row label="Friend gift" hint="Free coins for inviting a friend"><ClickNum value={bonus.referral} metric="bonus_referral" onOpen={openMetric} tone="in" /></Row>
            <Row label="Other free coins" hint="Daily gift, VIP, codes, and the rest"><ClickNum value={Number(bonus.coinback || 0) + Number(bonus.otherIssued || 0)} metric="bonus_other_issued" onOpen={openMetric} tone="in" /></Row>
            <Row label="Sent into games" hint="Free coins used to play"><ClickNum value={bonus.used} metric="bonus_debits" onOpen={openMetric} tone="out" /></Row>
            <Row label="We took back" hint="The free gift ran out, or we cancelled the free coins. This is not money leaving the store."><ClickNum value={bonus.removed} metric="bonus_voided" onOpen={openMetric} tone="out" /></Row>
            <Row label="Still left now" hint="Free coins the player still has"><ClickNum value={bonus.closing} metric="bonus_credits" onOpen={openMetric} /></Row>
          </section>

          <section className="wsc-jar wsc-jar-rsc">
            <SectionHead
              title="Redeem coins (RSC) — line by line"
              subtitle="These are cash-out coins won in games. “We took back” is RSC used in games, staff deduct, leftover wipe, or extra win we did not allow — not a cancelled cash-out."
            />
            <Row label="Already in the jar" hint="Redeem coins left from before this date"><ClickNum value={rsc.opening} metric="rsc_credits" onOpen={openMetric} /></Row>
            <Row label="Won from games" hint="We approved the game redeem, so coins came from the game into this jar. A cancelled game redeem is not in this number."><ClickNum value={rsc.generated} metric="rsc_eligible" onOpen={openMetric} tone="in" /></Row>
            <Row label="Cashed out" hint="We actually paid the player. A cancelled cash-out is not in this number — those coins are still in the jar."><ClickNum value={rsc.withdrawals} metric="rsc_withdrawals" onOpen={openMetric} tone="out" /></Row>
            <Row label="We took back" hint="1) RSC the player used in games. 2) Staff deducted RSC in the admin panel. 3) Leftover wipe after a never-deposited cash-out, or extra win from free coins we did not allow. Not a cancelled cash-out."><ClickNum value={Number(rsc.bonusRscVoided || 0) + Number(rsc.otherDebits || 0)} metric="rsc_other_debits" onOpen={openMetric} tone="out" /></Row>
            <Row label="Still left now" hint="Redeem coins the player still has, including frozen coins from a cash-out that is not paid yet"><ClickNum value={rsc.closing} metric="rsc_credits" onOpen={openMetric} /></Row>
          </section>
        </>
      )}

      {drill && (
        <div className="wsc-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="wsc-modal-title">
          <div className="wsc-modal">
            <header className="wsc-modal-head">
              <h2 id="wsc-modal-title">Every coin in this number</h2>
              <button type="button" className="wsc-chip" onClick={() => setDrill(null)}>Close</button>
            </header>
            {drillLoading ? (
              <p className="ccw-loading">Loading…</p>
            ) : (
              <>
                {drilldown && drilldown.length > 0 && (
                  <div className="wsc-drilldown">
                    <h3>Which slot game these coins belong to</h3>
                    <table className="ccw-table bsu-table">
                      <thead>
                        <tr>
                          <th>Where the game is from</th>
                          <th>Game name</th>
                          <th>Bought coins sent in</th>
                          <th>Gift coins sent in</th>
                          <th>Redeem coins sent in</th>
                          <th>Redeem coins won</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drilldown.map((d) => (
                          <tr key={`${d.providerId}-${d.gameId || 'none'}`}>
                            <td>{d.providerId}</td>
                            <td>
                              <button
                                type="button"
                                className="wsc-linkish"
                                onClick={() => {
                                  setDrill((prev) => ({ ...prev, providerId: d.providerId, gameId: d.gameId }))
                                  setDrillPage(1)
                                }}
                              >
                                {d.gameName || d.gameId || '—'}
                              </button>
                            </td>
                            <td>{formatSc(d.pscUsed)}</td>
                            <td>{formatSc(d.bonusUsed)}</td>
                            <td>{formatSc(d.rscUsed)}</td>
                            <td>{formatSc(d.rscGenerated)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="wsc-modal-count">{drillTotal} moves</p>
                <div className="ccw-table-wrap">
                  <table className="ccw-table bsu-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Player</th>
                        <th>Store</th>
                        <th>Jar</th>
                        <th>In / out</th>
                        <th>Amount</th>
                        <th>Why</th>
                        <th>Game</th>
                        <th>Gift lot</th>
                        <th>Payment</th>
                        <th>Id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillRows.length === 0 ? (
                        <tr><td colSpan={11}>No coins in this number for these dates.</td></tr>
                      ) : drillRows.map((row) => (
                        <tr key={row.id}>
                          <td>{formatTransactionDateTime(row.createdAt)}</td>
                          <td>
                            <Link className="bsu-user-link" to={`/users/${row.userId}`}>{playerLabel(row)}</Link>
                          </td>
                          <td>{row.storeCode || '—'}</td>
                          <td>{row.walletType}</td>
                          <td>{row.direction === 'CREDIT' ? 'Got' : 'Used'}</td>
                          <td>{formatSc(row.amount)}</td>
                          <td>{row.remarks || row.eventType}</td>
                          <td>{row.gameName || row.productId || '—'}</td>
                          <td>{row.bonusType || '—'}</td>
                          <td>{row.paymentId || '—'}</td>
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
        </div>
      )}
    </div>
  )
}
