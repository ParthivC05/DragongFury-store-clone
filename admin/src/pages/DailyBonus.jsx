import { useCallback, useEffect, useMemo, useState } from 'react'
import * as dailyBonusApi from '../api/dailyBonus'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './WalletLimits.css'
import './WelcomeSignupBonus.css'
import './DailyBonus.css'

const REWARD_TYPES = [
  { value: 'sc_coins', label: 'SC coins' },
  { value: 'bonus_spin', label: 'Spin wheel (extra Daily Spin)' },
  { value: 'discount_voucher', label: 'Discount voucher' }
]

function storeKey(s) {
  return `${s.distributorCode || ''}|${s.storeCode || ''}`
}

function toDraft(store) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const src = (store.days || []).find((d) => Number(d.dayIndex) === i + 1) || {}
    return {
      dayIndex: i + 1,
      rewardType: src.rewardType || 'sc_coins',
      amountSc: src.amountSc != null ? String(src.amountSc) : '5',
      spinCount: src.spinCount != null ? String(src.spinCount) : '1',
      percentOff: src.percentOff != null ? String(src.percentOff) : '10',
      packageScope: src.packageScope || 'all',
      packageIds: Array.isArray(src.packageIds) ? src.packageIds.map(Number) : [],
      label: src.label || `Day ${i + 1}`
    }
  })
  return {
    enabled: store.enabled === true,
    repeatAfterComplete: store.repeatAfterComplete === true,
    days
  }
}

function formatUpdatedAt(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

export default function DailyBonus() {
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState(null)
  const [draft, setDraft] = useState(null)
  const [packages, setPackages] = useState([])
  const [saving, setSaving] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await dailyBonusApi.listDailyBonusStores()
      const list = Array.isArray(data?.stores) ? data.stores : []
      setStores(list)
      if (!selectedKey && list.length) {
        const first = list[0]
        setSelectedKey(storeKey(first))
        setDraft(toDraft(first))
      } else if (selectedKey) {
        const current = list.find((s) => storeKey(s) === selectedKey)
        if (current) setDraft(toDraft(current))
      }
    } catch (err) {
      toast.error(err.message || 'Unable to load daily bonus settings.')
    } finally {
      setLoading(false)
    }
  }, [toast, selectedKey])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const selectedStore = useMemo(
    () => stores.find((s) => storeKey(s) === selectedKey) || null,
    [stores, selectedKey]
  )

  const loadPackages = useCallback(async (store) => {
    if (!store?.storeCode) {
      setPackages([])
      return
    }
    setLoadingPackages(true)
    try {
      const data = await dailyBonusApi.listDailyBonusPackages({
        storeCode: store.storeCode,
        distributorCode: store.distributorCode
      })
      setPackages(Array.isArray(data?.packages) ? data.packages : [])
    } catch (err) {
      toast.error(err.message || 'Unable to load packages.')
      setPackages([])
    } finally {
      setLoadingPackages(false)
    }
  }, [toast])

  useEffect(() => {
    if (selectedStore) loadPackages(selectedStore)
  }, [selectedStore, loadPackages])

  function selectStore(store) {
    setSelectedKey(storeKey(store))
    setDraft(toDraft(store))
  }

  function updateDay(dayIndex, patch) {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        days: prev.days.map((d) => (d.dayIndex === dayIndex ? { ...d, ...patch } : d))
      }
    })
  }

  async function handleSave() {
    if (!selectedStore || !draft) return
    setSaving(true)
    try {
      const payload = {
        storeCode: selectedStore.storeCode,
        distributorCode: selectedStore.distributorCode,
        enabled: draft.enabled === true,
        repeatAfterComplete: draft.repeatAfterComplete === true,
        days: draft.days.map((d) => ({
          dayIndex: d.dayIndex,
          rewardType: d.rewardType,
          amountSc: Number(d.amountSc),
          spinCount: Number(d.spinCount),
          percentOff: Number(d.percentOff),
          packageScope: d.packageScope,
          packageIds: d.packageIds,
          label: d.label
        }))
      }
      const updated = await dailyBonusApi.updateDailyBonusStore(payload)
      toast.success('Daily bonus settings saved.')
      setStores((prev) =>
        prev.map((s) =>
          storeKey(s) === storeKey(selectedStore)
            ? {
                ...s,
                enabled: updated.enabled,
                repeatAfterComplete: updated.repeatAfterComplete === true,
                days: updated.days,
                hasOverride: true,
                updatedBy: updated.updatedBy,
                updatedAt: updated.updatedAt
              }
            : s
        )
      )
      setDraft(toDraft({ ...selectedStore, ...updated }))
    } catch (err) {
      toast.error(err.message || 'Unable to save daily bonus settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wallet-limits-page welcome-signup-bonus-page daily-bonus-page">
      <header className="wallet-limits-header">
        <h1>Daily bonus</h1>
        <p>
          Configure a 7-day daily bonus per store. Each day can grant SC coins,
          extra free spins on the normal Daily Spin wheel, or a percent-off package voucher.
          Days unlock in order (claim Day 1 before Day 2). Turn on “Repeat after 7 days” to
          start a new Day 1–7 cycle the next day after a user finishes all seven rewards.
          Leave it off to keep the campaign one-time.
        </p>
      </header>

      {isMasterAdmin && (
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
      )}

      {loading ? (
        <p className="wallet-limits-loading">Loading…</p>
      ) : (
        <div className="daily-bonus-layout">
          <aside className="daily-bonus-store-list spin-wheel-card">
            <h2>Stores</h2>
            {filtered.length === 0 ? (
              <p className="wsb-empty">No stores found.</p>
            ) : (
              <ul>
                {filtered.map((s) => {
                  const key = storeKey(s)
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={key === selectedKey ? 'is-active' : ''}
                        onClick={() => selectStore(s)}
                      >
                        <strong>{s.storeCode}</strong>
                        <span>{s.distributorCode || '—'}</span>
                        <em>
                          {s.enabled
                            ? s.repeatAfterComplete
                              ? 'Enabled · Repeats'
                              : 'Enabled'
                            : 'Disabled'}
                        </em>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>

          <section className="daily-bonus-editor spin-wheel-card">
            {!selectedStore || !draft ? (
              <p className="wsb-empty">Select a store to edit.</p>
            ) : (
              <>
                <div className="daily-bonus-editor-header">
                  <div>
                    <h2>{selectedStore.storeCode}</h2>
                    <p>
                      Distributor: {selectedStore.distributorCode || '—'} · Updated:{' '}
                      {formatUpdatedAt(selectedStore.updatedAt)}
                    </p>
                  </div>
                  <div className="daily-bonus-toggles">
                    <label className="daily-bonus-enabled">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
                      />
                      Enabled
                    </label>
                    <label className="daily-bonus-enabled">
                      <input
                        type="checkbox"
                        checked={draft.repeatAfterComplete}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, repeatAfterComplete: e.target.checked }))
                        }
                      />
                      Repeat after 7 days
                    </label>
                    <p className="daily-bonus-toggle-hint">
                      When on, users who claim all 7 days start again from Day 1 the next day.
                    </p>
                  </div>
                </div>

                <h3>Day rewards (1–7)</h3>
                <div className="daily-bonus-days">
                  {draft.days.map((day) => (
                    <div key={day.dayIndex} className="daily-bonus-day-card">
                      <div className="daily-bonus-day-title">
                        <strong>Day {day.dayIndex}</strong>
                        <input
                          type="text"
                          value={day.label}
                          onChange={(e) => updateDay(day.dayIndex, { label: e.target.value })}
                          aria-label={`Day ${day.dayIndex} label`}
                        />
                      </div>
                      <label>
                        Reward type
                        <select
                          value={day.rewardType}
                          onChange={(e) => updateDay(day.dayIndex, { rewardType: e.target.value })}
                        >
                          {REWARD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {day.rewardType === 'sc_coins' && (
                        <label>
                          SC amount
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={day.amountSc}
                            onChange={(e) => updateDay(day.dayIndex, { amountSc: e.target.value })}
                          />
                        </label>
                      )}

                      {day.rewardType === 'bonus_spin' && (
                        <label>
                          Extra Daily Spin free spins
                          <input
                            type="number"
                            min="1"
                            max="20"
                            step="1"
                            value={day.spinCount}
                            onChange={(e) => updateDay(day.dayIndex, { spinCount: e.target.value })}
                          />
                        </label>
                      )}

                      {day.rewardType === 'discount_voucher' && (
                        <>
                          <label>
                            Percent off
                            <input
                              type="number"
                              min="0.01"
                              max="100"
                              step="0.01"
                              value={day.percentOff}
                              onChange={(e) =>
                                updateDay(day.dayIndex, { percentOff: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Package scope
                            <select
                              value={day.packageScope}
                              onChange={(e) =>
                                updateDay(day.dayIndex, {
                                  packageScope: e.target.value,
                                  packageIds: e.target.value === 'all' ? [] : day.packageIds
                                })
                              }
                            >
                              <option value="all">All packages</option>
                              <option value="selected">Selected packages</option>
                            </select>
                          </label>
                          {day.packageScope === 'selected' && (
                            <div className="daily-bonus-package-picks">
                              <span>Packages {loadingPackages ? '(loading…)' : ''}</span>
                              <div className="daily-bonus-package-list">
                                {packages.length === 0 ? (
                                  <em>No packages for this store.</em>
                                ) : (
                                  packages.map((pkg) => {
                                    const checked = day.packageIds.includes(pkg.id)
                                    return (
                                      <label key={pkg.id} className="daily-bonus-package-item">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            const next = checked
                                              ? day.packageIds.filter((id) => id !== pkg.id)
                                              : [...day.packageIds, pkg.id]
                                            updateDay(day.dayIndex, { packageIds: next })
                                          }}
                                        />
                                        <span>
                                          #{pkg.id} {pkg.title} — ${Number(pkg.finalPrice).toFixed(2)} /{' '}
                                          {Number(pkg.finalSc)} SC
                                        </span>
                                      </label>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <p className="daily-bonus-hint">
                  Spin wheel rewards add free spins to the existing Daily Spin wheel (same as
                  pending free spins). Users use them on the normal Spin Wheel page. Package
                  discount vouchers expire 24 hours after claim and are consumed as soon as the
                  user starts checkout or submits a manual deposit request (not when payment
                  later settles).
                </p>
                <div className="daily-bonus-actions">
                  <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save daily bonus'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
