import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDiditKycSettings, updateDiditKycSettings } from '../api/admin'
import { useToast } from '../context/ToastContext'
import './WalletLimits.css'
import './WelcomeSignupBonus.css'
import './ChimeCashappWithdrawals.css'
import './DiditKyc.css'
import './PaymentProviders.css'

function storeKey(s) {
  return `${s.distributorCode || ''}|${s.storeCode || ''}`
}

function formatUpdatedAt(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function Switch({ id, checked, disabled, onChange, title }) {
  return (
    <label
      className="pp-switch"
      htmlFor={id}
      title={title}
      style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
    >
      <input
        id={id}
        type="checkbox"
        className="pp-switch__input"
        checked={!!checked}
        disabled={!!disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="pp-switch__slider" />
    </label>
  )
}

export default function DiditKyc() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState(null)
  const [stores, setStores] = useState([])
  const [meta, setMeta] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    getDiditKycSettings()
      .then((res) => {
        setStores(Array.isArray(res?.stores) ? res.stores : [])
        setMeta(res || null)
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load KYC Config settings')
        setStores([])
        setMeta(null)
      })
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return stores
    return stores.filter((s) => {
      const hay = [s.storeCode, s.distributorCode, s.username, s.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [stores, search])

  async function handleToggle(store, nextEnabled) {
    if (!store?.configured || store.locked) {
      toast.error('KYC is not configured for this store yet.')
      return
    }
    const key = storeKey(store)
    setSavingKey(key)
    try {
      const res = await updateDiditKycSettings({
        storeCode: store.storeCode,
        distributorCode: store.distributorCode,
        enabled: nextEnabled
      })
      setStores(Array.isArray(res?.stores) ? res.stores : [])
      setMeta(res || null)
      toast.success(
        nextEnabled
          ? `KYC enabled for ${store.storeCode}`
          : `KYC disabled for ${store.storeCode}`
      )
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="wallet-limits-page welcome-signup-bonus-page store-features-page didit-kyc-page">
      <header className="wallet-limits-header store-features-header">
        <h1 className="store-features-title">KYC Config</h1>
        <p className="store-features-hint">
          Require Didit identity verification before withdraw — same flow for every store. Toggle On
          per store below. View player results on the{' '}
          <Link to="/kyc-report" className="br-user-link">
            KYC report
          </Link>{' '}
          page.
        </p>
      </header>

      {!loading && meta ? (
        <div className="dash-panel" style={{ maxWidth: 640, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <div className="store-features-hint" style={{ lineHeight: 1.5, margin: 0 }}>
            <div>API key: {meta.hasApiKey ? 'configured' : 'missing'}</div>
            <div>Workflow ID: {meta.hasWorkflowId ? 'configured' : 'missing'}</div>
            <div>Webhook secret: {meta.hasWebhookSecret ? 'configured' : 'missing'}</div>
            <div>Didit ready: {meta.configured ? 'yes' : 'no — set env vars and restart API'}</div>
            <div>
              Provisioned stores (<code>KYC_STORE_CODES</code>):{' '}
              {meta.enforcedStores ? meta.enforcedStores : 'all stores'}
            </div>
            {meta.apiBaseUrl ? <div>API base: {meta.apiBaseUrl}</div> : null}
            <p style={{ margin: '0.75rem 0 0' }}>
              Webhook: <code>/api/webhooks/didit</code> · subscribe to <code>status.updated</code>
            </p>
          </div>
        </div>
      ) : null}

      <div className="wsb-toolbar">
        <label className="wl-field">
          <span>Search stores</span>
          <input
            type="search"
            placeholder="Store code, distributor, username, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button type="button" className="wsb-refresh" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="wallet-limits-loading">Loading…</p>
      ) : (
        <div className="wl-table-wrap">
          <table className="wl-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Distributor</th>
                <th>Status</th>
                <th>KYC required</th>
                <th>Last changed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="wsb-empty">
                    No stores found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const key = storeKey(s)
                  const saving = savingKey === key
                  const locked = s.locked === true || s.configured === false
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{s.storeCode || '—'}</strong>
                        {s.username ? <span className="wl-muted"> · {s.username}</span> : null}
                        {s.isActive === false ? (
                          <span className="wl-pill wl-pill--default">Inactive</span>
                        ) : null}
                      </td>
                      <td>{s.distributorCode || '—'}</td>
                      <td>
                        {locked ? (
                          <span className="wl-pill wl-pill--default">Not configured yet</span>
                        ) : (
                          <span className="wl-pill wl-pill--override">Configured</span>
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.55rem'
                          }}
                        >
                          <Switch
                            id={`didit-kyc-${key}`}
                            checked={s.enabled === true}
                            disabled={locked || saving}
                            title={
                              locked
                                ? 'Didit KYC is not provisioned for this store yet'
                                : s.enabled
                                  ? 'Disable KYC for this store'
                                  : 'Enable KYC for this store'
                            }
                            onChange={(next) => handleToggle(s, next)}
                          />
                          <span className="wl-muted">
                            {locked ? 'Locked' : s.enabled ? 'On' : 'Off'}
                          </span>
                        </div>
                      </td>
                      <td>
                        {locked ? (
                          <span className="wl-muted">—</span>
                        ) : (
                          <>
                            <div>{formatUpdatedAt(s.updatedAt)}</div>
                            {s.updatedBy ? (
                              <span className="wl-muted">by {s.updatedBy}</span>
                            ) : s.hasOverride === false && s.enabled ? (
                              <span className="wl-muted">Inherited (global default)</span>
                            ) : (
                              <span className="wl-muted">—</span>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
