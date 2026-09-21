import { useEffect, useState } from 'react'
import { getDepositRequests, getWithdrawalRequests, getPaymentTotalsStoreCodes } from '../api/admin'
import { useToast } from '../context/ToastContext'
import {
  getPresetRange,
  PRESETS,
  getTodayDateStr,
  getCurrentTimeStr,
  getDefaultEndTimeForDate,
  getAdminTimeZone,
  compareDateTime,
  clampTimeStr
} from '../utils/dateRange'
import { formatCurrency } from '../utils/format'
import '../pages/Dashboard.css'

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

const todayRange = getPresetRange(PRESETS.TODAY)
const defaultPaymentsStartTime = '00:00'
const defaultPaymentsEndTime = getDefaultEndTimeForDate(todayRange.endDate)

function emptySummary() {
  return {
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
  }
}

/**
 * Same Payment totals block as the super admin dashboard.
 */
export default function PaymentTotalsSection({
  enabled = false,
  showStoreDropdown = false,
  title = 'Payment totals (All stores)'
}) {
  const toast = useToast()
  const todayStr = getTodayDateStr()
  const currentTimeStr = getCurrentTimeStr()
  const adminTimeZone = getAdminTimeZone()

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
  const [paymentsSummary, setPaymentsSummary] = useState(emptySummary)

  const displayTitle = appliedPaymentsStoreCode
    ? `Payment totals (${appliedPaymentsStoreCode})`
    : title

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

  useEffect(() => {
    if (!showStoreDropdown) {
      setPaymentTotalsStoreOptions([])
      return
    }
    getPaymentTotalsStoreCodes()
      .then((res) => {
        const list = res?.storeCodes
        setPaymentTotalsStoreOptions(Array.isArray(list) ? list : [])
      })
      .catch(() => setPaymentTotalsStoreOptions([]))
  }, [showStoreDropdown])

  useEffect(() => {
    if (!enabled) return
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
      .catch(() => setPaymentsSummary(emptySummary()))
      .finally(() => setPaymentsLoading(false))
  }, [
    enabled,
    appliedPaymentsStartDate,
    appliedPaymentsEndDate,
    appliedPaymentsStartTime,
    appliedPaymentsEndTime,
    appliedPaymentsStoreCode
  ])

  if (!enabled) return null

  return (
    <section className="dashboard-series dashboard-payments">
      <h3 className="dashboard-section-title">{displayTitle}</h3>
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
        {showStoreDropdown && (
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
  )
}
