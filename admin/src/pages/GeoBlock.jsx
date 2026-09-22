import { useCallback, useEffect, useMemo, useState } from 'react'
import { getGeoBlockSettings, updateGeoBlockSettings } from '../api/admin'
import { useToast } from '../context/ToastContext'
import './WalletLimits.css'
import './WelcomeSignupBonus.css'
import './StoreFeatures.css'
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
      className={`pp-switch${checked ? ' pp-switch--on' : ''}`}
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

export default function GeoBlock() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState(null)
  const [stores, setStores] = useState([])
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    getGeoBlockSettings()
      .then((res) => {
        setStores(Array.isArray(res?.stores) ? res.stores : [])
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load geo blocking settings')
        setStores([])
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
    const key = storeKey(store)
    setSavingKey(key)
    try {
      const res = await updateGeoBlockSettings({
        storeCode: store.storeCode,
        distributorCode: store.distributorCode,
        enabled: nextEnabled
      })
      setStores(Array.isArray(res?.stores) ? res.stores : [])
      toast.success(
        nextEnabled
          ? `Geo blocking enabled for ${store.storeCode}`
          : `Geo blocking disabled for ${store.storeCode}`
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
        <h1 className="store-features-title">Geo blocking</h1>
        <p className="store-features-hint">
          Turn location checks on or off for each store. When Off, that store’s user site skips the
          country and VPN check. When On, visitors in an allowed region are let in even if a VPN is
          flagged. A VPN outside an allowed region still sees the VPN Detected screen.
        </p>
      </header>

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
                <th>Geo blocking</th>
                <th>Last changed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="wsb-empty">
                    No stores found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const key = storeKey(s)
                  const saving = savingKey === key
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
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.55rem'
                          }}
                        >
                          <Switch
                            id={`geo-block-${key}`}
                            checked={s.enabled !== false}
                            disabled={saving}
                            title={
                              s.enabled !== false
                                ? 'Turn geo blocking off for this store'
                                : 'Turn geo blocking on for this store'
                            }
                            onChange={(next) => handleToggle(s, next)}
                          />
                          <span className="wl-muted">{s.enabled !== false ? 'On' : 'Off'}</span>
                        </div>
                      </td>
                      <td>
                        <div>{formatUpdatedAt(s.updatedAt)}</div>
                        {s.updatedBy ? (
                          <span className="wl-muted">by {s.updatedBy}</span>
                        ) : (
                          <span className="wl-muted">Default On</span>
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
