import { useState, useEffect, useMemo } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { getDashboard, getDashboardSeries, getAnalyticsTop, getDepositRequests, getWithdrawalRequests, getPaymentTotalsStoreCodes } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, STORE_FEATURE_KEYS, canAccessAdminFeature, canAccessFeature } from '../constants/permissions'
import { useToast } from '../context/ToastContext'
import { getScopeFromUser, getScopeLabel } from '../utils/dashboardScope'
import { getDefaultDateRange, getDatesInRange, getPresetRange, formatDateRangeLabel, PRESETS, getTodayDateStr, getCurrentTimeStr, getDefaultEndTimeForDate, getAdminTimeZone, compareDateTime, clampTimeStr } from '../utils/dateRange'
import { formatCurrency } from '../utils/format'
import DateRangeFilter from '../components/DateRangeFilter'
import TrendLineChart from '../components/charts/TrendLineChart'
import SimpleBarChart from '../components/charts/SimpleBarChart'
import { useStaffAttendance } from '../context/StaffAttendanceContext'
import './Dashboard.css'

const SIGNUP_COLOR = '#3b82f6'
const TOPUP_COLOR = '#10b981'
const WITHDRAW_COLOR = '#ef4444'

function moneyPair(src = {}) {
  return {
    completedAmount: Number(src.completedAmount) || 0,
    pendingAmount: Number(src.pendingAmount) || 0,
    completedFee: Number(src.completedFee) || 0
  }
}

function autoWithdrawPair(src = {}) {
  return {
    ...moneyPair(src),
    chime: moneyPair(src.chime),
    cashapp: moneyPair(src.cashapp),
    paypal: moneyPair(src.paypal)
  }
}

const emptyMoney = { completedAmount: 0, pendingAmount: 0, completedFee: 0 }
const emptyAutoWithdraw = {
  ...emptyMoney,
  chime: { ...emptyMoney },
  cashapp: { ...emptyMoney },
  paypal: { ...emptyMoney }
}

const defaultRange = getDefaultDateRange()
const todayRange = getPresetRange(PRESETS.TODAY)
const defaultPaymentsStartTime = '00:00'
const defaultPaymentsEndTime = getDefaultEndTimeForDate(todayRange.endDate)

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const attendance = useStaffAttendance()
  const scope = useMemo(() => getScopeFromUser(user), [user])

  const [stats, setStats] = useState(null)
  const [series, setSeries] = useState(null)
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [seriesDateFrom, setSeriesDateFrom] = useState(defaultRange.startDate)
  const [seriesDateTo, setSeriesDateTo] = useState(defaultRange.endDate)
  const defaultSeriesStartTime = '00:00'
  const defaultSeriesEndTime = getDefaultEndTimeForDate(defaultRange.endDate)
  const [seriesStartTime, setSeriesStartTime] = useState(defaultSeriesStartTime)
  const [seriesEndTime, setSeriesEndTime] = useState(defaultSeriesEndTime)
  const [appliedSeriesStartTime, setAppliedSeriesStartTime] = useState(defaultSeriesStartTime)
  const [appliedSeriesEndTime, setAppliedSeriesEndTime] = useState(defaultSeriesEndTime)
  const useLineChart = true
  const [topData, setTopData] = useState([])
  const [topLoading, setTopLoading] = useState(false)
  const [paymentsStartDate, setPaymentsStartDate] = useState(todayRange.startDate)
  const [paymentsEndDate, setPaymentsEndDate] = useState(todayRange.endDate)
  const [paymentsStartTime, setPaymentsStartTime] = useState(defaultPaymentsStartTime)
  const [paymentsEndTime, setPaymentsEndTime] = useState(defaultPaymentsEndTime)
  const [appliedPaymentsStartDate, setAppliedPaymentsStartDate] = useState(todayRange.startDate)
  const [appliedPaymentsEndDate, setAppliedPaymentsEndDate] = useState(todayRange.endDate)
  const [appliedPaymentsStartTime, setAppliedPaymentsStartTime] = useState(defaultPaymentsStartTime)
  const [appliedPaymentsEndTime, setAppliedPaymentsEndTime] = useState(defaultPaymentsEndTime)
  const [paymentsStoreFilter, setPaymentsStoreFilter] = useState('')
  const [appliedPaymentsStoreCode, setAppliedPaymentsStoreCode] = useState('')
  const [paymentTotalsStoreOptions, setPaymentTotalsStoreOptions] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsSummary, setPaymentsSummary] = useState({
    deposits: {
      orionstarspay: { ...emptyMoney },
      chime: { ...emptyMoney },
      dollarpay: { ...emptyMoney },
      xxpay: { ...emptyMoney }
    },
    withdrawals: {
      orionstarspay: { ...emptyMoney },
      chime: { ...emptyMoney },
      cashapp: { ...emptyMoney },
      dollarpay: { ...emptyAutoWithdraw },
      xxpay: { ...emptyAutoWithdraw }
    }
  })

  useEffect(() => {
    getDashboard()
      .then(setStats)
      .catch((err) => {
        toast.error(err.message || 'Failed to load dashboard')
        setStats({})
      })
  }, [toast])

  useEffect(() => {
    setSeriesLoading(true)
    const params = { dateFrom: seriesDateFrom, dateTo: seriesDateTo }
    // Store staff only: same start/end time filter as Payment totals
    if (scope.level === 'store' && user?.storeRoleId) {
      params.startTime = appliedSeriesStartTime || defaultSeriesStartTime
      params.endTime = appliedSeriesEndTime || getDefaultEndTimeForDate(seriesDateTo)
    }
    getDashboardSeries(params)
      .then(setSeries)
      .catch(() => setSeries(null))
      .finally(() => setSeriesLoading(false))
  }, [seriesDateFrom, seriesDateTo, appliedSeriesStartTime, appliedSeriesEndTime, scope.level, user?.storeRoleId])

  const showTopChart = scope.level === 'platform' || scope.level === 'distributor'
  useEffect(() => {
    if (!showTopChart) {
      setTopData([])
      return
    }
    setTopLoading(true)
    getAnalyticsTop({
      startDate: seriesDateFrom,
      endDate: seriesDateTo,
      by: 'store',
      metric: 'recharge'
    })
      .then((list) => setTopData(Array.isArray(list) ? list : []))
      .catch(() => setTopData([]))
      .finally(() => setTopLoading(false))
  }, [showTopChart, seriesDateFrom, seriesDateTo])

  /** Daily recharge vs withdraw for trend (plan spec: rechargeAmount, withdrawAmount). */
  const overviewDailyData = useMemo(() => {
    if (!seriesDateFrom || !seriesDateTo || !series) return []
    const dates = getDatesInRange(seriesDateFrom, seriesDateTo)
    const topupByDate = Object.fromEntries((series.dailyTopup || []).map((r) => [r.date, Number(r.sum) || 0]))
    const withdrawByDate = Object.fromEntries((series.dailyWithdraw || []).map((r) => [r.date, Number(r.sum) || 0]))
    return dates.map((date) => ({
      date,
      rechargeAmount: topupByDate[date] ?? 0,
      withdrawAmount: withdrawByDate[date] ?? 0
    }))
  }, [series, seriesDateFrom, seriesDateTo])

  const reportTotals = useMemo(() => {
    if (!series) return null
    const signups = (series.dailySignups || []).reduce((a, d) => a + (d.count || 0), 0)
    const topup = (series.dailyTopup || []).reduce((a, d) => a + (Number(d.sum) || 0), 0)
    const withdraw = (series.dailyWithdraw || []).reduce((a, d) => a + (Number(d.sum) || 0), 0)
    const txCount = (series.dailyTopup || []).reduce((a, d) => a + (d.count || 0), 0) + (series.dailyWithdraw || []).reduce((a, d) => a + (d.count || 0), 0)
    return { signups, topup, withdraw, txCount, net: topup - withdraw }
  }, [series])

  /** Transaction totals for bar chart (Recharge, Withdraw, Bonus per plan). */
  const transactionTotalsData = useMemo(() => {
    if (!reportTotals) return []
    return [
      { type: 'Recharge', amount: reportTotals.topup },
      { type: 'Withdraw', amount: reportTotals.withdraw },
      { type: 'Bonus', amount: reportTotals.bonus ?? 0 }
    ]
  }, [reportTotals])

  const allTimeSummaryTitle = scope.level === 'platform' ? 'Platform Summary (All Time)' : scope.level === 'distributor' ? 'Distributor Summary (All Time)' : 'Store Summary (All Time)'
  const todayStr = getTodayDateStr()
  const currentTimeStr = getCurrentTimeStr()
  const adminTimeZone = getAdminTimeZone()
  const showSeriesTimeFilter = scope.level === 'store' && Boolean(user?.storeRoleId)
  const canSeePaymentTotals =
    (scope.level === 'store' && canAccessFeature(user, STORE_FEATURE_KEYS.PAYMENT_TOTALS)) ||
    (scope.level === 'platform' && (
      user?.role === ROLES.MASTER_ADMIN
        ? canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS)
        : true
    ))
  const showPaymentsTotals = canSeePaymentTotals
  const showPaymentsStoreDropdown =
    scope.level === 'platform' &&
    user?.role === ROLES.MASTER_ADMIN &&
    canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.PAYMENT_TOTALS)
  const paymentTotalsTitle =
    scope.level === 'platform'
      ? (appliedPaymentsStoreCode
        ? `Payment totals (${appliedPaymentsStoreCode})`
        : 'Payment totals (All stores)')
      : 'Payment totals (your store)'

  const paymentsSameDay = Boolean(
    paymentsStartDate && paymentsEndDate && paymentsStartDate === paymentsEndDate
  )
  const paymentsRangeInvalid = Boolean(
    paymentsStartDate
    && paymentsEndDate
    && compareDateTime(paymentsStartDate, paymentsStartTime, paymentsEndDate, paymentsEndTime) > 0
  )
  const paymentsEndTimeMin = paymentsSameDay ? paymentsStartTime : '00:00'
  const paymentsEndTimeMax = paymentsEndDate === todayStr ? currentTimeStr : '23:59'
  const paymentsStartTimeMax = paymentsSameDay
    ? clampTimeStr(paymentsEndTime, undefined, paymentsEndDate === todayStr ? currentTimeStr : '23:59')
    : (paymentsStartDate === todayStr ? currentTimeStr : '23:59')

  const seriesSameDay = Boolean(
    seriesDateFrom && seriesDateTo && seriesDateFrom === seriesDateTo
  )
  const seriesRangeInvalid = Boolean(
    showSeriesTimeFilter
    && seriesDateFrom
    && seriesDateTo
    && compareDateTime(seriesDateFrom, seriesStartTime, seriesDateTo, seriesEndTime) > 0
  )
  const seriesEndTimeMin = seriesSameDay ? seriesStartTime : '00:00'
  const seriesEndTimeMax = seriesDateTo === todayStr ? currentTimeStr : '23:59'
  const seriesStartTimeMax = seriesSameDay
    ? clampTimeStr(seriesEndTime, undefined, seriesDateTo === todayStr ? currentTimeStr : '23:59')
    : (seriesDateFrom === todayStr ? currentTimeStr : '23:59')

  const handleSeriesStartDateChange = (next) => {
    setSeriesDateFrom(next)
    let nextEndDate = seriesDateTo
    if (seriesDateTo && next && seriesDateTo < next) {
      nextEndDate = next
      setSeriesDateTo(next)
    }
    if (!showSeriesTimeFilter) return
    const endTimeMax = nextEndDate === todayStr ? currentTimeStr : '23:59'
    const sameDay = next && nextEndDate === next
    let nextEndTime = clampTimeStr(
      seriesEndTime,
      sameDay ? seriesStartTime : '00:00',
      endTimeMax
    )
    if (sameDay && compareDateTime(next, seriesStartTime, nextEndDate, nextEndTime) > 0) {
      nextEndTime = seriesStartTime
    }
    if (nextEndTime !== seriesEndTime) setSeriesEndTime(nextEndTime)
    let nextAppliedEnd = clampTimeStr(
      appliedSeriesEndTime,
      sameDay ? appliedSeriesStartTime : '00:00',
      endTimeMax
    )
    if (sameDay && compareDateTime(next, appliedSeriesStartTime, nextEndDate, nextAppliedEnd) > 0) {
      nextAppliedEnd = appliedSeriesStartTime
    }
    if (nextAppliedEnd !== appliedSeriesEndTime) setAppliedSeriesEndTime(nextAppliedEnd)
  }

  const handleSeriesEndDateChange = (next) => {
    setSeriesDateTo(next)
    if (seriesDateFrom && next && next < seriesDateFrom) setSeriesDateFrom(next)
    if (!showSeriesTimeFilter) return
    const endTimeMax = next === todayStr ? currentTimeStr : '23:59'
    const sameDay = seriesDateFrom && next && seriesDateFrom === next
    let nextEndTime = clampTimeStr(
      seriesEndTime,
      sameDay ? seriesStartTime : '00:00',
      endTimeMax
    )
    if (sameDay && compareDateTime(seriesDateFrom, seriesStartTime, next, nextEndTime) > 0) {
      nextEndTime = seriesStartTime
    }
    setSeriesEndTime(nextEndTime)
    let nextAppliedEnd = clampTimeStr(
      appliedSeriesEndTime,
      sameDay ? appliedSeriesStartTime : '00:00',
      endTimeMax
    )
    if (sameDay && compareDateTime(seriesDateFrom, appliedSeriesStartTime, next, nextAppliedEnd) > 0) {
      nextAppliedEnd = appliedSeriesStartTime
    }
    setAppliedSeriesEndTime(nextAppliedEnd)
  }

  const handleSeriesPresetClick = (range) => {
    setSeriesDateFrom(range.startDate)
    setSeriesDateTo(range.endDate)
    if (!showSeriesTimeFilter) return
    const resetEndTime = getDefaultEndTimeForDate(range.endDate)
    setSeriesStartTime(defaultSeriesStartTime)
    setSeriesEndTime(resetEndTime)
    setAppliedSeriesStartTime(defaultSeriesStartTime)
    setAppliedSeriesEndTime(resetEndTime)
  }

  useEffect(() => {
    if (!showPaymentsStoreDropdown) {
      setPaymentTotalsStoreOptions([])
      return
    }
    getPaymentTotalsStoreCodes()
      .then((res) => {
        const list = res?.storeCodes
        setPaymentTotalsStoreOptions(Array.isArray(list) ? list : [])
      })
      .catch(() => setPaymentTotalsStoreOptions([]))
  }, [showPaymentsStoreDropdown])

  useEffect(() => {
    if (!showPaymentsTotals) return
    setPaymentsLoading(true)
    const params = { page: 1, limit: 1 }
    if (appliedPaymentsStartDate) {
      params.startDate = appliedPaymentsStartDate
      params.startTime = appliedPaymentsStartTime || defaultPaymentsStartTime
    }
    if (appliedPaymentsEndDate) {
      params.endDate = appliedPaymentsEndDate
      params.endTime = appliedPaymentsEndTime || getDefaultEndTimeForDate(appliedPaymentsEndDate)
    }
    if (appliedPaymentsStoreCode) params.storeCode = appliedPaymentsStoreCode
    Promise.all([getDepositRequests(params), getWithdrawalRequests(params)])
      .then(([depRes, wdRes]) => {
        setPaymentsSummary({
          deposits: {
            orionstarspay: moneyPair(depRes?.summary?.orionstarspay),
            chime: moneyPair(depRes?.summary?.chime),
            dollarpay: moneyPair(depRes?.summary?.dollarpay),
            xxpay: moneyPair(depRes?.summary?.xxpay)
          },
          withdrawals: {
            orionstarspay: moneyPair(wdRes?.summary?.orionstarspay),
            chime: moneyPair(wdRes?.summary?.chime),
            cashapp: moneyPair(wdRes?.summary?.cashapp),
            dollarpay: autoWithdrawPair(wdRes?.summary?.dollarpay),
            xxpay: autoWithdrawPair(wdRes?.summary?.xxpay)
          }
        })
      })
      .catch(() => {
        setPaymentsSummary({
          deposits: {
            orionstarspay: { ...emptyMoney },
            chime: { ...emptyMoney },
            dollarpay: { ...emptyMoney },
            xxpay: { ...emptyMoney }
          },
          withdrawals: {
            orionstarspay: { ...emptyMoney },
            chime: { ...emptyMoney },
            cashapp: { ...emptyMoney },
            dollarpay: { ...emptyAutoWithdraw },
            xxpay: { ...emptyAutoWithdraw }
          }
        })
      })
      .finally(() => setPaymentsLoading(false))
  }, [showPaymentsTotals, appliedPaymentsStartDate, appliedPaymentsEndDate, appliedPaymentsStartTime, appliedPaymentsEndTime, appliedPaymentsStoreCode])

  if (!stats) return <div className="dashboard-loading">Loading dashboard…</div>

  return (
    <div className="dashboard">
      <h2>Dashboard</h2>
      <p className="dashboard-scope">Scope: {getScopeLabel(scope)}</p>

      {attendance?.punchRequired && (
        <section className="dashboard-shift-card">
          <h3 className="dashboard-section-title">Your shift</h3>
          <p className="dashboard-shift-meta">
            {attendance.shift
              ? `${attendance.shift.timezone} · ${attendance.shift.startTime}–${attendance.shift.endTime}`
              : 'Shift allocated'}
            {attendance.isOffShift ? ' · Off-shift login' : ''}
          </p>
          {attendance.openSession ? (
            <div className="dashboard-shift-timer">
              <span className="dashboard-card-value">{attendance.elapsedLabel}</span>
              <span className="dashboard-card-label">Time since check-in</span>
              <p className="dashboard-shift-balance">Opening balance: {Number(attendance.openSession.openingBalance).toFixed(2)}</p>
            </div>
          ) : (
            <p className="dashboard-shift-meta">Check in with today’s opening balance to start the timer.</p>
          )}
        </section>
      )}

      {/* Row 1: All-time KPI cards (role-aware) */}
      <h3 className="dashboard-section-title">{allTimeSummaryTitle}</h3>
      <div className="dashboard-cards">
        <div className="dashboard-card dashboard-card-today">
          <span className="dashboard-card-value">{stats.todayNewUsersCount ?? 0}</span>
          <span className="dashboard-card-label">Today&apos;s New Users</span>
        </div>
        {scope.level === 'platform' && (
          <>
            <div className="dashboard-card">
              <span className="dashboard-card-value">{stats.distributorsCount ?? 0}</span>
              <span className="dashboard-card-label">Total Distributors</span>
            </div>
            <div className="dashboard-card">
              <span className="dashboard-card-value">{stats.storeUsersCount ?? 0}</span>
              <span className="dashboard-card-label">Total Stores</span>
            </div>
          </>
        )}
        {scope.level === 'distributor' && (
          <div className="dashboard-card">
            <span className="dashboard-card-value">{stats.storeUsersCount ?? 0}</span>
            <span className="dashboard-card-label">Total Stores</span>
          </div>
        )}
        <div className="dashboard-card">
          <span className="dashboard-card-value">{stats.totalUsersCount ?? 0}</span>
          <span className="dashboard-card-label">Total New Users</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-value">{stats.totalTopupSum != null ? formatCurrency(stats.totalTopupSum) : '0.00 SC'}</span>
          <span className="dashboard-card-label">Total Recharge (SC)</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-value">{stats.totalWithdrawSum != null ? formatCurrency(stats.totalWithdrawSum) : '0.00 SC'}</span>
          <span className="dashboard-card-label">Total Withdraw (SC)</span>
        </div>
        <div className="dashboard-card">
          <span className="dashboard-card-value">
            {stats.totalTopupSum != null && stats.totalWithdrawSum != null
              ? formatCurrency(Number(stats.totalTopupSum) - Number(stats.totalWithdrawSum))
              : '—'}
          </span>
          <span className="dashboard-card-label">Net (SC)</span>
        </div>
      </div>

      {showPaymentsTotals && (
        <section className="dashboard-series dashboard-payments">
          <h3 className="dashboard-section-title">{paymentTotalsTitle}</h3>
          <p className="dashboard-payments-utc-note">
            Dates and times use your local timezone{adminTimeZone && adminTimeZone !== 'local' ? ` (${adminTimeZone})` : ''}.
            {' '}Manual = staff pays by hand. Automatic = provider pays.
            {' '}Completed fees use each store’s payin/payout % on completed amounts only.
          </p>
          <div className="dashboard-payments-filter-row">
            <label>
              Date from
              <input
                type="date"
                value={paymentsStartDate}
                onChange={(e) => {
                  const next = e.target.value
                  setPaymentsStartDate(next)
                  let nextEndDate = paymentsEndDate
                  if (paymentsEndDate && next && paymentsEndDate < next) {
                    nextEndDate = next
                    setPaymentsEndDate(next)
                  }
                  const endTimeMax = nextEndDate === todayStr ? currentTimeStr : '23:59'
                  const sameDay = next && nextEndDate === next
                  let nextEndTime = clampTimeStr(
                    paymentsEndTime,
                    sameDay ? paymentsStartTime : '00:00',
                    endTimeMax
                  )
                  if (sameDay && compareDateTime(next, paymentsStartTime, nextEndDate, nextEndTime) > 0) {
                    nextEndTime = paymentsStartTime
                  }
                  if (nextEndTime !== paymentsEndTime) setPaymentsEndTime(nextEndTime)
                }}
                max={paymentsEndDate && paymentsEndDate < todayStr ? paymentsEndDate : todayStr}
              />
            </label>
            <label>
              Date to
              <input
                type="date"
                value={paymentsEndDate}
                onChange={(e) => {
                  const next = e.target.value
                  setPaymentsEndDate(next)
                  if (paymentsStartDate && next && next < paymentsStartDate) setPaymentsStartDate(next)
                  const endTimeMax = next === todayStr ? currentTimeStr : '23:59'
                  const sameDay = paymentsStartDate && next && paymentsStartDate === next
                  let nextEndTime = clampTimeStr(
                    paymentsEndTime,
                    sameDay ? paymentsStartTime : '00:00',
                    endTimeMax
                  )
                  if (sameDay && compareDateTime(paymentsStartDate, paymentsStartTime, next, nextEndTime) > 0) {
                    nextEndTime = paymentsStartTime
                  }
                  setPaymentsEndTime(nextEndTime)
                }}
                min={paymentsStartDate || undefined}
                max={todayStr}
              />
            </label>
            <div className="dashboard-payments-time-group">
              <label>
                Start time
                <input
                  type="time"
                  value={paymentsStartTime}
                  onChange={(e) => {
                    const sameDay = paymentsStartDate && paymentsEndDate && paymentsStartDate === paymentsEndDate
                    const next = clampTimeStr(
                      e.target.value,
                      '00:00',
                      sameDay ? paymentsStartTimeMax : (paymentsStartDate === todayStr ? currentTimeStr : '23:59')
                    )
                    setPaymentsStartTime(next)
                    if (sameDay && compareDateTime(paymentsStartDate, next, paymentsEndDate, paymentsEndTime) > 0) {
                      setPaymentsEndTime(next)
                    }
                  }}
                  max={paymentsSameDay ? paymentsStartTimeMax : (paymentsStartDate === todayStr ? currentTimeStr : undefined)}
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  value={paymentsEndTime}
                  onChange={(e) => {
                    setPaymentsEndTime(clampTimeStr(e.target.value, paymentsEndTimeMin, paymentsEndTimeMax))
                  }}
                  onBlur={(e) => {
                    setPaymentsEndTime(clampTimeStr(e.target.value, paymentsEndTimeMin, paymentsEndTimeMax))
                  }}
                  min={paymentsEndTimeMin}
                  max={paymentsEndTimeMax}
                  aria-invalid={paymentsSameDay && paymentsEndTime < paymentsStartTime}
                />
              </label>
              {paymentsRangeInvalid && (
                <p className="dashboard-payments-time-error" role="alert">
                  {paymentsSameDay
                    ? 'End time cannot be before start time'
                    : 'End date/time must be on or after start date/time'}
                </p>
              )}
            </div>
            {showPaymentsStoreDropdown && (
              <label>
                Store
                <select
                  className="dashboard-payments-store-select"
                  value={paymentsStoreFilter}
                  onChange={(e) => setPaymentsStoreFilter(e.target.value)}
                >
                  <option value="">All stores</option>
                  {paymentTotalsStoreOptions.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              disabled={paymentsRangeInvalid}
              onClick={() => {
                if (paymentsRangeInvalid) {
                  toast.error('End date/time must be on or after start date/time')
                  return
                }
                setAppliedPaymentsStartDate(paymentsStartDate)
                setAppliedPaymentsEndDate(paymentsEndDate)
                setAppliedPaymentsStartTime(paymentsStartTime || defaultPaymentsStartTime)
                setAppliedPaymentsEndTime(paymentsEndTime || getDefaultEndTimeForDate(paymentsEndDate))
                setAppliedPaymentsStoreCode((paymentsStoreFilter || '').trim())
              }}
            >
              Apply filter
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              onClick={() => {
                const resetEndTime = getDefaultEndTimeForDate(todayRange.endDate)
                setPaymentsStartDate(todayRange.startDate)
                setPaymentsEndDate(todayRange.endDate)
                setPaymentsStartTime(defaultPaymentsStartTime)
                setPaymentsEndTime(resetEndTime)
                setAppliedPaymentsStartDate(todayRange.startDate)
                setAppliedPaymentsEndDate(todayRange.endDate)
                setAppliedPaymentsStartTime(defaultPaymentsStartTime)
                setAppliedPaymentsEndTime(resetEndTime)
                setPaymentsStoreFilter('')
                setAppliedPaymentsStoreCode('')
              }}
            >
              Reset
            </button>
          </div>
          <div className="dashboard-payments-block">
            <h4 className="dashboard-payments-block-title">Money in — Deposits</h4>
            <p className="dashboard-payments-block-hint">How players paid into the store</p>
            <div className="dashboard-payments-grid">
              <article className="dashboard-payments-card">
                <div className="dashboard-payments-card-head">
                  <h4>OrionStarPay</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-auto">Automatic</span>
                </div>
                <p className="dashboard-payments-card-sub">Card / Cash App / Apple Pay / Google Pay</p>
                <p><span>Completed</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.orionstarspay.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.orionstarspay.completedFee)}</strong></p>
                <p><span>Pending</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.orionstarspay.pendingAmount)}</strong></p>
              </article>
              <article className="dashboard-payments-card">
                <div className="dashboard-payments-card-head">
                  <h4>Chime</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-manual">Manual</span>
                </div>
                <p className="dashboard-payments-card-sub">Staff confirms payment by hand</p>
                <p><span>Completed</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.chime.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.chime.completedFee)}</strong></p>
                <p><span>Pending</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.chime.pendingAmount)}</strong></p>
              </article>
              <article className="dashboard-payments-card dashboard-payments-card-highlight">
                <div className="dashboard-payments-card-head">
                  <h4>Dpay</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-auto">Automatic</span>
                </div>
                <p className="dashboard-payments-card-sub">Cash App / Apple Pay / Google Pay</p>
                <p><span>Completed</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.dollarpay.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.dollarpay.completedFee)}</strong></p>
                <p><span>Waiting for payment</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.dollarpay.pendingAmount)}</strong></p>
              </article>
              <article className="dashboard-payments-card dashboard-payments-card-highlight">
                <div className="dashboard-payments-card-head">
                  <h4>Xpay</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-auto">Automatic</span>
                </div>
                <p className="dashboard-payments-card-sub">Cash App / Chime / Card / PayPal / Zelle</p>
                <p><span>Completed</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.xxpay.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.xxpay.completedFee)}</strong></p>
                <p><span>Waiting for payment</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.deposits.xxpay.pendingAmount)}</strong></p>
              </article>
            </div>
          </div>

          <div className="dashboard-payments-block">
            <h4 className="dashboard-payments-block-title">Money out — Withdrawals</h4>
            <p className="dashboard-payments-block-hint">How players cashed out. Manual = staff pays. Automatic = Dpay / Xpay pays after approve.</p>
            <div className="dashboard-payments-grid">
              <article className="dashboard-payments-card">
                <div className="dashboard-payments-card-head">
                  <h4>Chime</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-manual">Manual</span>
                </div>
                <p className="dashboard-payments-card-sub">Staff sends Chime by hand</p>
                <p><span>Completed</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.chime.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.chime.completedFee)}</strong></p>
                <p><span>Pending / Processing</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.chime.pendingAmount)}</strong></p>
              </article>
              <article className="dashboard-payments-card">
                <div className="dashboard-payments-card-head">
                  <h4>Cash App</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-manual">Manual</span>
                </div>
                <p className="dashboard-payments-card-sub">Staff sends Cash App by hand</p>
                <p><span>Completed</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.cashapp.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.cashapp.completedFee)}</strong></p>
                <p><span>Pending / Processing</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.cashapp.pendingAmount)}</strong></p>
              </article>
              <article className="dashboard-payments-card dashboard-payments-card-highlight">
                <div className="dashboard-payments-card-head">
                  <h4>Dpay</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-auto">Automatic</span>
                </div>
                <p className="dashboard-payments-card-sub">Paid automatically after approve</p>
                <p><span>Completed (total)</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.completedFee)}</strong></p>
                <p><span>Still waiting (total)</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.pendingAmount)}</strong></p>
                <div className="dashboard-payments-breakdown">
                  <p className="dashboard-payments-breakdown-title">By method (same totals split)</p>
                  <div className="dashboard-payments-method-row">
                    <span className="dashboard-payments-method-name">Chime</span>
                    <div className="dashboard-payments-method-amounts">
                      <p><span>Completed</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.chime.completedAmount)}</strong></p>
                      <p className="dashboard-payments-fee"><span>Fees</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.chime.completedFee)}</strong></p>
                      <p><span>Still waiting</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.chime.pendingAmount)}</strong></p>
                    </div>
                  </div>
                  <div className="dashboard-payments-method-row">
                    <span className="dashboard-payments-method-name">Cash App</span>
                    <div className="dashboard-payments-method-amounts">
                      <p><span>Completed</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.cashapp.completedAmount)}</strong></p>
                      <p className="dashboard-payments-fee"><span>Fees</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.cashapp.completedFee)}</strong></p>
                      <p><span>Still waiting</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.cashapp.pendingAmount)}</strong></p>
                    </div>
                  </div>
                  <div className="dashboard-payments-method-row">
                    <span className="dashboard-payments-method-name">PayPal</span>
                    <div className="dashboard-payments-method-amounts">
                      <p><span>Completed</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.paypal.completedAmount)}</strong></p>
                      <p className="dashboard-payments-fee"><span>Fees</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.paypal.completedFee)}</strong></p>
                      <p><span>Still waiting</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.dollarpay.paypal.pendingAmount)}</strong></p>
                    </div>
                  </div>
                </div>
              </article>
              <article className="dashboard-payments-card dashboard-payments-card-highlight">
                <div className="dashboard-payments-card-head">
                  <h4>Xpay</h4>
                  <span className="dashboard-payments-mode dashboard-payments-mode-auto">Automatic</span>
                </div>
                <p className="dashboard-payments-card-sub">Paid automatically after approve</p>
                <p><span>Completed (total)</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.xxpay.completedAmount)}</strong></p>
                <p className="dashboard-payments-fee"><span>Completed fees</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.xxpay.completedFee)}</strong></p>
                <p><span>Still waiting (total)</span><strong>{paymentsLoading ? 'Loading…' : formatCurrency(paymentsSummary.withdrawals.xxpay.pendingAmount)}</strong></p>
                <div className="dashboard-payments-breakdown">
                  <p className="dashboard-payments-breakdown-title">By method (same totals split)</p>
                  <div className="dashboard-payments-method-row">
                    <span className="dashboard-payments-method-name">Chime</span>
                    <div className="dashboard-payments-method-amounts">
                      <p><span>Completed</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.chime.completedAmount)}</strong></p>
                      <p className="dashboard-payments-fee"><span>Fees</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.chime.completedFee)}</strong></p>
                      <p><span>Still waiting</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.chime.pendingAmount)}</strong></p>
                    </div>
                  </div>
                  <div className="dashboard-payments-method-row">
                    <span className="dashboard-payments-method-name">Cash App</span>
                    <div className="dashboard-payments-method-amounts">
                      <p><span>Completed</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.cashapp.completedAmount)}</strong></p>
                      <p className="dashboard-payments-fee"><span>Fees</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.cashapp.completedFee)}</strong></p>
                      <p><span>Still waiting</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.cashapp.pendingAmount)}</strong></p>
                    </div>
                  </div>
                  <div className="dashboard-payments-method-row">
                    <span className="dashboard-payments-method-name">PayPal</span>
                    <div className="dashboard-payments-method-amounts">
                      <p><span>Completed</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.paypal.completedAmount)}</strong></p>
                      <p className="dashboard-payments-fee"><span>Fees</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.paypal.completedFee)}</strong></p>
                      <p><span>Still waiting</span><strong>{paymentsLoading ? '…' : formatCurrency(paymentsSummary.withdrawals.xxpay.paypal.pendingAmount)}</strong></p>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      )}

      {/* Date filter + Row 2: Range summary cards + charts */}
      <section className="dashboard-series">
        <h3 className="dashboard-section-title">Selected Range Summary</h3>
        <DateRangeFilter
          startDate={seriesDateFrom}
          endDate={seriesDateTo}
          onStartDateChange={showSeriesTimeFilter ? handleSeriesStartDateChange : setSeriesDateFrom}
          onEndDateChange={showSeriesTimeFilter ? handleSeriesEndDateChange : setSeriesDateTo}
          onPresetClick={showSeriesTimeFilter ? handleSeriesPresetClick : undefined}
        />
        {showSeriesTimeFilter && (
          <div className="dashboard-payments-filter-row dashboard-series-time-row">
            <p className="dashboard-series-time-note">
              Times use your local timezone{adminTimeZone && adminTimeZone !== 'local' ? ` (${adminTimeZone})` : ''}.
              Click Apply filter after changing times.
            </p>
            <div className="dashboard-payments-time-group">
              <label>
                Start time
                <input
                  type="time"
                  value={seriesStartTime}
                  onChange={(e) => {
                    const sameDay = seriesDateFrom && seriesDateTo && seriesDateFrom === seriesDateTo
                    const next = clampTimeStr(
                      e.target.value,
                      '00:00',
                      sameDay ? seriesStartTimeMax : (seriesDateFrom === todayStr ? currentTimeStr : '23:59')
                    )
                    setSeriesStartTime(next)
                    if (sameDay && compareDateTime(seriesDateFrom, next, seriesDateTo, seriesEndTime) > 0) {
                      setSeriesEndTime(next)
                    }
                  }}
                  max={seriesSameDay ? seriesStartTimeMax : (seriesDateFrom === todayStr ? currentTimeStr : undefined)}
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  value={seriesEndTime}
                  onChange={(e) => {
                    setSeriesEndTime(clampTimeStr(e.target.value, seriesEndTimeMin, seriesEndTimeMax))
                  }}
                  onBlur={(e) => {
                    setSeriesEndTime(clampTimeStr(e.target.value, seriesEndTimeMin, seriesEndTimeMax))
                  }}
                  min={seriesEndTimeMin}
                  max={seriesEndTimeMax}
                  aria-invalid={seriesSameDay && seriesEndTime < seriesStartTime}
                />
              </label>
              {seriesRangeInvalid && (
                <p className="dashboard-payments-time-error" role="alert">
                  {seriesSameDay
                    ? 'End time cannot be before start time'
                    : 'End date/time must be on or after start date/time'}
                </p>
              )}
            </div>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-primary"
              disabled={seriesRangeInvalid}
              onClick={() => {
                if (seriesRangeInvalid) {
                  toast.error('End date/time must be on or after start date/time')
                  return
                }
                setAppliedSeriesStartTime(seriesStartTime || defaultSeriesStartTime)
                setAppliedSeriesEndTime(seriesEndTime || getDefaultEndTimeForDate(seriesDateTo))
              }}
            >
              Apply filter
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-secondary"
              onClick={() => {
                const resetEndTime = getDefaultEndTimeForDate(seriesDateTo)
                setSeriesStartTime(defaultSeriesStartTime)
                setSeriesEndTime(resetEndTime)
                setAppliedSeriesStartTime(defaultSeriesStartTime)
                setAppliedSeriesEndTime(resetEndTime)
              }}
            >
              Reset
            </button>
          </div>
        )}
        <p className="dashboard-range-label">{formatDateRangeLabel(seriesDateFrom, seriesDateTo)}</p>
        {!seriesLoading && reportTotals && (
          <div className="dashboard-report-cards">
            <div className="dashboard-report-card dashboard-report-card-topup">
              <span className="dashboard-report-card-value">{Number(reportTotals.topup).toFixed(2)}</span>
              <span className="dashboard-report-card-label">Recharge (SC)</span>
              <span className="dashboard-report-card-sub">in selected period</span>
            </div>
            <div className="dashboard-report-card dashboard-report-card-withdraw">
              <span className="dashboard-report-card-value">{Number(reportTotals.withdraw).toFixed(2)}</span>
              <span className="dashboard-report-card-label">Withdraw (SC)</span>
              <span className="dashboard-report-card-sub">in selected period</span>
            </div>
            <div className="dashboard-report-card">
              <span className="dashboard-report-card-value">{reportTotals.txCount}</span>
              <span className="dashboard-report-card-label">Transactions Count</span>
              <span className="dashboard-report-card-sub">in selected period</span>
            </div>
            <div className="dashboard-report-card">
              <span className="dashboard-report-card-value">{Number(reportTotals.net).toFixed(2)}</span>
              <span className="dashboard-report-card-label">Net (SC)</span>
              <span className="dashboard-report-card-sub">in selected period</span>
            </div>
          </div>
        )}

        {/* Chart A: Recharge vs Withdraw (Daily) */}
        {!seriesLoading && overviewDailyData.length > 0 && (
          <div className="dashboard-charts">
            <TrendLineChart
              title="Recharge vs Withdraw (Daily)"
              data={overviewDailyData}
              xKey="date"
              lines={[
                { key: 'rechargeAmount', label: 'Recharge', color: TOPUP_COLOR },
                { key: 'withdrawAmount', label: 'Withdraw', color: WITHDRAW_COLOR }
              ]}
              yLabel="Amount (SC)"
            />
          </div>
        )}

        {/* Chart B: Transaction Totals */}
        {!seriesLoading && transactionTotalsData.length > 0 && (
          <div className="dashboard-charts dashboard-chart-bar-wrap">
            <SimpleBarChart
              title="Transaction Totals"
              data={transactionTotalsData}
              xKey="type"
              barKey="amount"
              yLabel="Amount (SC)"
              barColors={[TOPUP_COLOR, WITHDRAW_COLOR, '#f59e0b']}
            />
          </div>
        )}

        {/* Chart C: Top Stores by Recharge (platform / distributor admins) */}
        {showTopChart && (
          <div className="dashboard-charts">
            {topLoading && <p className="dashboard-series-loading">Loading top list…</p>}
            {!topLoading && topData.length > 0 && (
              <SimpleBarChart
                title="Top Stores by Recharge"
                data={topData}
                xKey="label"
                barKey="value"
                yLabel="Recharge Amount (SC)"
                xAxisLabel="Store"
                barColor={TOPUP_COLOR}
              />
            )}
          </div>
        )}

        {seriesLoading && <p className="dashboard-series-loading">Loading charts…</p>}

        {/* Optional: Signups + Topup + Withdraw breakdown (existing charts) */}
        {!seriesLoading && series && (
          <div className="dashboard-series-grid dashboard-series-three">
            <div className="dashboard-chart-wrap">
              <h4>User signups</h4>
              <ResponsiveContainer width="100%" height={280}>
                {useLineChart ? (
                  <LineChart data={series.dailySignups || []} margin={{ top: 36, right: 16, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : v)} label={{ value: 'Date', position: 'insideBottom', offset: -6, fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [v, name]} labelFormatter={(l) => (l ? `Date: ${l}` : '')} contentStyle={{ fontSize: 12 }} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                    <Line type="monotone" dataKey="count" stroke={SIGNUP_COLOR} strokeWidth={2} dot={{ r: 3 }} name="Signups" />
                  </LineChart>
                ) : (
                  <BarChart data={series.dailySignups || []} margin={{ top: 36, right: 16, left: 8, bottom: 40 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : v)} label={{ value: 'Date', position: 'insideBottom', offset: -6, fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [v, name]} labelFormatter={(l) => (l ? `Date: ${l}` : '')} contentStyle={{ fontSize: 12 }} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                    <Bar dataKey="count" fill={SIGNUP_COLOR} radius={[4, 4, 0, 0]} name="Signups" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="dashboard-chart-wrap">
              <h4>Topup (SC)</h4>
              <ResponsiveContainer width="100%" height={280}>
                {useLineChart ? (
                  <LineChart data={series.dailyTopup || []} margin={{ top: 36, right: 16, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : v)} label={{ value: 'Date', position: 'insideBottom', offset: -6, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v).toFixed(0)} label={{ value: 'Amount (SC)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [Number(v).toFixed(2) + ' SC', name]} labelFormatter={(l) => (l ? `Date: ${l}` : '')} contentStyle={{ fontSize: 12 }} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                    <Line type="monotone" dataKey="sum" stroke={TOPUP_COLOR} strokeWidth={2} dot={{ r: 3 }} name="Topup (SC)" />
                  </LineChart>
                ) : (
                  <BarChart data={series.dailyTopup || []} margin={{ top: 36, right: 16, left: 8, bottom: 40 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : v)} label={{ value: 'Date', position: 'insideBottom', offset: -6, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v).toFixed(0)} label={{ value: 'Amount (SC)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [Number(v).toFixed(2) + ' SC', name]} labelFormatter={(l) => (l ? `Date: ${l}` : '')} contentStyle={{ fontSize: 12 }} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                    <Bar dataKey="sum" fill={TOPUP_COLOR} radius={[4, 4, 0, 0]} name="Topup (SC)" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="dashboard-chart-wrap">
              <h4>Withdraw (SC)</h4>
              <ResponsiveContainer width="100%" height={280}>
                {useLineChart ? (
                  <LineChart data={series.dailyWithdraw || []} margin={{ top: 36, right: 16, left: 8, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : v)} label={{ value: 'Date', position: 'insideBottom', offset: -6, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v).toFixed(0)} label={{ value: 'Amount (SC)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [Number(v).toFixed(2) + ' SC', name]} labelFormatter={(l) => (l ? `Date: ${l}` : '')} contentStyle={{ fontSize: 12 }} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                    <Line type="monotone" dataKey="sum" stroke={WITHDRAW_COLOR} strokeWidth={2} dot={{ r: 3 }} name="Withdraw (SC)" />
                  </LineChart>
                ) : (
                  <BarChart data={series.dailyWithdraw || []} margin={{ top: 36, right: 16, left: 8, bottom: 40 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => (v ? v.slice(5) : v)} label={{ value: 'Date', position: 'insideBottom', offset: -6, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Number(v).toFixed(0)} label={{ value: 'Amount (SC)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' }, fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [Number(v).toFixed(2) + ' SC', name]} labelFormatter={(l) => (l ? `Date: ${l}` : '')} contentStyle={{ fontSize: 12 }} />
                    <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                    <Bar dataKey="sum" fill={WITHDRAW_COLOR} radius={[4, 4, 0, 0]} name="Withdraw (SC)" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
