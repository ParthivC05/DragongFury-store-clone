import { useState, useEffect, useCallback, useMemo } from 'react'
import * as spinwheelApi from '../api/spinwheel'
import { getStores } from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './StoreFeatures.css'

const MIN_SEGMENTS = 6
const MAX_SEGMENTS = 12
const FREE_SPIN_VALUE_MIN = 1
const FREE_SPIN_VALUE_MAX = 10
const SC_COINS_VALUE_MIN = 1
const SC_COINS_VALUE_MAX = 100
const COUPON_PERCENT_MIN = 1
const COUPON_PERCENT_MAX = 90
const WHEN_FREE_SPINS_MAX = 10
const PROBABILITY_TOTAL = 100
const PROBABILITY_TOLERANCE = 0.01

const inputClass = 'store-features-input'
const defaultSegment = () => ({ type: 'no_win', value: 0, label: '', color: '#6c757d', probability: 10 })

function parsePercentFromLabel(label) {
  if (!label || typeof label !== 'string') return null
  const m = label.trim().match(/(\d+(?:\.\d+)?)\s*%/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function clampValueByType(type, value) {
  if (type === 'no_win') return 0
  if (type === 'free_spin') return Math.min(FREE_SPIN_VALUE_MAX, Math.max(FREE_SPIN_VALUE_MIN, Number(value) || 1))
  if (type === 'coupon') return Math.min(COUPON_PERCENT_MAX, Math.max(COUPON_PERCENT_MIN, Number(value) || 5))
  return Math.min(SC_COINS_VALUE_MAX, Math.max(SC_COINS_VALUE_MIN, Number(value) || 1))
}

/** Display label: if custom label set use it, else "Value Type" e.g. "2 Free Spins", "5 SC", "10% Off" */
function getDisplayLabel(seg) {
  if (seg.label && String(seg.label).trim()) return String(seg.label).trim().slice(0, 64)
  const type = seg.type
  const value = seg.value
  if (type === 'no_win') return 'No Win'
  if (type === 'free_spin') return value === 1 ? '1 Free Spin' : `${value} Free Spins`
  if (type === 'coupon') return `${value}% Off`
  return `${value} SC`
}

function valueInputBounds(type) {
  if (type === 'free_spin') return { min: FREE_SPIN_VALUE_MIN, max: FREE_SPIN_VALUE_MAX }
  if (type === 'coupon') return { min: COUPON_PERCENT_MIN, max: COUPON_PERCENT_MAX }
  return { min: SC_COINS_VALUE_MIN, max: SC_COINS_VALUE_MAX }
}

/** Normalize color to #RRGGBB for color input (no # for value attribute). */
function toHex6(hex) {
  if (!hex || typeof hex !== 'string') return '6c757d'
  const m = hex.trim().match(/^#?([0-9A-Fa-f]{6})$/)
  if (m) return m[1].toLowerCase()
  const m3 = hex.trim().match(/^#?([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/)
  if (m3) return (m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toLowerCase()
  return '6c757d'
}

export default function SpinWheel() {
  const { user } = useAuth()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const isStoreAdmin = user?.role === ROLES.STORE_ADMIN
  const [spinWheelSettings, setSpinWheelSettings] = useState(null)
  const [overrideProbabilities, setOverrideProbabilities] = useState([])
  const [overrideWhen, setOverrideWhen] = useState(1)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const toast = useToast()
  const { confirm } = useConfirm()
  const [dragIndex, setDragIndex] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [stores, setStores] = useState([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [selectedStoreKey, setSelectedStoreKey] = useState('')

  const selectedStore = useMemo(() => {
    if (!isMasterAdmin || !selectedStoreKey) return null
    return stores.find((s) => String(s.storeCode || '').trim().toLowerCase() === selectedStoreKey) || null
  }, [isMasterAdmin, stores, selectedStoreKey])
  const settingsScope = useMemo(() => {
    if (!selectedStore?.storeCode) return undefined
    return { distributorCode: selectedStore.distributorCode, storeCode: selectedStore.storeCode }
  }, [selectedStore])

  const applyLoadedSettings = useCallback((data) => {
    let segments = data?.segments || []
    if (segments.length < MIN_SEGMENTS) {
      while (segments.length < MIN_SEGMENTS) {
        segments = [...segments, defaultSegment()]
      }
    } else if (segments.length > MAX_SEGMENTS) {
      segments = segments.slice(0, MAX_SEGMENTS)
    }
    setSpinWheelSettings({ ...data, segments })
    setOverrideProbabilities(segments.map((s, i) => data?.probabilityOverrides?.[0]?.segmentProbabilities?.[String(i)] ?? s.probability ?? 0))
    setOverrideWhen(Math.min(data?.probabilityOverrides?.[0]?.whenFreeSpinsAtLeast ?? 10, WHEN_FREE_SPINS_MAX))
  }, [])

  useEffect(() => {
    if (!isMasterAdmin) return undefined
    let cancelled = false
    setStoresLoading(true)
    getStores({ limit: 500, sortBy: 'storeCode', sortOrder: 'ASC' })
      .then((res) => {
        if (cancelled) return
        const rows = Array.isArray(res?.list) ? res.list : Array.isArray(res?.data) ? res.data : []
        const unique = new Map()
        rows.forEach((row) => {
          const storeCode = String(row?.storeCode || row?.store_code || '').trim()
          if (!storeCode) return
          const key = storeCode.toLowerCase()
          const prev = unique.get(key)
          if (!prev) {
            unique.set(key, row)
            return
          }
          const code = key
          const rowMatch = String(row.username || '').trim().toLowerCase() === code
          const prevMatch = String(prev.username || '').trim().toLowerCase() === code
          if (rowMatch && !prevMatch) unique.set(key, row)
        })
        setStores([...unique.values()])
      })
      .catch(() => {
        if (!cancelled) setStores([])
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false)
      })
    return () => { cancelled = true }
  }, [isMasterAdmin])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    spinwheelApi.getSpinWheelSettings(settingsScope)
      .then((data) => {
        if (cancelled) return
        applyLoadedSettings(data)
      })
      .catch(() => {
        if (!cancelled) {
          const segs = Array(MIN_SEGMENTS).fill(null).map(() => defaultSegment())
          setSpinWheelSettings({ segments: segs, probabilityOverrides: [] })
          setOverrideProbabilities(segs.map((s) => s.probability ?? 0))
          setOverrideWhen(10)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [applyLoadedSettings, settingsScope])

  const segments = spinWheelSettings?.segments || []
  const totalProbability = segments.reduce((s, seg) => s + Math.max(0, Math.min(100, Number(seg.probability) ?? 0)), 0) || 0
  const totalOverrideProbability = overrideProbabilities.length
    ? overrideProbabilities.reduce((s, p) => s + Math.max(0, Math.min(100, Number(p) ?? 0)), 0) || 0
    : 0
  const mainProbabilityOk = Math.abs(totalProbability - PROBABILITY_TOTAL) <= PROBABILITY_TOLERANCE
  const overrideProbabilityOk = Math.abs(totalOverrideProbability - PROBABILITY_TOTAL) <= PROBABILITY_TOLERANCE
  const canSubmitProbabilities = mainProbabilityOk && overrideProbabilityOk
  const canAdd = segments.length < MAX_SEGMENTS
  const canRemove = segments.length > MIN_SEGMENTS

  const probabilityErrorMessage = (total, label) => {
    if (Math.abs(total - PROBABILITY_TOTAL) <= PROBABILITY_TOLERANCE) return null
    if (total < PROBABILITY_TOTAL) {
      return `${label} must add up to 100%. Right now they add up to ${total.toFixed(1)}% — please increase some values.`
    }
    return `${label} must add up to 100%. Right now they add up to ${total.toFixed(1)}% — please lower some values.`
  }
  const mainProbMessage = probabilityErrorMessage(totalProbability, 'Probabilities')
  const overrideProbMessage = probabilityErrorMessage(totalOverrideProbability, 'Override probabilities')

  const setSegments = useCallback((nextSegments) => {
    setSpinWheelSettings((prev) => prev ? { ...prev, segments: nextSegments } : null)
  }, [])

  const updateSegment = useCallback((index, updates) => {
    setSegments(segments.map((seg, i) => {
      if (i !== index) return seg
      const next = { ...seg, ...updates }
      if (updates.type !== undefined) next.value = clampValueByType(next.type, seg.value)
      return next
    }))
  }, [segments, setSegments])

  const setSegmentProbability = useCallback((index, probabilityPercent) => {
    const p = Math.max(0, Math.min(100, Number(probabilityPercent) || 0))
    updateSegment(index, { probability: p })
  }, [updateSegment])

  const addSegment = () => {
    if (!canAdd) return
    setSegments([...segments, defaultSegment()])
    setOverrideProbabilities((prev) => [...prev, 10])
  }

  const removeSegmentAt = (index) => {
    if (!canRemove || segments.length <= MIN_SEGMENTS) return
    setSegments(segments.filter((_, i) => i !== index))
    setOverrideProbabilities((prev) => prev.filter((_, i) => i !== index))
  }

  const moveSegment = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= segments.length) return
    const next = [...segments]
    const [removed] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, removed)
    setSegments(next)
    setOverrideProbabilities((prev) => {
      const p = [...prev]
      const [r] = p.splice(fromIndex, 1)
      p.splice(toIndex, 0, r)
      return p
    })
  }, [segments, setSegments])

  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    e.target.classList.add('spin-wheel-dragging')
  }

  const handleDragEnd = (e) => {
    e.target.classList.remove('spin-wheel-dragging')
    setDragIndex(null)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, toIndex) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (Number.isNaN(fromIndex)) return
    moveSegment(fromIndex, toIndex)
  }

  const displayProbability = (seg) => Math.max(0, Math.min(100, Number(seg?.probability) ?? 0))
  const overrideProbabilityDisplay = (index) => Math.max(0, Math.min(100, Number(overrideProbabilities[index]) ?? 0))

  const setOverrideProbability = useCallback((index, probabilityPercent) => {
    const p = Math.max(0, Math.min(100, Number(probabilityPercent) || 0))
    setOverrideProbabilities((prev) => {
      const next = [...prev]
      next[index] = p
      return next
    })
  }, [])

  return (
    <div className="store-features-page spin-wheel-page">
      <h2>Spin Wheel</h2>
      {isMasterAdmin && (
        <section className="spin-wheel-card" style={{ marginBottom: '1.25rem', padding: '1rem' }}>
          <label htmlFor="spin-wheel-store" className="store-features-hint" style={{ display: 'block', marginBottom: '0.4rem' }}>
            Select store
          </label>
          <select
            id="spin-wheel-store"
            className="store-features-input"
            value={selectedStoreKey}
            onChange={(e) => setSelectedStoreKey(e.target.value)}
            disabled={storesLoading}
          >
            <option value="">All stores (platform default)</option>
            {stores.map((s) => {
              const code = String(s.storeCode || '').trim()
              return (
                <option key={code.toLowerCase()} value={code.toLowerCase()}>
                  {code}
                </option>
              )
            })}
          </select>
          <p className="store-features-hint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            {selectedStore
              ? `Editing ${selectedStore.storeCode}. Save updates this store’s player wheel.`
              : 'Editing all stores. Save updates the platform default and every store override, so players see it immediately.'}
          </p>
        </section>
      )}

      <div className="spin-wheel-guide-wrap">
        <button
          type="button"
          className="spin-wheel-guide-toggle"
          onClick={() => setGuideOpen((v) => !v)}
          aria-expanded={guideOpen}
          aria-controls="spin-wheel-guide-content"
        >
          <span className="spin-wheel-guide-toggle-icon" aria-hidden>{guideOpen ? '▾' : '▸'}</span>
          <span>{guideOpen ? 'Hide guide' : 'Show guide'}</span>
        </button>
        {guideOpen && (
          <div id="spin-wheel-guide-content" className="spin-wheel-guide" role="region" aria-label="Wheel portions guide">
            <p className="spin-wheel-guide-intro">What each column means. You can have between {MIN_SEGMENTS} and {MAX_SEGMENTS} portions. Use <strong>Create Portion</strong> below the table to add more.</p>
            <dl className="spin-wheel-guide-columns">
              <dt className="spin-wheel-guide-col-name">Drag</dt>
              <dd>Use this to change the order of slices on the wheel. Drag a row up or down.</dd>

              <dt className="spin-wheel-guide-col-name">#</dt>
              <dd>Just the row number (1, 2, 3…). Helps you match portions when you set override probabilities.</dd>

              <dt className="spin-wheel-guide-col-name">Type</dt>
              <dd>What the user can win: <strong>No win</strong>, <strong>Free spin</strong>, <strong>SC coins</strong>, or <strong>Coupon (% off)</strong>. A coupon gives a one-time discount code for that winner&apos;s next deposit.</dd>

              <dt className="spin-wheel-guide-col-name">Value</dt>
              <dd>How much they win: e.g. 5 = 5 free spins or 5 SC. For coupons, this is the percent off (e.g. 10 = 10% off next deposit). No win is always 0.</dd>

              <dt className="spin-wheel-guide-col-name">Label</dt>
              <dd>Text that appears for this slice (e.g. &quot;5 Free Spins&quot;). Leave blank to use an automatic label from Type and Value.</dd>

              <dt className="spin-wheel-guide-col-name">Color</dt>
              <dd>The colour of this slice on the wheel. Click the square to pick a colour or type a hex code.</dd>

              <dt className="spin-wheel-guide-col-name">Probability</dt>
              <dd>Chance of this slice (0–100%). Higher % = more likely to land on this slice. Each value must be between 0 and 100.</dd>

              <dt className="spin-wheel-guide-col-name">Override probability</dt>
              <dd>Chance used only when the user has many free spins (see &quot;When free spins ≥&quot;). Lets you make &quot;No win&quot; more likely in that case. Each value 0–100.</dd>

              <dt className="spin-wheel-guide-col-name">Action</dt>
              <dd>Delete this portion. You need at least {MIN_SEGMENTS} portions on the wheel.</dd>
            </dl>
            <div className="spin-wheel-guide-how">
              <p className="spin-wheel-guide-how-title">How Probability works</p>
              <p><strong>Probability</strong> — When a user spins the wheel, the system uses these percentages (0–100) to decide which slice they land on. A slice with 25% is twice as likely as one with 12.5%. So if you want &quot;No win&quot; to appear often, give it a higher probability. Each value must be between 0 and 100.</p>
              <p><strong>Override probability</strong> — When a user has at least the number of free spins you set in &quot;When free spins ≥&quot;, the wheel uses the override probabilities instead. This way you can change the odds only for users who already have many free spins — for example, make &quot;No win&quot; more likely. If you don’t need this, you can leave overrides the same as the main probabilities.</p>
            </div>
          </div>
        )}
      </div>

      <section className="store-features-section store-features-section-first spin-wheel-card">
        {loading ? (
          <p className="store-features-note">Loading…</p>
        ) : spinWheelSettings && (
          <form
            className="store-features-form spin-wheel-form"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!canSubmitProbabilities) return
              const whenAtLeast = Math.min(WHEN_FREE_SPINS_MAX, Math.max(0, Number(overrideWhen) || 10))
              const probabilityOverrides = []
              if (whenAtLeast >= 0) {
                const segmentProbabilities = {}
                segments.forEach((seg, i) => {
                  segmentProbabilities[String(i)] = Math.max(0, Math.min(100, Number(overrideProbabilities[i]) ?? 0))
                })
                probabilityOverrides.push({ whenFreeSpinsAtLeast: whenAtLeast, segmentProbabilities })
              }
              const nextSegments = segments.map((s) => {
                const label = (s.label && String(s.label).trim()) ? String(s.label).trim().slice(0, 64) : ''
                let value = s.value
                if (s.type === 'coupon') {
                  const fromLabel = parsePercentFromLabel(label)
                  if (fromLabel != null) value = clampValueByType('coupon', fromLabel)
                }
                return { type: s.type, value, label, color: s.color, probability: Math.max(0, Math.min(100, Number(s.probability) ?? 0)) }
              })
              setSaving(true)
              try {
                const updated = await spinwheelApi.updateSpinWheelSettings({ segments: nextSegments, probabilityOverrides }, settingsScope)
                applyLoadedSettings(updated)
                toast.success(
                  isMasterAdmin && !settingsScope
                    ? 'Spin wheel saved for all stores.'
                    : 'Spin wheel settings saved.'
                )
              } catch (err) {
                toast.error(err.message || 'Failed to save.')
              } finally {
                setSaving(false)
              }
            }}
          >
            <div className="spin-wheel-table-card">
              <div className="spin-wheel-table-header">
                <span className="spin-wheel-table-title">Wheel portions</span>
                <span className="spin-wheel-table-meta">
                  <span className="spin-wheel-table-count">{segments.length} of {MAX_SEGMENTS} portions · Total probability: {totalProbability.toFixed(1)}%</span>
                  <label className="spin-wheel-override-when-inline">
                    <span>When free spins ≥</span>
                    <input
                      name="override_when"
                      type="number"
                      min={0}
                      max={WHEN_FREE_SPINS_MAX}
                      value={overrideWhen}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10)
                        if (!Number.isNaN(n)) setOverrideWhen(Math.min(WHEN_FREE_SPINS_MAX, Math.max(0, n)))
                        else setOverrideWhen(0)
                      }}
                      className={inputClass}
                    />
                    <span className="spin-wheel-override-when-hint">use override (colored column)</span>
                  </label>
                </span>
              </div>
              <div className="store-features-table-wrap spin-wheel-table-wrap">
                <table className="store-features-table spin-wheel-table">
                  <thead>
                    <tr>
                      <th className="spin-wheel-col-drag" aria-label="Drag" />
                      <th>#</th>
                      <th className="spin-wheel-col-type">Type</th>
                      <th>Value</th>
                      <th className="spin-wheel-col-label">Label</th>
                      <th>Color</th>
                      <th>Probability (%)</th>
                      <th className="spin-wheel-col-override">Override probability (%)</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((seg, i) => (
                      <tr
                        key={i}
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDrop={(e) => handleDrop(e, i)}
                        className={dragIndex === i ? 'spin-wheel-dragging' : ''}
                      >
                        <td className="spin-wheel-col-drag"><span className="spin-wheel-drag-handle" aria-hidden>⋮⋮</span></td>
                        <td className="spin-wheel-portion-num">{i + 1}</td>
                        <td className="spin-wheel-col-type">
                          <select
                            value={seg.type}
                            onChange={(e) => updateSegment(i, { type: e.target.value })}
                            className={`${inputClass} spin-wheel-select`}
                          >
                            <option value="sc_coins">SC coins</option>
                            <option value="free_spin">Free spin</option>
                            <option value="coupon">Coupon (% off)</option>
                            <option value="no_win">No win</option>
                          </select>
                        </td>
                        <td className="spin-wheel-value-cell">
                          {seg.type === 'no_win' ? (
                            <input type="number" value={0} readOnly className={`${inputClass} spin-wheel-value-readonly`} tabIndex={-1} aria-label="Value" />
                          ) : (
                            <input
                              type="number"
                              min={valueInputBounds(seg.type).min}
                              max={valueInputBounds(seg.type).max}
                              value={seg.value}
                              onChange={(e) => {
                                const fallback = seg.type === 'coupon' ? 5 : 1
                                const raw = e.target.value === ''
                                  ? fallback
                                  : (seg.type === 'coupon' ? parseFloat(e.target.value) : parseInt(e.target.value, 10))
                                updateSegment(i, { value: clampValueByType(seg.type, isNaN(raw) ? seg.value : raw) })
                              }}
                              step={seg.type === 'coupon' ? '0.1' : '1'}
                              className={`${inputClass} spin-wheel-value-input`}
                              title={seg.type === 'coupon' ? 'Percent off next deposit' : undefined}
                            />
                          )}
                        </td>
                        <td className="spin-wheel-col-label">
                          <input
                            value={seg.label || ''}
                            onChange={(e) => updateSegment(i, { label: e.target.value })}
                            className={inputClass}
                            placeholder={getDisplayLabel(seg)}
                            title="Leave empty to use default label (e.g. 2 Free Spins)"
                          />
                        </td>
                        <td className="spin-wheel-color-cell">
                          <input
                            type="color"
                            value={'#' + toHex6(seg.color)}
                            onChange={(e) => updateSegment(i, { color: e.target.value })}
                            className="spin-wheel-color-picker"
                            title="Pick color — click to choose"
                            aria-label="Portion color"
                          />
                        </td>
                        <td className="spin-wheel-prob-cell">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={displayProbability(seg)}
                            onChange={(e) => setSegmentProbability(i, e.target.value)}
                            className={inputClass}
                            title="Chance of this slice (0–100%)"
                          />
                          <span className="spin-wheel-pct">%</span>
                        </td>
                        <td className="spin-wheel-col-override spin-wheel-override-prob-cell">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.1}
                            value={overrideProbabilityDisplay(i)}
                            onChange={(e) => setOverrideProbability(i, e.target.value)}
                            className={`${inputClass} spin-wheel-override-prob-input`}
                            title="Override probability when user has enough free spins (0–100%)"
                          />
                          <span className="spin-wheel-pct">%</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => removeSegmentAt(i)}
                            disabled={segments.length <= MIN_SEGMENTS}
                            className="store-features-btn store-features-btn-sm store-features-btn-danger spin-wheel-remove-btn"
                            title={segments.length <= MIN_SEGMENTS ? `Keep at least ${MIN_SEGMENTS} portions` : 'Remove portion'}
                            aria-label="Remove portion"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="spin-wheel-add-row">
                <button type="button" onClick={addSegment} disabled={!canAdd} className="store-features-btn store-features-btn-outline">
                  + Create Portion
                </button>
              </div>
            </div>

            <div className="store-features-actions spin-wheel-actions">
              {(mainProbMessage || overrideProbMessage) && (
                <div className="spin-wheel-probability-error" role="alert">
                  {mainProbMessage && <p className="spin-wheel-probability-error-text">{mainProbMessage}</p>}
                  {overrideProbMessage && <p className="spin-wheel-probability-error-text">{overrideProbMessage}</p>}
                  <p className="spin-wheel-probability-error-hint">Adjust the probability values so each set adds up to exactly 100% before saving.</p>
                </div>
              )}
              <p className="spin-wheel-actions-guide">
                {isMasterAdmin && !settingsScope && 'Save updates the platform default and every store’s spin wheel.'}
                {isMasterAdmin && settingsScope && `Save applies to ${settingsScope.storeCode} only.`}
                {isStoreAdmin && 'Save applies to your store. Reset restores platform default for your store.'}
              </p>
              <div className="spin-wheel-actions-right">
                <button type="submit" disabled={saving || !canSubmitProbabilities} className="store-features-btn store-features-btn-primary">
                  {saving ? 'Updating…' : 'Update Spin Wheel'}
                </button>
                {(isStoreAdmin || (isMasterAdmin && settingsScope)) && (
                  <button
                    type="button"
                    disabled={resetting}
                    className="store-features-btn store-features-btn-secondary"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Reset spin wheel to default?',
                        message: settingsScope
                          ? `Reset spin wheel to platform default for ${settingsScope.storeCode}? Players on that store will see the default wheel.`
                          : 'Reset spin wheel to platform default for your store? All your users will see the default wheel.',
                        confirmLabel: 'Reset to default',
                        cancelLabel: 'Cancel',
                        variant: 'danger'
                      })
                      if (!ok) return
                      setResetting(true)
                      try {
                        await spinwheelApi.resetSpinWheelSettingsToDefault(settingsScope)
                        const data = await spinwheelApi.getSpinWheelSettings(settingsScope)
                        applyLoadedSettings(data)
                        toast.success('Spin wheel reset to default.')
                      } catch (err) {
                        toast.error(err.message || 'Failed to reset.')
                      } finally {
                        setResetting(false)
                      }
                    }}
                  >
                    {resetting ? 'Resetting…' : 'Reset to default'}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
