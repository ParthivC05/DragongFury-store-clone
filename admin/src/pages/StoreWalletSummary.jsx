import { useCallback, useEffect, useState } from 'react'
import { getStoreWalletSummary } from '../api/admin'
import { useToast } from '../context/ToastContext'
import DateRangeFilter from '../components/DateRangeFilter'
import { getDefaultDateRange } from '../utils/dateRange'
import { formatCurrency } from '../utils/format'
import './ChimeCashappWithdrawals.css'
import './StoreWalletSummary.css'

const defaultRange = getDefaultDateRange()

export default function StoreWalletSummary() {
  const toast = useToast()
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    getStoreWalletSummary({ startDate, endDate })
      .then((data) => {
        setRows(Array.isArray(data?.rows) ? data.rows : [])
        setTotals(data?.totals || null)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load store wallet summary')
        setRows([])
        setTotals(null)
      })
      .finally(() => setLoading(false))
  }, [startDate, endDate, toast])

  useEffect(() => {
    load()
  }, [load])

  const t = totals || {
    walletDeposit: 0,
    walletWithdraw: 0,
    chimeWithdraw: 0,
    cashappWithdraw: 0,
    totalWithdraw: 0,
    net: 0
  }

  return (
    <div className="ccw-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Store wallet summary</h1>
        <p className="ccw-subtitle">
          Wallet topups and withdrawals per store for the selected period, plus completed Chime and Cash App manual
          withdrawals. Net is topups minus all outflows shown.
        </p>
      </header>

      <div className="ccw-toolbar">
        <DateRangeFilter
          label="Period"
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <button type="button" className="ccw-select" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <p className="ccw-loading">Loading…</p>
      ) : (
        <div className="ccw-table-wrap">
          <table className="ccw-table">
            <thead>
              <tr>
                <th>Distributor</th>
                <th>Store</th>
                <th className="ccw-th-amount">Wallet topup</th>
                <th className="ccw-th-amount">Wallet withdraw</th>
                <th className="ccw-th-amount">Chime withdraw</th>
                <th className="ccw-th-amount">Cash App withdraw</th>
                <th className="ccw-th-amount">Total out</th>
                <th className="ccw-th-amount">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="ccw-empty">
                    No stores found.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.distributorCode}|${r.storeCode}`}>
                    <td>{r.distributorCode}</td>
                    <td>{r.storeCode}</td>
                    <td className="ccw-td-amount">{formatCurrency(r.walletDeposit)}</td>
                    <td className="ccw-td-amount">{formatCurrency(r.walletWithdraw)}</td>
                    <td className="ccw-td-amount">{formatCurrency(r.chimeWithdraw)}</td>
                    <td className="ccw-td-amount">{formatCurrency(r.cashappWithdraw)}</td>
                    <td className="ccw-td-amount">{formatCurrency(r.totalWithdraw)}</td>
                    <td className="ccw-td-amount sws-net">{formatCurrency(r.net)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="sws-tfoot-row">
                  <td colSpan={2}>
                    <strong>Totals</strong>
                  </td>
                  <td className="ccw-td-amount">{formatCurrency(t.walletDeposit)}</td>
                  <td className="ccw-td-amount">{formatCurrency(t.walletWithdraw)}</td>
                  <td className="ccw-td-amount">{formatCurrency(t.chimeWithdraw)}</td>
                  <td className="ccw-td-amount">{formatCurrency(t.cashappWithdraw)}</td>
                  <td className="ccw-td-amount">{formatCurrency(t.totalWithdraw)}</td>
                  <td className="ccw-td-amount sws-net">{formatCurrency(t.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
