import { useCallback, useEffect, useMemo, useState } from 'react'
import * as welcomeSignupBonusApi from '../api/welcomeSignupBonus'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './WalletLimits.css'
import './WelcomeSignupBonus.css'
import './StoreFeatures.css'
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

function Switch({ id, checked, disabled, onChange }) {
  return (
    <label
      className="pp-switch"
      htmlFor={id}
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

export default function ActivateBonusModal() {
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState(null)
  const [stores, setStores] = useState([])
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await welcomeSignupBonusApi.listWelcomeSignupBonusStores()
      setStores(Array.isArray(data?.stores) ? data.stores : [])
    } catch (err) {
      toast.error(err.message || 'Unable to load this page.')
      setStores([])
    } finally {
      setLoading(false)
    }
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
      const payload = { requireDepositToActivateBonus: nextEnabled === true }
      if (isMasterAdmin) {
        payload.storeCode = store.storeCode
        if (store.distributorCode != null) payload.distributorCode = store.distributorCode
      }
      const updated = await welcomeSignupBonusApi.updateActivateBonusModal(payload)
      setStores((prev) =>
        prev.map((row) =>
          storeKey(row) === key
            ? {
                ...row,
                requireDepositToActivateBonus: updated.requireDepositToActivateBonus !== false,
                updatedAt: updated.updatedAt || row.updatedAt,
                updatedBy: updated.updatedBy || row.updatedBy
              }
            : row
        )
      )
      toast.success(
        nextEnabled
          ? `Popup is ON for ${store.storeCode}`
          : `Popup is OFF for ${store.storeCode}`
      )
    } catch (err) {
      toast.error(err.message || 'Could not save. Please try again.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="wallet-limits-page welcome-signup-bonus-page store-features-page">
      <header className="wallet-limits-header store-features-header">
        <h1 className="store-features-title">Activate bonus popup</h1>
        <p className="store-features-hint">
          This popup asks a player to buy a package before they can play, if they already got a
          welcome bonus or a refer bonus.
          <br />
          <strong>On</strong> = show the popup.&nbsp;
          <strong>Off</strong> = hide the popup and let them play without buying first.
          {isMasterAdmin ? ' Use the switch for each store.' : ' This applies to your store only.'}
        </p>
      </header>

      <div className="wsb-toolbar">
        {isMasterAdmin ? (
          <label className="wl-field">
            <span>Search stores</span>
            <input
              type="search"
              placeholder="Store name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        ) : null}
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
                <th>Show popup</th>
                <th>Last changed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={3} className="wsb-empty">
                    No stores found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const key = storeKey(s)
                  const saving = savingKey === key
                  const on = s.requireDepositToActivateBonus !== false
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{s.storeCode || '—'}</strong>
                        {s.username ? <span className="wl-muted"> · {s.username}</span> : null}
                        {s.isActive === false ? (
                          <span className="wl-pill wl-pill--default">Inactive</span>
                        ) : null}
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
                            id={`activate-bonus-modal-${key}`}
                            checked={on}
                            disabled={saving}
                            onChange={(next) => handleToggle(s, next)}
                          />
                          <span className="wl-muted">{saving ? 'Saving…' : on ? 'On' : 'Off'}</span>
                        </div>
                      </td>
                      <td>
                        <div>{formatUpdatedAt(s.updatedAt)}</div>
                        {s.updatedBy ? (
                          <span className="wl-muted">by {s.updatedBy}</span>
                        ) : (
                          <span className="wl-muted">Not changed yet (default On)</span>
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
