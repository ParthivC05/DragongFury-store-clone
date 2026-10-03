import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDirectCryptoTreasury, getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { formatTransactionDateTime } from '../utils/dateRange'
import DateRangeFilter from '../components/DateRangeFilter'
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
  return `SC ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCrypto(amount, currency) {
  const v = Number(amount)
  if (!Number.isFinite(v)) return '—'
  const decimals = currency === 'BTC' || currency === 'ETH' ? 8 : currency === 'SOL' ? 9 : 6
  const text = v.toFixed(decimals).replace(/\.?0+$/, '')
  return `${text} ${currency || ''}`.trim()
}

function formatUsd(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortAddress(address) {
  const value = String(address || '')
  if (value.length <= 18) return value || '—'
  return `${value.slice(0, 8)}…${value.slice(-6)}`
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

function WalletCard({ item, toast }) {
  const missing = !item?.address
  return (
    <article className={`dct-wallet-card${missing ? ' is-missing' : ''}`}>
      <div className="dct-wallet-top">
        <div className="dct-coin">
          <span className={`dct-coin-badge ${String(item.currency || '').toLowerCase()}`}>
            {item.currency}
          </span>
          <div>
            <div className="dct-coin-name">{item.name || item.currency}</div>
            <div className="dct-coin-sub">Central receive address</div>
          </div>
        </div>
      </div>

      <div className="dct-balance-block">
        <div className="dct-balance-main">
          {missing ? 'Not configured' : formatCrypto(item.balance, item.currency)}
        </div>
        {!missing ? (
          <>
            <div className="dct-balance-usd">{formatUsd(item.balanceUsd)}</div>
            {item.usdRate != null ? (
              <div className="dct-balance-rate">1 {item.currency} ≈ {formatUsd(item.usdRate)}</div>
            ) : null}
          </>
        ) : (
          <div className="dct-balance-rate">Add METAMASK_{item.currency}_ADDRESS in API env</div>
        )}
      </div>

      <div className="dct-address-box">
        <p className="dct-address-label">Wallet address</p>
        <p className="dct-address">{item.address || '—'}</p>
      </div>

      {!missing ? (
        <div className="dct-wallet-actions">
          <button type="button" className="dct-link-btn" onClick={() => copyText(item.address, toast)}>
            Copy address
          </button>
          {item.explorerAddressUrl ? (
            <a className="dct-link" href={item.explorerAddressUrl} target="_blank" rel="noreferrer">
              Explorer
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default function DirectCryptoTreasury() {
  const { user } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [currency, setCurrency] = useState('')
  const [storeCode, setStoreCode] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [storeOptions, setStoreOptions] = useState([])
  const canFilterStore = user?.role === ROLES.MASTER_ADMIN || user?.role === ROLES.DISTRIBUTOR_ADMIN

  useEffect(() => {
    if (!canFilterStore) return
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((res) => {
        const rows = Array.isArray(res?.list) ? res.list : Array.isArray(res) ? res : []
        const codes = [...new Set(rows.map((s) => String(s?.storeCode || '').trim()).filter(Boolean))].sort()
        setStoreOptions(codes)
      })
      .catch(() => setStoreOptions([]))
  }, [canFilterStore])

  const load = useCallback(() => {
    setLoading(true)
    const params = { page, limit: 25, status, currency }
    if (canFilterStore && storeCode) params.storeCode = storeCode
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    getDirectCryptoTreasury(params)
      .then((res) => setData(res || null))
      .catch((err) => {
        toast.error(err.message || 'Failed to load Crypto wallet')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [page, status, currency, storeCode, startDate, endDate, canFilterStore, toast])

  useEffect(() => {
    load()
  }, [load])

  const guide = data?.withdrawGuide
  const totals = data?.totalsByCurrency || []
  const wallets = data?.receiveAddresses || []
  const list = data?.list || []
  const counts = data?.statusCounts || {}
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit || 25)))
  const colSpan = user?.role !== ROLES.STORE_ADMIN ? 10 : 9

  return (
    <div className="dct-page">
      <header className="dct-header">
        <div className="dct-header-copy">
          <h1>Crypto wallet</h1>
          <p>
            One receive address per coin. Live balances are shown with USD at the current rate.
            The table shows each player deposit and whether SC was credited.
          </p>
        </div>
        <div className="dct-header-actions">
          {data?.walletUsdTotal != null ? (
            <div className="dct-total-card is-highlight" style={{ minWidth: 160 }}>
              <p className="label">Wallet total</p>
              <p className="value">{formatUsd(data.walletUsdTotal)}</p>
              <p className="meta">Across BTC · ETH · TRX · SOL</p>
            </div>
          ) : null}
          <button type="button" className="dct-btn dct-btn-primary" onClick={() => load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {!data?.configured ? (
        <div className="dct-warning">
          No receive address is configured. Set METAMASK_BTC_ADDRESS, METAMASK_ETH_ADDRESS,
          METAMASK_TRX_ADDRESS, and METAMASK_SOL_ADDRESS on the API server.
        </div>
      ) : null}

      <section className="dct-section" aria-label="Deposit status">
        <div className="dct-section-title">
          <h2>Deposit status</h2>
          <span>All Direct Crypto on-chain deposits</span>
        </div>
        <div className="dct-status-grid">
          <article className="dct-status-card is-pending">
            <strong>{counts.pending || 0}</strong>
            <span>Pending</span>
          </article>
          <article className="dct-status-card is-confirming">
            <strong>{counts.confirming || 0}</strong>
            <span>Confirming</span>
          </article>
          <article className="dct-status-card is-completed">
            <strong>{counts.completed || 0}</strong>
            <span>Completed</span>
          </article>
          <article className="dct-status-card is-expired">
            <strong>{counts.expired || 0}</strong>
            <span>Expired</span>
          </article>
          <article className="dct-status-card is-failed">
            <strong>{counts.failed || 0}</strong>
            <span>Failed</span>
          </article>
        </div>
      </section>

      <section className="dct-section" aria-label="Wallet balances">
        <div className="dct-section-title">
          <h2>Wallet balances</h2>
          <span>{data?.balancesLoaded ? 'Live on-chain balances' : 'Balances not loaded'}</span>
        </div>
        <div className="dct-wallet-grid">
          {wallets.length ? wallets.map((item) => (
            <WalletCard key={item.currency} item={item} toast={toast} />
          )) : (
            <article className="dct-wallet-card is-missing">
              <div className="dct-balance-main">{loading ? 'Loading wallets…' : 'No wallets found'}</div>
            </article>
          )}
        </div>
      </section>

      <section className="dct-section" aria-label="Completed totals">
        <div className="dct-section-title">
          <h2>Completed deposits</h2>
          <span>Crypto received and SC credited</span>
        </div>
        <div className="dct-totals-grid">
          {totals.length === 0 ? (
            <article className="dct-total-card">
              <p className="label">No completed deposits</p>
              <p className="value">—</p>
              <p className="meta">Completed player payments will show here</p>
            </article>
          ) : totals.map((t) => (
            <article key={t.currency} className="dct-total-card">
              <p className="label">{t.currency} received</p>
              <p className="value">{formatCrypto(t.cryptoTotal, t.currency)}</p>
              <p className="usd">{formatUsd(t.cryptoUsd)}</p>
              <p className="meta">
                {t.depositCount} deposit{t.depositCount === 1 ? '' : 's'} · {formatSc(t.scTotal)} credited
              </p>
            </article>
          ))}
        </div>
      </section>

      {guide ? (
        <section className="dct-help">
          <h2>How this wallet works</h2>
          <p>{guide.summary}</p>
          <ol>
            {(guide.steps || []).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.note ? <p className="dct-help-note">{guide.note}</p> : null}
        </section>
      ) : null}

      <section className="dct-section" aria-label="Deposit history">
        <div className="dct-section-title">
          <h2>Deposit history</h2>
          <span>{total} matching deposit{total === 1 ? '' : 's'}</span>
        </div>

        <div className="dct-toolbar">
          {canFilterStore ? (
            <label className="dct-field">
              Store
              <select
                value={storeCode}
                onChange={(e) => { setPage(1); setStoreCode(e.target.value) }}
              >
                <option value="">All stores</option>
                {storeOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="dct-field">
            Status
            <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value) }}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="dct-field">
            Coin
            <select value={currency} onChange={(e) => { setPage(1); setCurrency(e.target.value) }}>
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <div className="dct-field dct-field-dates">
            <span>Date</span>
            <DateRangeFilter
              embedded
              label=""
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={(v) => { setPage(1); setStartDate(v) }}
              onEndDateChange={(v) => { setPage(1); setEndDate(v) }}
              onPresetClick={(range) => {
                setPage(1)
                setStartDate(range.startDate)
                setEndDate(range.endDate)
              }}
            />
          </div>
          <button type="button" className="dct-btn" onClick={() => load()} disabled={loading}>
            {loading ? 'Loading…' : 'Apply'}
          </button>
        </div>

        <div className="dct-table-wrap">
          <table className="dct-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>User</th>
                {user?.role !== ROLES.STORE_ADMIN ? <th>Store</th> : null}
                <th>SC</th>
                <th>Crypto</th>
                <th>USD</th>
                <th>From</th>
                <th>Receive</th>
                <th>Status</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {loading && list.length === 0 ? (
                <tr><td colSpan={colSpan}>Loading…</td></tr>
              ) : null}
              {!loading && list.length === 0 ? (
                <tr><td colSpan={colSpan}>No deposits match these filters.</td></tr>
              ) : null}
              {list.map((row) => (
                <tr key={row.id}>
                  <td>{formatTransactionDateTime(row.createdAt)}</td>
                  <td>
                    <div>{row.username || `User #${row.userId}`}</div>
                    <div className="dct-muted">#{row.userId}</div>
                  </td>
                  {user?.role !== ROLES.STORE_ADMIN ? (
                    <td>{row.storeCode || '—'}</td>
                  ) : null}
                  <td>{formatSc(row.scAmount)}</td>
                  <td>
                    <div>{formatCrypto(row.cryptoAmount, row.currency)}</div>
                    <div className="dct-muted">{row.networkLabel || row.currency}</div>
                  </td>
                  <td>{formatUsd(row.cryptoUsd)}</td>
                  <td title={row.fromAddress || ''}>
                    {row.fromAddress ? shortAddress(row.fromAddress) : '—'}
                  </td>
                  <td>
                    {row.walletAddress ? (
                      <>
                        <div title={row.walletAddress}>{shortAddress(row.walletAddress)}</div>
                        <button
                          type="button"
                          className="dct-link-btn"
                          style={{ marginTop: 4 }}
                          onClick={() => copyText(row.walletAddress, toast)}
                        >
                          Copy
                        </button>
                      </>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`dct-badge ${row.status || 'pending'}`}>{row.status || 'pending'}</span>
                  </td>
                  <td>
                    {row.explorerTxUrl ? (
                      <a href={row.explorerTxUrl} target="_blank" rel="noreferrer">View</a>
                    ) : row.txHash ? shortAddress(row.txHash) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="dct-pagination">
            <button type="button" className="dct-btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>Page {page} of {totalPages} ({total} total)</span>
            <button type="button" className="dct-btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
