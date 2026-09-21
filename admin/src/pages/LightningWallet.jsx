import { useCallback, useEffect, useState } from 'react'
import { getLightningWallet } from '../api/admin'
import { useToast } from '../context/ToastContext'
import './ChimeCashappWithdrawals.css'
import './LightningWallet.css'

function formatUsd(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatBtc(value) {
  if (value == null || !Number.isFinite(Number(value))) return '0 BTC'
  const n = Number(value)
  const raw = n.toFixed(8).replace(/\.?0+$/, '')
  return `${raw || '0'} BTC`
}

function formatSats(value) {
  const n = Math.max(0, Math.round(Number(value) || 0))
  return `${n.toLocaleString('en-US')} sats`
}

function AmountBlock({ label, bundle, hint }) {
  const usd = bundle?.usd
  const btc = bundle?.btc
  const sats = bundle?.sats
  return (
    <article className="lnw-card">
      <h3 className="lnw-card-label">{label}</h3>
      <p className="lnw-card-usd">{formatUsd(usd)}</p>
      <p className="lnw-card-crypto">{formatBtc(btc)}</p>
      <p className="lnw-card-sats">{formatSats(sats)}</p>
      {hint ? <p className="lnw-card-hint">{hint}</p> : null}
    </article>
  )
}

export default function LightningWallet() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    getLightningWallet()
      .then((res) => setData(res || null))
      .catch((err) => {
        toast.error(err.message || 'Failed to load Lightning wallet')
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const total = data?.total || { sats: 0, btc: 0, usd: null }

  return (
    <div className="ccw-page lnw-page">
      <header className="ccw-header">
        <h1 className="ccw-title">Lightning wallet</h1>
        <p className="ccw-subtitle">
          Shared company Lightning node for Direct Crypto (all stores). This is not player SC. Refresh anytime — you
          do not need to type commands on the server.
        </p>
      </header>

      <div className="ccw-toolbar">
        <button type="button" className="ccw-select" onClick={() => load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {data?.usdPerBtc ? (
          <span className="lnw-rate">BTC ≈ {formatUsd(data.usdPerBtc)}</span>
        ) : null}
      </div>

      {loading && !data ? (
        <p className="ccw-loading">Loading Lightning balance…</p>
      ) : !data?.configured ? (
        <p className="lnw-banner lnw-banner--warn">{data?.message || 'Lightning is not configured on this API.'}</p>
      ) : !data?.unlocked ? (
        <p className="lnw-banner lnw-banner--warn">{data?.message || 'Lightning wallet is locked.'}</p>
      ) : (
        <>
          <section className="lnw-hero" aria-live="polite">
            <p className="lnw-hero-label">Total in this wallet</p>
            <p className="lnw-hero-usd">{formatUsd(total.usd)}</p>
            <p className="lnw-hero-crypto">
              {formatBtc(total.btc)}
              <span aria-hidden> · </span>
              {formatSats(total.sats)}
            </p>
            <p className="lnw-status">
              {data.syncedToChain ? 'Synced to Bitcoin' : 'Still catching up to Bitcoin'}
              {data.alias ? ` · ${data.alias}` : ''}
            </p>
          </section>

          <div className="lnw-grid">
            <AmountBlock
              label="Lightning (yours)"
              bundle={data.lightning?.local}
              hint="Player Lightning deposits land here."
            />
            <AmountBlock
              label="On-chain BTC"
              bundle={data.onchain?.total}
              hint="Bitcoin sitting on the node, not in a channel yet."
            />
            <AmountBlock
              label="Inbound room"
              bundle={data.lightning?.inbound}
              hint="How much more players can pay before the channel is full."
            />
          </div>
        </>
      )}
    </div>
  )
}
