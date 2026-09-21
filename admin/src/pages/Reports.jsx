import { useState, useEffect, useCallback, useRef } from 'react'
import { getReportsSummary, getReportsTrend, getReportsBreakdown, getReportsFilterOptions, getReportsTransactions, getChimeCashappWithdrawals } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getScopeFromUser } from '../utils/dashboardScope'
import { getDefaultDateRange, getPresetRange, getDatesInRange, formatDateRangeLabel, PRESETS } from '../utils/dateRange'
import { formatCurrency } from '../utils/format'
import DateRangeFilter from '../components/DateRangeFilter'
import TrendLineChart from '../components/charts/TrendLineChart'
import SimpleBarChart from '../components/charts/SimpleBarChart'
import MultiSelectDropdown from '../components/MultiSelectDropdown'
import './Reports.css'

const defaultRange = getDefaultDateRange()
const PAGE_SIZES = [10, 25, 50, 100]
const EXPORT_PAGE_SIZE = 500

/** Transaction type labels for filter and table (store-admin friendly). Same labels everywhere. */
const TYPE_LABELS = {
  deposit: 'Topup',
  withdraw: 'Withdraw',
  game_deposit: 'Game Topup',
  game_withdraw: 'Game Withdraw',
  promotion: 'Promotions',
  vip_bonus: 'VIP',
  affiliate: 'Affiliate',
  referral_friend_signup: 'Referral Bonus',
  welcome_signup: 'Welcome Bonus',
  spin_wheel: 'Spin Wheel'
}

/** All transaction types for multi-select filter (value = backend type). */
const TYPE_OPTIONS = [
  { value: 'deposit', label: TYPE_LABELS.deposit },
  { value: 'withdraw', label: TYPE_LABELS.withdraw },
  { value: 'game_deposit', label: TYPE_LABELS.game_deposit },
  { value: 'game_withdraw', label: TYPE_LABELS.game_withdraw },
  { value: 'promotion', label: TYPE_LABELS.promotion },
  { value: 'vip_bonus', label: TYPE_LABELS.vip_bonus },
  { value: 'affiliate', label: TYPE_LABELS.affiliate },
  { value: 'referral_friend_signup', label: TYPE_LABELS.referral_friend_signup },
  { value: 'welcome_signup', label: TYPE_LABELS.welcome_signup },
  { value: 'spin_wheel', label: TYPE_LABELS.spin_wheel }
]

/** When REPORTS_REAL_MONEY_ONLY is true, only these types are shown in the admin panel. */
const REAL_MONEY_TYPE_OPTIONS = [
  { value: 'deposit', label: TYPE_LABELS.deposit },
  { value: 'withdraw', label: TYPE_LABELS.withdraw }
]

const svgProps = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

function IconMoneyIn() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconMoneyOut() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M21 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4" />
      <polyline points="17 14 12 9 7 14" />
      <line x1="12" y1="9" x2="12" y2="21" />
    </svg>
  )
}

function IconTrendingUp() {
  return (
    <svg {...svgProps} aria-hidden>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function IconReceipt() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconChime() {
  return (
    <svg {...svgProps} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  )
}

function IconCashApp() {
  return (
    <svg {...svgProps} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  )
}

/** Date/time for table (like user frontend Transactions). */
function formatTxDate(d) {
  if (!d) return '—'
  const date = new Date(d)
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dateStr} ${timeStr}`
}

function typeLabel(t) {
  return TYPE_LABELS[t] || t
}

/** Amount styling like user frontend: + green for in, - red for out, amber for bonus. */
function TxAmount({ type, amount, currencyCode = 'SC' }) {
  const walletGains = [
    'deposit',
    'game_withdraw',
    'spin_wheel',
    'welcome_signup',
    'referral_friend_signup',
    'promotion',
    'affiliate',
    'vip_bonus'
  ].includes(type)
  const isBonus = [
    'spin_wheel',
    'welcome_signup',
    'referral_friend_signup',
    'promotion',
    'affiliate',
    'vip_bonus'
  ].includes(type)
  const value = Math.abs(Number(amount))
  const sign = walletGains ? '+' : '−'
  let className = 'reports-amount-in'
  if (!walletGains) className = 'reports-amount-out'
  else if (isBonus) className = 'reports-amount-bonus'
  return (
    <span className={className}>
      {sign}{value.toFixed(2)} {currencyCode}
    </span>
  )
}

/** Status for display (backend may add later). Default to Success for completed txns. */
function getStatusBadge(tx) {
  const status = tx.status || 'success'
  const map = { success: { label: 'Success', class: 'reports-status-success' }, pending: { label: 'Pending', class: 'reports-status-pending' }, failed: { label: 'Failed', class: 'reports-status-failed' } }
  const s = map[status] || map.success
  return <span className={`reports-status-badge ${s.class}`}>{s.label}</span>
}

function getPageTitle(scope) {
  if (scope.level === 'platform') return 'Platform Reports'
  if (scope.level === 'distributor') return 'Distributor Reports'
  return 'Store Reports'
}

function getPageSubtitle(scope) {
  if (scope.level === 'platform') return 'Financial and activity report for the platform'
  if (scope.level === 'distributor') return `Financial and activity report for distributor ${scope.distributorCode || ''}`
  return 'Financial and activity report for your store'
}

/** Build export filename from scope, date range, type and distributor/store filters. Extension e.g. 'csv' or 'xls'. */
function getExportFileName(scope, applied, extension) {
  const safe = (s) => (s == null ? '' : String(s)).replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'all'
  let scopePart = 'platform'
  if (scope.level === 'distributor' && scope.distributorCode) scopePart = `distributor-${safe(scope.distributorCode)}`
  else if (scope.level === 'store' && scope.storeCode) scopePart = `store-${safe(scope.storeCode)}`
  const start = applied.startDate || ''
  const end = applied.endDate || ''
  const datePart = start && end ? `${start}-to-${end}` : start || end || 'all'
  const typePart = applied.type ? `-${safe(applied.type)}` : ''
  const distPart = applied.distributorCode ? `-dist-${safe(applied.distributorCode)}` : ''
  const storePart = applied.storeCode ? `-store-${safe(applied.storeCode)}` : ''
  return `reports-${scopePart}-${datePart}${typePart}${distPart}${storePart}.${extension}`
}

export default function Reports() {
  const { user } = useAuth()
  const toast = useToast()
  const scope = getScopeFromUser(user)

  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [filterTypes, setFilterTypes] = useState([])
  const [filterDistributorCodes, setFilterDistributorCodes] = useState([])
  const [filterStoreCodes, setFilterStoreCodes] = useState([])
  const [distributorOptions, setDistributorOptions] = useState([])
  const [storeOptions, setStoreOptions] = useState([])
  const [realMoneyOnly, setRealMoneyOnly] = useState(false)
  const [applied, setApplied] = useState({ startDate: defaultRange.startDate, endDate: defaultRange.endDate, type: '', distributorCode: '', storeCode: '' })

  const [summary, setSummary] = useState(null)
  const [trend, setTrend] = useState([])
  const [breakdown, setBreakdown] = useState([])
  const [chimeWithdrawals, setChimeWithdrawals] = useState([])
  const [loadingChime, setLoadingChime] = useState(false)
  const [transactions, setTransactions] = useState({ rows: [], total: 0, page: 1, limit: 25, totalPages: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingTrend, setLoadingTrend] = useState(false)
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [loadingTable, setLoadingTable] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null)
  const exportMenuRef = useRef(null)
  const exportTableMenuRef = useRef(null)
  const transactionsRequestRef = useRef(null)

  const fetchReport = useCallback(() => {
    const { startDate: s, endDate: e, type: ty } = applied
    const summaryType = ty && !ty.includes(',') ? ty : undefined
    // Always send date range so summary cards show date-wise totals (not all-time).
    const start = s || defaultRange.startDate
    const end = e || defaultRange.endDate
    setLoadingSummary(true)
    setLoadingTrend(true)
    setLoadingBreakdown(true)
    setLoadingChime(true)
    Promise.all([
      getReportsSummary({ startDate: start, endDate: end, type: summaryType }).then(setSummary).catch(() => setSummary(null)),
      getReportsTrend({ startDate: start, endDate: end }).then(setTrend).catch(() => setTrend([])),
      getReportsBreakdown({ startDate: start, endDate: end }).then(setBreakdown).catch(() => setBreakdown([])),
      getChimeCashappWithdrawals({ status: 'completed', payoutType: 'chime,cashapp', startDate: start, endDate: end, limit: 500 }).then((res) => setChimeWithdrawals(res.list || [])).catch(() => setChimeWithdrawals([]))
    ]).finally(() => {
      setLoadingSummary(false)
      setLoadingTrend(false)
      setLoadingBreakdown(false)
      setLoadingChime(false)
    })
  }, [applied])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Sync header date range to applied so transaction history (and summary/trend/breakdown) always filter by the selected dates.
  useEffect(() => {
    setApplied((prev) => {
      if (prev.startDate === startDate && prev.endDate === endDate) return prev
      return { ...prev, startDate, endDate }
    })
    setCurrentPage(1)
  }, [startDate, endDate])

  const canFilterByDistributorOrStore = scope.level === 'platform' || scope.level === 'distributor'
  useEffect(() => {
    getReportsFilterOptions()
      .then((res) => {
        const dist = (res.distributorCodes || []).map((c) => ({ value: c, label: c }))
        const store = (res.storeCodes || []).map((c) => ({ value: c, label: c }))
        setDistributorOptions(dist)
        setStoreOptions(store)
        setRealMoneyOnly(Boolean(res.realMoneyOnly))
        if (res.realMoneyOnly) {
          setFilterTypes((prev) => prev.filter((t) => t === 'deposit' || t === 'withdraw'))
        }
      })
      .catch(() => {
        setDistributorOptions([])
        setStoreOptions([])
      })
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      const inHeader = exportMenuRef.current && exportMenuRef.current.contains(e.target)
      const inTable = exportTableMenuRef.current && exportTableMenuRef.current.contains(e.target)
      if (!inHeader && !inTable) setExportMenuAnchor(null)
    }
    if (exportMenuAnchor) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [exportMenuAnchor])

  useEffect(() => {
    const rangeStart = (startDate && String(startDate).trim()) || defaultRange.startDate
    const rangeEnd = (endDate && String(endDate).trim()) || defaultRange.endDate
    const { type: ty, distributorCode: dc, storeCode: sc } = applied
    const thisRequest = { rangeStart, rangeEnd, page: currentPage, pageSize }
    transactionsRequestRef.current = thisRequest
    setLoadingTable(true)
    const params = {
      startDate: rangeStart,
      endDate: rangeEnd,
      type: ty || undefined,
      distributorCode: dc || undefined,
      storeCode: sc || undefined,
      page: currentPage,
      limit: pageSize,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    }
    getReportsTransactions(params)
      .then((data) => {
        const latest = transactionsRequestRef.current
        if (!latest || latest.rangeStart !== thisRequest.rangeStart || latest.rangeEnd !== thisRequest.rangeEnd || latest.page !== thisRequest.page || latest.pageSize !== thisRequest.pageSize) return
        setTransactions({ rows: data.rows || [], total: data.total || 0, page: data.page || 1, limit: data.limit || pageSize, totalPages: data.totalPages || 0 })
      })
      .catch(() => {
        const latest = transactionsRequestRef.current
        if (!latest || latest.rangeStart !== thisRequest.rangeStart || latest.rangeEnd !== thisRequest.rangeEnd || latest.page !== thisRequest.page || latest.pageSize !== thisRequest.pageSize) return
        setTransactions({ rows: [], total: 0, page: 1, limit: pageSize, totalPages: 0 })
      })
      .finally(() => setLoadingTable(false))
  }, [startDate, endDate, applied, currentPage, pageSize])

  const handlePreset = (range) => {
    if (!range || range.startDate == null || range.endDate == null) return
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setApplied((prev) => ({ ...prev, startDate: range.startDate, endDate: range.endDate }))
    setCurrentPage(1)
  }

  const handleApply = () => {
    setApplied({
      startDate,
      endDate,
      type: filterTypes.length > 0 ? filterTypes.join(',') : '',
      distributorCode: filterDistributorCodes.length > 0 ? filterDistributorCodes.join(',') : '',
      storeCode: filterStoreCodes.length > 0 ? filterStoreCodes.join(',') : ''
    })
    setCurrentPage(1)
  }

  const handleReset = () => {
    const r = getPresetRange(PRESETS.LAST_7)
    setStartDate(r.startDate)
    setEndDate(r.endDate)
    setFilterTypes([])
    setFilterDistributorCodes([])
    setFilterStoreCodes([])
    setApplied({ startDate: r.startDate, endDate: r.endDate, type: '', distributorCode: '', storeCode: '' })
    setCurrentPage(1)
  }

  const buildExportRows = (rows) => {
    const headers = ['Date', 'Txn ID', 'Username', 'User ID', 'Type', 'Description', 'Game', 'Amount', 'Currency', 'Status', 'Store', 'Distributor']
    const dataRows = (rows || []).map((tx) => {
      const username = tx.username ?? tx.userPhone ?? tx.userId ?? ''
      return [
        tx.createdAt ? new Date(tx.createdAt).toISOString() : '',
        tx.id,
        username,
        tx.userId,
        typeLabel(tx.type),
        tx.description || '',
        tx.gameName || '',
        Number(tx.amount).toFixed(2),
        tx.currencyCode || 'SC',
        tx.status || 'success',
        tx.storeCode || '',
        tx.distributorCode || ''
      ]
    })
    return [headers, ...dataRows]
  }

  const handleExport = async (format) => {
    setExportMenuAnchor(null)
    setExporting(true)
    const { startDate: s, endDate: e, type: ty, distributorCode: dc, storeCode: sc } = applied
    try {
      let allRows = []
      let page = 1
      let total = 1
      while (allRows.length < total) {
        const data = await getReportsTransactions({
          startDate: s,
          endDate: e,
          type: ty || undefined,
          distributorCode: dc || undefined,
          storeCode: sc || undefined,
          page,
          limit: EXPORT_PAGE_SIZE,
          sortBy: 'createdAt',
          sortOrder: 'desc'
        })
        const rows = data.rows || []
        total = data.total ?? 0
        allRows = allRows.concat(rows)
        if (rows.length < EXPORT_PAGE_SIZE || allRows.length >= total) break
        page += 1
      }
      const exportRows = buildExportRows(allRows)
      const fileName = getExportFileName(scope, applied, format === 'csv' ? 'csv' : 'xls')

      if (format === 'csv') {
        const escape = (v) => {
          const str = v == null ? '' : String(v)
          return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str
        }
        const csv = exportRows.map((row) => row.map(escape).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const escapeXml = (v) => {
          const str = v == null ? '' : String(v)
          return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        }
        const rowsXml = exportRows.map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('')
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Transactions">
    <Table>${rowsXml}</Table>
  </Worksheet>
</Workbook>`
        const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      toast.error(err?.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const rechargeCount = summary?.depositCount ?? breakdown.find((b) => b.type === 'Recharge')?.count ?? 0
  const withdrawCount = summary?.withdrawCount ?? breakdown.find((b) => b.type === 'Withdraw')?.count ?? 0
  const chimeCount = breakdown.find((b) => b.type === 'Chime')?.count ?? 0
  const cashappCount = breakdown.find((b) => b.type === 'CashApp')?.count ?? 0
  const otherWithdrawAmount = Number(summary?.otherWithdrawAmount) || 0

  const showDistributorColumn = scope.level === 'platform'
  const showStoreColumn = scope.level === 'platform' || scope.level === 'distributor'

  return (
    <div className="reports-page">
      {/* SECTION 1 — Smart Header */}
      <header className="reports-header">
        <div className="reports-header-title">
          <h1 className="reports-title">{getPageTitle(scope)}</h1>
          <p className="reports-subtitle">{getPageSubtitle(scope)}</p>
        </div>
        <div className="reports-header-actions">
          <div className="reports-date-row">
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onPresetClick={handlePreset}
              label=""
            />
            <div className="reports-export-dropdown" ref={exportMenuRef}>
              <button type="button" className="reports-export-btn" onClick={() => setExportMenuAnchor((a) => (a === 'header' ? null : 'header'))} disabled={exporting} aria-expanded={exportMenuAnchor === 'header'} aria-haspopup="menu">
                {exporting ? 'Exporting…' : 'Export'}
              </button>
              {exportMenuAnchor === 'header' && (
                <div className="reports-export-menu" role="menu">
                  <button type="button" className="reports-export-menu-item" onClick={() => handleExport('csv')} role="menuitem">Download CSV</button>
                  <button type="button" className="reports-export-menu-item" onClick={() => handleExport('excel')} role="menuitem">Download Excel</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* SECTION 2 — Financial Summary (4 big cards) */}
      <section className="reports-summary">
        <h2 className="reports-section-heading">Summary for Selected Period</h2>
        <p className="reports-range-label">{formatDateRangeLabel(applied.startDate, applied.endDate)}</p>
        {loadingSummary && <p className="reports-loading">Loading summary…</p>}
        {!loadingSummary && summary && (
          <div className="reports-cards">
            <div className="reports-card reports-card-recharge">
              <span className="reports-card-icon" aria-hidden><IconMoneyIn /></span>
              <span className="reports-card-value">{formatCurrency(summary.rechargeAmount)}</span>
              <span className="reports-card-meta">{rechargeCount} Transaction{rechargeCount !== 1 ? 's' : ''}</span>
              <span className="reports-card-label">Money Received</span>
            </div>
            <div className="reports-card reports-card-withdraw">
              <span className="reports-card-icon" aria-hidden><IconMoneyOut /></span>
              <span className="reports-card-value">{formatCurrency(summary.withdrawAmount)}</span>
              <span className="reports-card-meta">{withdrawCount} Transaction{withdrawCount !== 1 ? 's' : ''}</span>
              <span className="reports-card-label">Total Withdrawals</span>
            </div>
            <div className="reports-card reports-card-chime">
              <span className="reports-card-icon" aria-hidden><IconChime /></span>
              <span className="reports-card-value">{formatCurrency(summary.chimeWithdrawAmount)}</span>
              <span className="reports-card-meta">{chimeCount} Request{chimeCount !== 1 ? 's' : ''}</span>
              <span className="reports-card-label">Chime Withdrawals</span>
            </div>
            <div className="reports-card reports-card-cashapp">
              <span className="reports-card-icon" aria-hidden><IconCashApp /></span>
              <span className="reports-card-value">{formatCurrency(summary.cashappWithdrawAmount)}</span>
              <span className="reports-card-meta">{cashappCount} Request{cashappCount !== 1 ? 's' : ''}</span>
              <span className="reports-card-label">Cash App Withdrawals</span>
            </div>
            {otherWithdrawAmount > 0.009 && (
              <div className="reports-card reports-card-withdraw">
                <span className="reports-card-icon" aria-hidden><IconMoneyOut /></span>
                <span className="reports-card-value">{formatCurrency(otherWithdrawAmount)}</span>
                <span className="reports-card-label">Other Withdrawals</span>
              </div>
            )}
            <div className="reports-card reports-card-net">
              <span className="reports-card-icon" aria-hidden><IconTrendingUp /></span>
              <span className="reports-card-value reports-card-value-net">{formatCurrency(summary.net)}</span>
              <span className="reports-card-label">Profit</span>
            </div>
            <div className="reports-card reports-card-activity">
              <span className="reports-card-icon" aria-hidden><IconReceipt /></span>
              <span className="reports-card-value">{summary.transactionCount}</span>
              <span className="reports-card-label">Transactions</span>
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3 — Main chart: Recharge vs Withdraw (one line chart) */}
      <section className="reports-charts">
        {loadingTrend && <p className="reports-loading">Loading chart…</p>}
        {!loadingTrend && (() => {
          const rangeStart = applied.startDate || defaultRange.startDate
          const rangeEnd = applied.endDate || defaultRange.endDate
          const allDates = getDatesInRange(rangeStart, rangeEnd)
          const trendWithFullRange = allDates.map((date) => {
            const point = trend.find((t) => t.date === date)
            return point ? { ...point } : { date, rechargeAmount: 0, withdrawAmount: 0 }
          })
          return allDates.length > 0 && (
            <div className="reports-chart-main">
              <TrendLineChart
                title="Recharge vs Withdraw Trend"
                data={trendWithFullRange}
                xKey="date"
                lines={[
                  { key: 'rechargeAmount', label: 'Recharge', color: '#10b981' },
                  { key: 'withdrawAmount', label: 'Withdraw', color: '#ef4444' }
                ]}
                yLabel="Amount (SC)"
                showNetInTooltip
                height={320}
              />
            </div>
          )
        })()}
        {!loadingBreakdown && breakdown.length > 0 && (
          <div className="reports-chart-secondary">
            <SimpleBarChart
              title="Transactions Breakdown"
              description="Number of transactions by type (Recharge, Withdraw, Bonus) in the selected date range."
              data={breakdown}
              xKey="type"
              barKey="count"
              yLabel="Count"
              xAxisLabel="Type"
              valueFormatter={(v) => String(Math.round(Number(v)))}
              barColors={['#10b981', '#ef4444', '#7c3aed', '#06b6d4', '#f59e0b']}
              height={280}
            />
          </div>
        )}
      </section>

      {/* SECTION 4 — Transaction History */}
      <section className="reports-table-section" style={{ marginBottom: '2.5rem' }}>
        <div className="reports-table-header">
          <h2 className="reports-section-heading">Transaction History</h2>
          <div className="reports-table-toolbar">
            <div className="reports-table-filters">
              <div className="reports-table-filter-item">
                <span className="reports-table-filter-label">Type</span>
                <MultiSelectDropdown
                  options={realMoneyOnly ? REAL_MONEY_TYPE_OPTIONS : TYPE_OPTIONS}
                  selected={filterTypes}
                  onChange={setFilterTypes}
                  label="Type"
                  placeholder={realMoneyOnly ? 'Select type' : 'All types'}
                />
              </div>
              {scope.level === 'platform' && distributorOptions.length > 0 && (
                <div className="reports-table-filter-item">
                  <span className="reports-table-filter-label">Distributor(s)</span>
                  <MultiSelectDropdown
                    options={distributorOptions}
                    selected={filterDistributorCodes}
                    onChange={setFilterDistributorCodes}
                    label="Distributor(s)"
                    placeholder="All distributors"
                  />
                </div>
              )}
              {canFilterByDistributorOrStore && storeOptions.length > 0 && (
                <div className="reports-table-filter-item">
                  <span className="reports-table-filter-label">Store(s)</span>
                  <MultiSelectDropdown
                    options={storeOptions}
                    selected={filterStoreCodes}
                    onChange={setFilterStoreCodes}
                    label="Store(s)"
                    placeholder="All stores"
                  />
                </div>
              )}
            </div>
            <div className="reports-table-actions">
              <button type="button" className="reports-btn reports-btn-apply" onClick={handleApply}>Apply filters</button>
              <button type="button" className="reports-btn reports-btn-secondary" onClick={handleReset}>Reset filters</button>
              <div className="reports-export-dropdown reports-export-dropdown-inline" ref={exportTableMenuRef}>
                <button type="button" className="reports-export-btn reports-export-btn-secondary" onClick={() => setExportMenuAnchor((a) => (a === 'table' ? null : 'table'))} disabled={exporting} aria-expanded={exportMenuAnchor === 'table'} aria-haspopup="menu">
                  {exporting ? 'Exporting…' : 'Export'}
                </button>
                {exportMenuAnchor === 'table' && (
                  <div className="reports-export-menu" role="menu">
                    <button type="button" className="reports-export-menu-item" onClick={() => handleExport('csv')} role="menuitem">Download CSV</button>
                    <button type="button" className="reports-export-menu-item" onClick={() => handleExport('excel')} role="menuitem">Download Excel</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {loadingTable && <p className="reports-loading">Loading…</p>}
        {!loadingTable && (
          <>
            <div className="reports-table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Username</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Game</th>
                    <th className="reports-th-amount">Amount</th>
                    <th>Status</th>
                    {showStoreColumn && <th>Store</th>}
                    {showDistributorColumn && <th>Distributor</th>}
                  </tr>
                </thead>
                <tbody>
                  {transactions.rows.map((tx) => (
                    <tr key={tx.id}>
                      <td className="reports-td-date">{formatTxDate(tx.createdAt)}</td>
                      <td className="reports-td-username">{tx.username ?? tx.userPhone ?? tx.userId ?? '—'}</td>
                      <td>{typeLabel(tx.type)}</td>
                      <td className="reports-td-desc">{tx.description || '—'}</td>
                      <td className="reports-td-game">{tx.gameName || '—'}</td>
                      <td className="reports-td-amount">
                        <TxAmount type={tx.type} amount={tx.amount} currencyCode={tx.currencyCode} />
                      </td>
                      <td>{getStatusBadge(tx)}</td>
                      {showStoreColumn && <td>{tx.storeCode || '—'}</td>}
                      {showDistributorColumn && <td>{tx.distributorCode || '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {transactions.rows.length === 0 && <p className="reports-empty">No transactions in this range.</p>}
            {(transactions.total > 0 || transactions.rows.length > 0) && (
              <div className="reports-pagination-wrap">
                <div className="reports-pagination-perpage">
                  <label className="reports-pagination-perpage-label">
                    Show
                    <select
                      className="reports-pagination-perpage-select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setCurrentPage(1)
                      }}
                      aria-label="Rows per page"
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    per page
                  </label>
                </div>
                <div className="reports-pagination">
                  <span className="reports-pagination-info">
                    Showing {transactions.total === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                    {transactions.total === 0 ? 0 : Math.min(currentPage * pageSize, transactions.total)} of {transactions.total}
                  </span>
                  <div className="reports-pagination-btns">
                    <button
                      type="button"
                      className="reports-pagination-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(1)}
                      aria-label="First page"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      className="reports-pagination-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                      aria-label="Previous page"
                    >
                      Previous
                    </button>
                    <span className="reports-pagination-page">Page {currentPage} of {transactions.totalPages || 1}</span>
                    <button
                      type="button"
                      className="reports-pagination-btn"
                      disabled={currentPage >= (transactions.totalPages || 1)}
                      onClick={() => setCurrentPage((p) => p + 1)}
                      aria-label="Next page"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      className="reports-pagination-btn"
                      disabled={currentPage >= (transactions.totalPages || 1)}
                      onClick={() => setCurrentPage(transactions.totalPages || 1)}
                      aria-label="Last page"
                    >
                      Last
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* SECTION 5 — Chime / Cash App Detailed List */}
      <section className="reports-table-section reports-chime-details">
        <h2 className="reports-section-heading">Chime & Cash App Withdrawal Details</h2>
        <p className="reports-subtitle" style={{ marginBottom: '1rem' }}>Approved Chime and Cash App requests for the selected period. PayPal, card, and other methods are in Other Withdrawals.</p>
        
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Date (Approved)</th>
                <th>Player</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {loadingChime ? (
                <tr>
                  <td colSpan="5" className="reports-empty">Loading withdrawal details...</td>
                </tr>
              ) : chimeWithdrawals.filter((cw) => ['chime', 'cashapp'].includes(String(cw.payoutType || '').toLowerCase())).length === 0 ? (
                <tr>
                  <td colSpan="5" className="reports-empty">No approved Chime/Cash App withdrawals in this range.</td>
                </tr>
              ) : (
                chimeWithdrawals.filter((cw) => ['chime', 'cashapp'].includes(String(cw.payoutType || '').toLowerCase())).map((cw) => (
                  <tr key={cw.id}>
                    <td className="reports-td-date">{formatTxDate(cw.approvedAt || cw.updatedAt)}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{cw.user?.username || cw.user?.firstName || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>ID: {cw.userId}</div>
                    </td>
                    <td className="reports-td-amount">
                      <span className="reports-amount-out">−{Number(cw.amount).toFixed(2)} {cw.currency || 'SC'}</span>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>
                      <span className={`reports-status-badge ${cw.payoutType === 'chime' ? 'reports-status-chime' : 'reports-status-cashapp'}`}>
                        {cw.payoutType}
                      </span>
                    </td>
                    <td>
                      {cw.approvedBy?.displayName || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
