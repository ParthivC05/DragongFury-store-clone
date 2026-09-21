import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAdminStoreTransactionFees,
  getAdminTransactionFees,
  updateAdminTransactionFees,
  resetAdminTransactionFees
} from '../api/admin'
import { useToast } from '../context/ToastContext'
import './WalletLimits.css'
import './WelcomeSignupBonus.css'
import './TransactionFees.css'

function storeKey(s) {
  return `${String(s.distributorCode || '').trim().toLowerCase()}|${String(s.storeCode || '').trim().toLowerCase()}`
}

function toInputValue(n) {
  if (n == null || n === '') return ''
  const v = Number(n)
  return Number.isFinite(v) ? String(v) : ''
}

export default function TransactionFees() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [savingPlatform, setSavingPlatform] = useState(false)
  const [savingKey, setSavingKey] = useState(null)

  const [platformPayin, setPlatformPayin] = useState('0')
  const [platformPayout, setPlatformPayout] = useState('0')
  const [stores, setStores] = useState([])
  const [drafts, setDrafts] = useState({})
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [platform, storeData] = await Promise.all([
        getAdminTransactionFees(),
        getAdminStoreTransactionFees()
      ])
      setPlatformPayin(toInputValue(platform?.payinPercent ?? storeData?.platformPayinPercent ?? 0))
      setPlatformPayout(toInputValue(platform?.payoutPercent ?? storeData?.platformPayoutPercent ?? 0))
      const list = Array.isArray(storeData?.stores) ? storeData.stores : []
      const seen = new Set()
      const unique = []
      for (const s of list) {
        const key = storeKey(s)
        if (!s?.storeCode || seen.has(key)) continue
        seen.add(key)
        unique.push(s)
      }
      setStores(unique)
      const nextDrafts = {}
      list.forEach((s) => {
        nextDrafts[storeKey(s)] = {
          payinPercent: toInputValue(s.payinPercent),
          payoutPercent: toInputValue(s.payoutPercent)
        }
      })
      setDrafts(nextDrafts)
    } catch (err) {
      toast.error(err.message || 'Failed to load transaction fees')
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

  function updateDraft(key, field, value) {
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        payinPercent: prev[key]?.payinPercent ?? '',
        payoutPercent: prev[key]?.payoutPercent ?? '',
        [field]: value
      }
    }))
  }

  async function savePlatform(e) {
    e.preventDefault()
    const payin = Number(platformPayin)
    const payout = Number(platformPayout)
    if (!Number.isFinite(payin) || payin < 0 || payin > 100 || !Number.isFinite(payout) || payout < 0 || payout > 100) {
      toast.error('Platform fees must be numbers between 0 and 100.')
      return
    }
    setSavingPlatform(true)
    try {
      await updateAdminTransactionFees({ payinPercent: payin, payoutPercent: payout })
      toast.success('Platform default fees saved')
      await load()
    } catch (err) {
      toast.error(err.message || 'Failed to save platform fees')
    } finally {
      setSavingPlatform(false)
    }
  }

  async function saveStore(store) {
    const key = storeKey(store)
    const draft = drafts[key] || {}
    const payin = Number(draft.payinPercent)
    const payout = Number(draft.payoutPercent)
    if (!Number.isFinite(payin) || payin < 0 || payin > 100 || !Number.isFinite(payout) || payout < 0 || payout > 100) {
      toast.error('Store fees must be numbers between 0 and 100.')
      return
    }
    setSavingKey(key)
    try {
      await updateAdminTransactionFees({
        distributorCode: store.distributorCode,
        storeCode: store.storeCode,
        payinPercent: payin,
        payoutPercent: payout
      })
      toast.success(`Fees saved for ${store.storeCode}`)
      await load()
    } catch (err) {
      toast.error(err.message || 'Failed to save store fees')
    } finally {
      setSavingKey(null)
    }
  }

  async function resetStore(store) {
    const key = storeKey(store)
    setSavingKey(key)
    try {
      await resetAdminTransactionFees({
        distributorCode: store.distributorCode,
        storeCode: store.storeCode
      })
      toast.success(`${store.storeCode} now uses platform default fees`)
      await load()
    } catch (err) {
      toast.error(err.message || 'Failed to reset store fees')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="wallet-limits-page welcome-signup-bonus-page transaction-fees-page">
      <header className="wallet-limits-header">
        <h1>Transaction fees</h1>
        <p>
          Super admin and technical staff can set a <strong>payin</strong> and <strong>payout</strong> fee
          for each store. Fees apply only to <strong>completed</strong> deposits and withdrawals (admin side).
          Example: 10% on a 100 SC completed payin counts as 10 SC fee. Players are not charged extra.
        </p>
      </header>

      <form className="wl-card" onSubmit={savePlatform}>
        <div className="wl-card-head">
          <span className="wl-badge">Platform</span>
          <h2>Default fees for all stores</h2>
          <p>
            Used when a store has no own override. Set both to 0 for no fee until you configure a store.
          </p>
        </div>
        <div className="wl-grid-2">
          <label className="wl-field">
            <span>Payin fee (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={platformPayin}
              onChange={(e) => setPlatformPayin(e.target.value)}
            />
          </label>
          <label className="wl-field">
            <span>Payout fee (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={platformPayout}
              onChange={(e) => setPlatformPayout(e.target.value)}
            />
          </label>
        </div>
        <div className="wl-actions">
          <button type="submit" disabled={savingPlatform || loading}>
            {savingPlatform ? 'Saving…' : 'Save platform fees'}
          </button>
        </div>
      </form>

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
        <p className="wallet-limits-loading">Loading stores…</p>
      ) : (
        <div className="wl-table-wrap">
          <table className="wl-table tf-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Distributor</th>
                <th>Payin %</th>
                <th>Payout %</th>
                <th>Source</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="wsb-empty">
                    No stores found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const key = storeKey(s)
                  const draft = drafts[key] || { payinPercent: '', payoutPercent: '' }
                  const saving = savingKey === key
                  return (
                    <tr key={key}>
                      <td>
                        <strong>{s.storeCode || '—'}</strong>
                        {s.isActive === false ? (
                          <span className="wl-pill wl-pill--default">Inactive</span>
                        ) : null}
                      </td>
                      <td>{s.distributorCode || '—'}</td>
                      <td>
                        <input
                          className="tf-input"
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={draft.payinPercent}
                          onChange={(e) => updateDraft(key, 'payinPercent', e.target.value)}
                          aria-label={`Payin fee for ${s.storeCode}`}
                        />
                      </td>
                      <td>
                        <input
                          className="tf-input"
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          value={draft.payoutPercent}
                          onChange={(e) => updateDraft(key, 'payoutPercent', e.target.value)}
                          aria-label={`Payout fee for ${s.storeCode}`}
                        />
                      </td>
                      <td>
                        <span className={`wl-pill ${s.hasStoreOverride ? 'wl-pill--override' : 'wl-pill--default'}`}>
                          {s.hasStoreOverride ? 'Store override' : 'Platform default'}
                        </span>
                      </td>
                      <td>
                        <div className="tf-row-actions">
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-primary"
                            disabled={saving}
                            onClick={() => saveStore(s)}
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-sm admin-btn-secondary"
                            disabled={saving || !s.hasStoreOverride}
                            onClick={() => resetStore(s)}
                          >
                            Use default
                          </button>
                        </div>
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
