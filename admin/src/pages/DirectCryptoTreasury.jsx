import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDirectCryptoTreasury } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { formatTransactionDateTime } from '../utils/dateRange'
import './ChimeCashappWithdrawals.css'
import './DirectCryptoTreasury.css'

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirming', label: 'Confirming' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' }
]

const CURRENCY_OPTIONS = [
  { value: '', label: 'All coins' },
  { value: 'BTC', label: 'BTC' },
  { value: 'ETH', label: 'ETH' },
  { value: 'TRX', label: 'TRX' },
  { value: 'SOL', label: 'SOL' }
]

function formatSc(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `SC ${v.toFixed(2)}`
}

function formatCrypto(amount, currency) {
  const v = Number(amount)
  if (!Number.isFinite(v)) return '—'
  const decimals = currency === 'BTC' || currency === 'ETH' ? 8 : currency === 'SOL' ? 9 : 6
  return `${v.toFixed(decimals).replace(/\.?0+$/, '')} ${currency || ''}`.trim()
}

async function copyText(text, toast) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  } catch {
    toast.error('Could not copy')
  }
}

export default function DirectCryptoTreasury() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('completed')
  const [currency, setCurrency] = useState('')
  const [refreshBalances, setRefreshBalances] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit: 25, status, currency, refreshBalances: refreshBalances ? 'true' : 'false' }
    getDirectCryptoTreasury(params)
      .then((res) => setData(res || null))
      .catch((err) => {
        toast.error(err.message || 'Failed to load Direct Crypto treasury')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [page, status, currency, refreshBalances, toast])

  useEffect(() => {
    load()
  }, [load])

  const guide = data?.withdrawGuide
  const totals = data?.totalsByCurrency || []
  const list = data?.list || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit || 25)))

  return (
    <div className="ccw-page dct-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Direct Crypto treasury</h1>
        <p className="ccw-subtitle">
          Real crypto that players sent on-chain (BTC, ETH, TRX, SOL). This is not player SC and not Lightning.
          Each row shows who paid, how much, and the wallet address where the coins still sit.
        </p>
      </header>

      {!data?.configured ? (
        <div className="dct-warning">
          Direct Crypto is not fully configured (missing company seed in server env). Deposits may not work until
          SELFCRYPTO_MNEMONIC is set on the API server.
        </div>
      ) : null}

      <section className="dct-summary" aria-label="Totals by coin">
        {totals.length === 0 ? (
          <article className="dct-card">
            <p className="dct-card-label">No completed on-chain deposits yet</p>
            <p className="dct-card-crypto">—</p>
          </article>
        ) : (
          totals.map((t) => (
            <article key={t.currency} className="dct-card">
              <p className="dct-card-label">{t.currency} received</p>
              <p className="dct-card-crypto">{formatCrypto(t.cryptoTotal, t.currency)}</p>
              <p className="dct-card-meta">
                {t.depositCount} deposit{t.depositCount === 1 ? '' : 's'} · {formatSc(t.scTotal)} credited to players
              </p>
            </article>
          ))
        )}
        {data?.uniqueAddresses ? (
          <article className="dct-card">
            <p className="dct-card-label">Receive addresses</p>
            <p className="dct-card-crypto">{data.uniqueAddresses}</p>
            <p className="dct-card-meta">Unique addresses with completed deposits</p>
          </article>
        ) : null}
      </section>

      {guide ? (
        <section className="dct-withdraw">
          <h2>How to withdraw this crypto</h2>
          <p>{guide.summary}</p>
          <ol>
            {(guide.steps || []).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.note ? <p className="dct-withdraw-note">{guide.note}</p> : null}
        </section>
      ) : null}

      <div className="ccw-toolbar">
        <label className="ccw-field">
          Status
          <select className="ccw-select" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="ccw-field">
          Coin
          <select className="ccw-select" value={currency} onChange={(e) => { setPage(1); setCurrency(e.target.value) }}>
            {CURRENCY_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="ccw-field ccw-field-checkbox">
          <input
            type="checkbox"
            checked={refreshBalances}
            onChange={(e) => setRefreshBalances(e.target.checked)}
          />
          Check on-chain balance (slower)
        </label>
        <button type="button" className="ccw-select" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="dct-table-wrap">
        <table className="ccw-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              {user?.role !== ROLES.STORE_ADMIN ? <th>Store</th> : null}
              <th>SC credited</th>
              <th>Crypto sent</th>
              <th>Network</th>
              <th>Receive address</th>
              <th>Status</th>
              <th>Transaction</th>
              {refreshBalances ? <th>On-chain</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading && list.length === 0 ? (
              <tr><td colSpan={refreshBalances ? 10 : 9}>Loading…</td></tr>
            ) : null}
            {!loading && list.length === 0 ? (
              <tr><td colSpan={refreshBalances ? 10 : 9}>No deposits match these filters.</td></tr>
            ) : null}
            {list.map((row) => (
              <tr key={row.id}>
                <td>{formatTransactionDateTime(row.createdAt)}</td>
                <td>
                  <div>{row.username || `User #${row.userId}`}</div>
                  <div className="ccw-muted">#{row.userId}</div>
                </td>
                {user?.role !== ROLES.STORE_ADMIN ? (
                  <td>{row.storeCode || '—'}</td>
                ) : null}
                <td>{formatSc(row.scAmount)}</td>
                <td>{formatCrypto(row.cryptoAmount, row.currency)}</td>
                <td>{row.networkLabel || row.currency}</td>
                <td>
                  {row.walletAddress ? (
                    <>
                      <span className="dct-address">{row.walletAddress}</span>
                      <button type="button" className="dct-copy ccw-link-btn" onClick={() => copyText(row.walletAddress, toast)}>
                        Copy
                      </button>
                      {row.explorerAddressUrl ? (
                        <a className="dct-copy" href={row.explorerAddressUrl} target="_blank" rel="noreferrer">
                          Explorer
                        </a>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className={`dct-badge ${row.status || 'pending'}`}>{row.status || 'pending'}</span>
                </td>
                <td>
                  {row.explorerTxUrl ? (
                    <a href={row.explorerTxUrl} target="_blank" rel="noreferrer">View tx</a>
                  ) : row.txHash ? (
                    <span className="dct-address">{row.txHash.slice(0, 12)}…</span>
                  ) : (
                    '—'
                  )}
                </td>
                {refreshBalances ? (
                  <td>
                    {row.onChainBalance != null
                      ? formatCrypto(row.onChainBalance, row.currency)
                      : row.status === 'completed' ? '—' : 'n/a'}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="ccw-pagination">
          <button type="button" className="ccw-select" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button type="button" className="ccw-select" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
