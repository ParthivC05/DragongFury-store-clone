import { useState, useEffect, useCallback, useMemo } from 'react'
import * as depositBonusesApi from '../api/depositBonuses'
import { getStores } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './StoreFeatures.css'
import './DepositBonuses.css'

const inputClass = 'store-features-input'

const TIER_META = [
  { n: 1, label: '1st deposit', emoji: '🥇', hint: 'First time they add money' },
  { n: 2, label: '2nd deposit', emoji: '🥈', hint: 'Second top-up' },
  { n: 3, label: '3rd deposit', emoji: '🥉', hint: 'Third top-up' }
]

function defaultTiers() {
  return [
    { deposit_number: 1, enabled: true, bonus_type: 'percentage', bonus_value: '10', min_trigger_amount: '0', max_bonus_cap: '', title: '1st Deposit Bonus' },
    { deposit_number: 2, enabled: true, bonus_type: 'percentage', bonus_value: '30', min_trigger_amount: '0', max_bonus_cap: '', title: '2nd Deposit Bonus' },
    { deposit_number: 3, enabled: true, bonus_type: 'percentage', bonus_value: '70', min_trigger_amount: '0', max_bonus_cap: '', title: '3rd Deposit Bonus' }
  ]
}

function normalizeTiersFromApi(tiers) {
  const list = Array.isArray(tiers) ? tiers : []
  return [1, 2, 3].map((n, i) => {
    const row = list.find((t) => Number(t.deposit_number) === n) || defaultTiers()[i]
    return {
      deposit_number: n,
      enabled: row.enabled !== false,
      bonus_type: row.bonus_type === 'fixed' ? 'fixed' : 'percentage',
      bonus_value: row.bonus_value != null ? String(row.bonus_value) : '',
      min_trigger_amount: row.min_trigger_amount != null ? String(row.min_trigger_amount) : '0',
      max_bonus_cap: row.max_bonus_cap != null && row.max_bonus_cap !== '' ? String(row.max_bonus_cap) : '',
      title: row.title || defaultTiers()[i].title
    }
  })
}

function formatBonusPreview(tier) {
  if (!tier?.enabled) return 'Off'
  const val = Number(tier.bonus_value) || 0
  if (tier.bonus_type === 'percentage') return `${val}% extra`
  return `${val} SC bonus`
}

function normalizeStoreRow(s) {
  const code = String(s?.storeCode || s?.store_code || '').trim()
  const email = String(s?.email || '').trim()
  const username = String(s?.username || '').trim()
  const label = code || username || email || 'Unknown store'
  const sub = [email, username].filter(Boolean).join(' · ')
  return { code: code.toLowerCase(), label: code || label, sub, raw: s }
}

export default function DepositBonuses() {
  const { user } = useAuth()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN
  const toast = useToast()
  const { confirm } = useConfirm()

  const [loading, setLoading] = useState(true)
  const [storesLoading, setStoresLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [expiryHours, setExpiryHours] = useState(24)
  const [storeScope, setStoreScope] = useState('all')
  const [storeCodes, setStoreCodes] = useState([])
  const [storeSearch, setStoreSearch] = useState('')
  const [tiers, setTiers] = useState(defaultTiers)
  const [storeOptions, setStoreOptions] = useState([])

  const loadSettings = useCallback(async () => {
    const data = await depositBonusesApi.getDepositBonusSettings()
    setEnabled(data?.enabled !== false)
    setExpiryHours(Math.max(1, Number(data?.expiry_hours) || 24))
    const allStores = data?.apply_to_all_stores !== false
    setStoreScope(allStores ? 'all' : 'selected')
    setStoreCodes(Array.isArray(data?.store_codes) ? data.store_codes.map((c) => String(c).toLowerCase()) : [])
    setTiers(normalizeTiersFromApi(data?.tiers))
    return data
  }, [])

  const loadStores = useCallback(async () => {
    if (!isMasterAdmin) {
      setStoreOptions([])
      return
    }
    setStoresLoading(true)
    try {
      const storesRes = await getStores({ limit: 100, sortBy: 'storeCode', sortOrder: 'ASC' })
      const rows = Array.isArray(storesRes?.list) ? storesRes.list : []
      const unique = new Map()
      rows.forEach((row) => {
        const norm = normalizeStoreRow(row)
        if (norm.code && !unique.has(norm.code)) unique.set(norm.code, norm)
      })
      setStoreOptions([...unique.values()].sort((a, b) => a.label.localeCompare(b.label)))
    } catch {
      setStoreOptions([])
      toast.error('Could not load store list. Store selection may be unavailable.')
    } finally {
      setStoresLoading(false)
    }
  }, [isMasterAdmin, toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([loadSettings(), loadStores()])
    } catch (err) {
      toast.error(err.message || 'Failed to load settings.')
      setTiers(defaultTiers())
    } finally {
      setLoading(false)
    }
  }, [loadSettings, loadStores, toast])

  useEffect(() => {
    load()
  }, [load])

  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    if (!q) return storeOptions
    return storeOptions.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.code.includes(q) ||
        (s.sub && s.sub.toLowerCase().includes(q))
    )
  }, [storeOptions, storeSearch])

  const selectedStoreLabels = useMemo(() => {
    if (storeScope === 'all') return ['All stores']
    return storeCodes
      .map((code) => storeOptions.find((s) => s.code === code)?.label || code)
      .filter(Boolean)
  }, [storeScope, storeCodes, storeOptions])

  const updateTier = (index, patch) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  }

  const toggleStoreCode = (code) => {
    const norm = String(code || '').trim().toLowerCase()
    if (!norm) return
    setStoreCodes((prev) => (prev.includes(norm) ? prev.filter((c) => c !== norm) : [...prev, norm]))
  }

  const selectAllVisibleStores = () => {
    const codes = filteredStores.map((s) => s.code).filter(Boolean)
    setStoreCodes((prev) => [...new Set([...prev, ...codes])])
  }

  const clearStoreSelection = () => setStoreCodes([])

  const handleSave = async (e) => {
    e.preventDefault()
    if (isMasterAdmin && storeScope === 'selected' && storeCodes.length === 0) {
      toast.error('Please select at least one store, or choose “All stores”.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        enabled,
        expiry_hours: Math.max(1, Math.min(168, parseInt(expiryHours, 10) || 24)),
        tiers: tiers.map((t) => ({
          deposit_number: t.deposit_number,
          enabled: t.enabled,
          bonus_type: t.bonus_type,
          bonus_value: Number(t.bonus_value) || 0,
          min_trigger_amount: Number(t.min_trigger_amount) || 0,
          max_bonus_cap: t.max_bonus_cap !== '' ? Number(t.max_bonus_cap) : null,
          title: t.title
        }))
      }
      if (isMasterAdmin) {
        payload.apply_to_all_stores = storeScope === 'all'
        payload.store_codes = storeScope === 'all' ? [] : storeCodes
      }
      await depositBonusesApi.updateDepositBonusSettings(payload)
      toast.success('Deposit bonus settings saved.')
      await loadSettings()
    } catch (err) {
      toast.error(err.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset to default?',
      message: 'Reset deposit bonus settings to platform default for your store?',
      confirmLabel: 'Reset to default',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    setResetting(true)
    try {
      await depositBonusesApi.resetDepositBonusSettingsToDefault()
      await load()
      toast.success('Settings reset to platform default.')
    } catch (err) {
      toast.error(err.message || 'Failed to reset.')
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="store-features-page deposit-bonuses-page">
        <p className="store-features-note">Loading deposit bonus settings…</p>
      </div>
    )
  }

  return (
    <div className="store-features-page deposit-bonuses-page">
      <h2>New user deposit bonuses</h2>
      <p className="store-features-intro deposit-bonuses-intro">
        {isMasterAdmin &&
          'Reward brand-new players with extra balance on their first three deposits. You control the percentages, time limit, and which stores get the offer.'}
        {isStoreAdmin &&
          `Set deposit bonuses for your store (${user?.storeCode || 'your store'}). These override the platform default for your players only.`}
      </p>

      <div className="deposit-bonuses-summary" role="status">
        <div className="deposit-bonuses-summary-head">
          <span className={`deposit-bonuses-status ${enabled ? 'deposit-bonuses-status--on' : 'deposit-bonuses-status--off'}`}>
            {enabled ? 'Offer is ON' : 'Offer is OFF'}
          </span>
          <span className="deposit-bonuses-summary-window">
            New users have <strong>{expiryHours} hours</strong> after signup to use all three bonuses
          </span>
        </div>
        <div className="deposit-bonuses-summary-tiers">
          {TIER_META.map((meta, i) => (
            <div key={meta.n} className="deposit-bonuses-summary-tier">
              <span className="deposit-bonuses-summary-tier-emoji" aria-hidden>{meta.emoji}</span>
              <span className="deposit-bonuses-summary-tier-label">{meta.label}</span>
              <strong className="deposit-bonuses-summary-tier-value">{formatBonusPreview(tiers[i])}</strong>
            </div>
          ))}
        </div>
        {isMasterAdmin && (
          <p className="deposit-bonuses-summary-stores">
            <strong>Stores:</strong>{' '}
            {selectedStoreLabels.length ? selectedStoreLabels.join(', ') : 'None selected'}
          </p>
        )}
      </div>

      <div className="spin-wheel-guide-wrap">
        <button
          type="button"
          className="spin-wheel-guide-toggle"
          onClick={() => setGuideOpen((v) => !v)}
          aria-expanded={guideOpen}
        >
          <span className="spin-wheel-guide-toggle-icon" aria-hidden>{guideOpen ? '▾' : '▸'}</span>
          <span>{guideOpen ? 'Hide simple guide' : 'How does this work? (simple guide)'}</span>
        </button>
        {guideOpen && (
          <div className="spin-wheel-guide deposit-bonuses-guide" role="region">
            <p><strong>Who qualifies?</strong> Only players who just signed up and have not finished all three bonus deposits yet.</p>
            <p><strong>Time limit:</strong> They must make deposits within the hours you set (default 24h) from account creation.</p>
            <p><strong>Example:</strong> 1st deposit $100 with 10% bonus → player gets $10 extra. 2nd deposit 30% → $30 extra on that deposit, and so on.</p>
            <p><strong>Stores:</strong> Choose all stores, or pick specific stores only. Store admins can set their own version for their store.</p>
          </div>
        )}
      </div>

      <form className="store-features-form deposit-bonuses-form" onSubmit={handleSave}>
        <section className="deposit-bonuses-section spin-wheel-card">
          <h3 className="deposit-bonuses-section-title">Step 1 — Turn the offer on or off</h3>
          <label className="deposit-bonuses-switch-card">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>
              <strong>Enable welcome deposit bonuses</strong>
              <small>When off, new users will not receive these extra deposit rewards.</small>
            </span>
          </label>
        </section>

        <section className="deposit-bonuses-section spin-wheel-card">
          <h3 className="deposit-bonuses-section-title">Step 2 — How long is the offer valid?</h3>
          <div className="store-features-field">
            <label htmlFor="expiry-hours">Hours after signup</label>
            <input
              id="expiry-hours"
              type="number"
              min={1}
              max={168}
              className={inputClass}
              value={expiryHours}
              onChange={(e) => setExpiryHours(e.target.value)}
            />
            <p className="store-features-hint">Usually 24 hours. Maximum 168 hours (7 days).</p>
          </div>
        </section>

        {isMasterAdmin && (
          <section className="deposit-bonuses-section spin-wheel-card deposit-bonuses-stores-section">
            <h3 className="deposit-bonuses-section-title">Step 3 — Which stores get this offer?</h3>
            <div className="deposit-bonuses-scope-options">
              <label className={`deposit-bonuses-scope-card ${storeScope === 'all' ? 'deposit-bonuses-scope-card--active' : ''}`}>
                <input
                  type="radio"
                  name="storeScope"
                  value="all"
                  checked={storeScope === 'all'}
                  onChange={() => setStoreScope('all')}
                />
                <span>
                  <strong>All stores</strong>
                  <small>Every store on the platform uses these bonus rules.</small>
                </span>
              </label>
              <label className={`deposit-bonuses-scope-card ${storeScope === 'selected' ? 'deposit-bonuses-scope-card--active' : ''}`}>
                <input
                  type="radio"
                  name="storeScope"
                  value="selected"
                  checked={storeScope === 'selected'}
                  onChange={() => setStoreScope('selected')}
                />
                <span>
                  <strong>Selected stores only</strong>
                  <small>Only ticked stores below will run this offer.</small>
                </span>
              </label>
            </div>

            {storeScope === 'selected' && (
              <div className="deposit-bonuses-store-picker">
                <div className="deposit-bonuses-store-toolbar">
                  <input
                    type="search"
                    className={inputClass}
                    placeholder="Search stores by code or email…"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    aria-label="Search stores"
                  />
                  <button type="button" className="store-features-btn-secondary" onClick={selectAllVisibleStores}>
                    Select visible
                  </button>
                  <button type="button" className="store-features-btn-secondary" onClick={clearStoreSelection}>
                    Clear all
                  </button>
                </div>
                <p className="deposit-bonuses-store-count">
                  {storesLoading
                    ? 'Loading stores…'
                    : `${storeCodes.length} selected · ${storeOptions.length} stores available`}
                </p>
                {storeOptions.length === 0 && !storesLoading ? (
                  <p className="store-features-hint deposit-bonuses-store-empty">
                    No stores found. Check that stores exist under <strong>Stores</strong> in the admin menu.
                  </p>
                ) : (
                  <div className="deposit-bonuses-store-list">
                    {filteredStores.map((s) => (
                      <label key={s.code} className={`deposit-bonuses-store-item ${storeCodes.includes(s.code) ? 'deposit-bonuses-store-item--selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={storeCodes.includes(s.code)}
                          onChange={() => toggleStoreCode(s.code)}
                        />
                        <span className="deposit-bonuses-store-item-text">
                          <strong>{s.label}</strong>
                          {s.sub ? <small>{s.sub}</small> : null}
                        </span>
                      </label>
                    ))}
                    {filteredStores.length === 0 && (
                      <p className="store-features-hint">No stores match your search.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="deposit-bonuses-section">
          <h3 className="deposit-bonuses-section-title">
            {isMasterAdmin ? 'Step 4' : 'Step 3'} — Set bonus for each deposit
          </h3>
          <p className="store-features-hint deposit-bonuses-tier-intro">
            Most stores use <strong>percentage</strong> bonuses (e.g. 10%, 30%, 70%). Leave “Maximum bonus” empty for no limit.
          </p>
          <div className="deposit-bonuses-tiers">
            {tiers.map((tier, index) => {
              const meta = TIER_META[index]
              return (
                <article key={tier.deposit_number} className="deposit-bonuses-tier-card">
                  <header className="deposit-bonuses-tier-header">
                    <span className="deposit-bonuses-tier-emoji" aria-hidden>{meta.emoji}</span>
                    <div>
                      <h4>{meta.label}</h4>
                      <p>{meta.hint}</p>
                    </div>
                    <label className="deposit-bonuses-tier-toggle">
                      <input
                        type="checkbox"
                        checked={tier.enabled}
                        onChange={(e) => updateTier(index, { enabled: e.target.checked })}
                      />
                      <span>{tier.enabled ? 'On' : 'Off'}</span>
                    </label>
                  </header>

                  <div className="deposit-bonuses-tier-preview">
                    Player gets <strong>{formatBonusPreview(tier)}</strong> on this deposit
                  </div>

                  <div className="deposit-bonuses-tier-fields">
                    <div className="store-features-field">
                      <label>Bonus style</label>
                      <div className="deposit-bonuses-radio-row">
                        <label>
                          <input
                            type="radio"
                            name={`bonus-type-${tier.deposit_number}`}
                            checked={tier.bonus_type === 'percentage'}
                            onChange={() => updateTier(index, { bonus_type: 'percentage' })}
                          />
                          Percentage (%)
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`bonus-type-${tier.deposit_number}`}
                            checked={tier.bonus_type === 'fixed'}
                            onChange={() => updateTier(index, { bonus_type: 'fixed' })}
                          />
                          Fixed SC amount
                        </label>
                      </div>
                    </div>
                    <div className="store-features-field">
                      <label>{tier.bonus_type === 'percentage' ? 'Bonus percent (%)' : 'Bonus amount (SC)'}</label>
                      <input
                        type="number"
                        min={0}
                        className={`${inputClass} deposit-bonuses-tier-value-input`}
                        value={tier.bonus_value}
                        onChange={(e) => updateTier(index, { bonus_value: e.target.value })}
                      />
                    </div>
                    <div className="store-features-field">
                      <label>Minimum deposit (SC)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        value={tier.min_trigger_amount}
                        onChange={(e) => updateTier(index, { min_trigger_amount: e.target.value })}
                      />
                      <p className="store-features-hint">Use 0 to allow any deposit size.</p>
                    </div>
                    <div className="store-features-field">
                      <label>Maximum bonus (SC)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        placeholder="No limit"
                        value={tier.max_bonus_cap}
                        onChange={(e) => updateTier(index, { max_bonus_cap: e.target.value })}
                      />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <div className="deposit-bonuses-actions">
          <button type="submit" className="store-features-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {isStoreAdmin && (
            <button type="button" className="store-features-btn-secondary" onClick={handleReset} disabled={resetting}>
              {resetting ? 'Resetting…' : 'Reset to platform default'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
