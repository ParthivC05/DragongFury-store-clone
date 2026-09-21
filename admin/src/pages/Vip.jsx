import { useState, useEffect, useCallback } from 'react'
import * as vipApi from '../api/vip'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { ROLES } from '../constants/roles'
import './StoreFeatures.css'
import './Vip.css'

const MIN_LEVELS = 1
const MAX_LEVELS = 20
const inputClass = 'store-features-input'

function toHex6(hex) {
  if (!hex || typeof hex !== 'string') return '6c757d'
  const m = hex.trim().match(/^#?([0-9A-Fa-f]{6})$/)
  if (m) return m[1].toLowerCase()
  const m3 = hex.trim().match(/^#?([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/)
  if (m3) return (m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toLowerCase()
  return '6c757d'
}

function fromHex6(s) {
  if (!s) return '#6c757d'
  const t = String(s).trim().replace(/^#/, '')
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return '#' + t
  if (/^[0-9A-Fa-f]{3}$/.test(t)) return '#' + t[0] + t[0] + t[1] + t[1] + t[2] + t[2]
  return '#6c757d'
}

const defaultLevel = (index) => ({
  level_index: index,
  name: `Level ${index}`,
  color: '#6c757d',
  xp_to_next_level: 500,
  level_up_reward_sc: 0,
  withdrawal_limit: 500,
  platform_withdrawal_limit: 400
})

const defaultFaqItem = (index) => ({
  id: index,
  question: '',
  answer: '',
  sort_order: index
})

export default function Vip() {
  const { user } = useAuth()
  const role = user?.role
  const isMasterAdmin = role === ROLES.MASTER_ADMIN
  const isStoreAdmin = role === ROLES.STORE_ADMIN

  const [activeTab, setActiveTab] = useState('levels')
  const [levels, setLevels] = useState([])
  const [faq, setFaq] = useState([])
  const [faqDragIndex, setFaqDragIndex] = useState(null)
  const [loading, setLoading] = useState(false)
  const [savingLevels, setSavingLevels] = useState(false)
  const [savingFaq, setSavingFaq] = useState(false)
  const [resettingLevels, setResettingLevels] = useState(false)
  const [resettingFaq, setResettingFaq] = useState(false)
  const toast = useToast()
  const { confirm } = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await vipApi.getVipSettings()
      let lvls = data?.levels ?? []
      if (lvls.length < MIN_LEVELS) {
        lvls = Array.from({ length: MIN_LEVELS }, (_, i) => defaultLevel(i))
      } else if (lvls.length > MAX_LEVELS) {
        lvls = lvls.slice(0, MAX_LEVELS)
      }
      setLevels(lvls.map((l, i) => ({
        ...l,
        level_index: i,
        color: (l.color && String(l.color).trim().startsWith('#')) ? String(l.color).trim() : ('#' + toHex6(l.color || '6c757d'))
      })))
      setFaq(Array.isArray(data?.faq) ? data.faq : [])
    } catch {
      setLevels([defaultLevel(0)])
      setFaq([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const updateLevel = useCallback((index, updates) => {
    setLevels((prev) =>
      prev.map((l, i) => (i === index ? { ...l, ...updates } : l))
    )
  }, [])

  const addLevel = () => {
    if (levels.length >= MAX_LEVELS) return
    setLevels((prev) => [...prev, defaultLevel(prev.length)])
  }

  const removeLevel = (index) => {
    if (levels.length <= MIN_LEVELS) return
    setLevels((prev) => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, level_index: i })))
  }

  const updateFaq = useCallback((index, updates) => {
    setFaq((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    )
  }, [])

  const addFaq = () => {
    setFaq((prev) => [...prev, defaultFaqItem(prev.length)])
  }

  const removeFaq = (index) => {
    setFaq((prev) => prev.filter((_, i) => i !== index))
  }

  const moveFaq = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    setFaq((prev) => {
      const next = [...prev]
      const [removed] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, removed)
      return next
    })
  }

  const handleFaqDragStart = (e, index) => {
    setFaqDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    e.currentTarget.classList.add('vip-faq-dragging')
  }

  const handleFaqDragEnd = (e) => {
    e.currentTarget.classList.remove('vip-faq-dragging')
    setFaqDragIndex(null)
  }

  const handleFaqDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleFaqDrop = (e, toIndex) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (Number.isNaN(fromIndex)) return
    moveFaq(fromIndex, toIndex)
  }

  const handleSaveLevels = async (e) => {
    e?.preventDefault?.()
    const levelsPayload = levels.map((l, i) => ({
      level_index: i,
      name: l.name || `Level ${i}`,
      color: fromHex6(l.color ?? '#6c757d'),
      xp_to_next_level: Math.max(0, Number(l.xp_to_next_level) || 500),
      level_up_reward_sc: Math.max(0, Number(l.level_up_reward_sc) || 0),
      withdrawal_limit: Math.max(0, Number(l.withdrawal_limit) || 0),
      platform_withdrawal_limit: Math.max(0, Number(l.platform_withdrawal_limit) || 0)
    }))
    setSavingLevels(true)
    try {
      const updated = await vipApi.updateVipSettings({ levels: levelsPayload })
      setLevels(updated.levels ?? levels)
      toast.success('VIP levels saved.')
    } catch (err) {
      toast.error(err.message || 'Failed to save levels.')
    } finally {
      setSavingLevels(false)
    }
  }

  const handleSaveFaq = async (e) => {
    e?.preventDefault?.()
    const faqPayload = faq.map((item, i) => ({
      id: item.id ?? i,
      question: String(item.question ?? '').trim(),
      answer: String(item.answer ?? '').trim(),
      sort_order: i
    }))
    setSavingFaq(true)
    try {
      const updated = await vipApi.updateVipSettings({ faq: faqPayload })
      setFaq(updated.faq ?? faq)
      toast.success('VIP FAQ saved.')
    } catch (err) {
      toast.error(err.message || 'Failed to save FAQ.')
    } finally {
      setSavingFaq(false)
    }
  }

  const handleResetLevels = async () => {
    const ok = await confirm({
      title: 'Reset VIP levels to default?',
      message: 'Reset VIP levels to platform default for your store? Current levels will be replaced.',
      confirmLabel: 'Reset to default',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    setResettingLevels(true)
    try {
      await vipApi.resetVipSettingsToDefault('levels')
      await load()
      toast.success('VIP levels reset to default.')
    } catch (err) {
      toast.error(err.message || 'Failed to reset levels.')
    } finally {
      setResettingLevels(false)
    }
  }

  const handleResetFaq = async () => {
    const ok = await confirm({
      title: 'Reset VIP FAQ to default?',
      message: 'Reset VIP FAQ to platform default for your store? Current FAQ will be replaced.',
      confirmLabel: 'Reset to default',
      cancelLabel: 'Cancel',
      variant: 'danger'
    })
    if (!ok) return
    setResettingFaq(true)
    try {
      await vipApi.resetVipSettingsToDefault('faq')
      await load()
      toast.success('VIP FAQ reset to default.')
    } catch (err) {
      toast.error(err.message || 'Failed to reset FAQ.')
    } finally {
      setResettingFaq(false)
    }
  }

  return (
    <div className="store-features-page vip-page">
      <h2>VIP</h2>
      <p className="store-features-intro vip-intro">
        {isMasterAdmin &&
          'Configure the global default VIP levels and FAQ. New stores use this until they set their own.'}
        {isStoreAdmin &&
          "Configure VIP levels and FAQ for your store. You are editing your store's settings."}</p>

      <section className="store-features-section store-features-section-first spin-wheel-card vip-outer-card">
        {loading ? (
          <p className="store-features-note">Loading…</p>
        ) : (
          <form className="store-features-form spin-wheel-form vip-form" onSubmit={(e) => e.preventDefault()}>
            <div className="vip-tabs" role="tablist" aria-label="VIP settings">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'levels'}
                aria-controls="vip-levels-panel"
                id="vip-levels-tab"
                className={`vip-tab ${activeTab === 'levels' ? 'vip-tab-active' : ''}`}
                onClick={() => setActiveTab('levels')}
              >
                VIP Levels
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'faq'}
                aria-controls="vip-faq-panel"
                id="vip-faq-tab"
                className={`vip-tab ${activeTab === 'faq' ? 'vip-tab-active' : ''}`}
                onClick={() => setActiveTab('faq')}
              >
                VIP FAQs
              </button>
            </div>

            <div
              id="vip-levels-panel"
              role="tabpanel"
              aria-labelledby="vip-levels-tab"
              hidden={activeTab !== 'levels'}
              className="vip-tab-panel"
            >
              <div className="vip-levels-card spin-wheel-table-card">
                <div className="vip-card-header spin-wheel-table-header">
                  <span className="vip-card-title spin-wheel-table-title">VIP Levels</span>
                  <span className="vip-card-meta spin-wheel-table-count">
                    {levels.length} of {MAX_LEVELS} levels · Order = lowest to highest tier
                  </span>
                </div>
                <div className="store-features-table-wrap vip-table-wrap spin-wheel-table-wrap">
              <table className="store-features-table spin-wheel-table vip-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Color</th>
                    <th>XP to next</th>
                    <th>Level-up reward (SC)</th>
                    <th>Withdrawal limit</th>
                    <th>Platform withdrawal limit</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l, i) => (
                    <tr key={i}>
                      <td className="vip-col-num">{i + 1}</td>
                      <td>
                        <input
                          type="text"
                          className={inputClass}
                          value={l.name ?? ''}
                          onChange={(e) => updateLevel(i, { name: e.target.value })}
                          maxLength={32}
                          placeholder="e.g. Iron"
                        />
                      </td>
                      <td className="spin-wheel-color-cell">
                        <input
                          type="color"
                          value={'#' + toHex6(l.color ?? '#6c757d')}
                          onChange={(e) => updateLevel(i, { color: e.target.value })}
                          className="spin-wheel-color-picker"
                          title="Pick color — click to choose"
                          aria-label="Level color"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          className={inputClass}
                          value={l.xp_to_next_level ?? ''}
                          onChange={(e) => updateLevel(i, { xp_to_next_level: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className={inputClass}
                          value={l.level_up_reward_sc ?? ''}
                          onChange={(e) => updateLevel(i, { level_up_reward_sc: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className={inputClass}
                          value={l.withdrawal_limit ?? ''}
                          onChange={(e) => updateLevel(i, { withdrawal_limit: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className={inputClass}
                          value={l.platform_withdrawal_limit ?? ''}
                          onChange={(e) => updateLevel(i, { platform_withdrawal_limit: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => removeLevel(i)}
                          disabled={levels.length <= MIN_LEVELS}
                          className="store-features-btn store-features-btn-sm store-features-btn-danger"
                          title={levels.length <= MIN_LEVELS ? `Keep at least ${MIN_LEVELS} level` : 'Remove level'}
                          aria-label="Remove level"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
                <div className="vip-add-row vip-card-add-row">
                  <button
                    type="button"
                    onClick={addLevel}
                    disabled={levels.length >= MAX_LEVELS}
                    className="store-features-btn store-features-btn-outline"
                  >
                    + Create Level
                  </button>
                </div>
                <div className="vip-tab-actions spin-wheel-actions">
                  <p className="vip-actions-guide">
                    {isMasterAdmin && 'Save to update the platform default levels. New stores inherit this until they override.'}
                    {isStoreAdmin && 'Save applies to your store. Reset restores platform default levels for your store.'}
                  </p>
                  <div className="spin-wheel-actions-right">
                    <button type="button" disabled={savingLevels} className="store-features-btn store-features-btn-primary" onClick={handleSaveLevels}>
                      {savingLevels ? 'Updating…' : 'Update VIP Levels'}
                    </button>
                    {isStoreAdmin && (
                      <button type="button" disabled={resettingLevels} className="store-features-btn store-features-btn-secondary" onClick={handleResetLevels}>
                        {resettingLevels ? 'Resetting…' : 'Reset levels to default'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div
              id="vip-faq-panel"
              role="tabpanel"
              aria-labelledby="vip-faq-tab"
              hidden={activeTab !== 'faq'}
              className="vip-tab-panel"
            >
              <div className="vip-faq-card spin-wheel-table-card">
                <div className="vip-card-header spin-wheel-table-header">
                  <span className="vip-card-title spin-wheel-table-title">VIP FAQs</span>
                  <span className="vip-card-meta spin-wheel-table-count">
                    {faq.length} question{faq.length !== 1 ? 's' : ''} · Shown on the store VIP page
                  </span>
                </div>
                <div className="vip-faq-list">
                  {faq.map((item, i) => (
                    <div
                      key={i}
                      className={`vip-faq-item ${faqDragIndex === i ? 'vip-faq-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleFaqDragStart(e, i)}
                      onDragEnd={handleFaqDragEnd}
                      onDragOver={(e) => handleFaqDragOver(e, i)}
                      onDrop={(e) => handleFaqDrop(e, i)}
                    >
                      <div className="vip-faq-item-head">
                        <span className="vip-faq-drag-handle" aria-label="Drag to reorder">⋮⋮</span>
                        <span className="vip-faq-item-num" aria-hidden>{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeFaq(i)}
                          className="store-features-btn store-features-btn-sm store-features-btn-danger vip-faq-remove"
                          aria-label="Remove FAQ"
                        >
                          Remove
                        </button>
                      </div>
                      <label className="vip-faq-field-label">
                        <span>Question</span>
                        <input
                          type="text"
                          className={`${inputClass} vip-faq-question`}
                          value={item.question ?? ''}
                          onChange={(e) => updateFaq(i, { question: e.target.value })}
                          placeholder="e.g. How do I join VIP?"
                        />
                      </label>
                      <label className="vip-faq-field-label">
                        <span>Answer</span>
                        <textarea
                          className={`${inputClass} vip-faq-answer`}
                          value={item.answer ?? ''}
                          onChange={(e) => updateFaq(i, { answer: e.target.value })}
                          placeholder="Enter the answer shown to users…"
                          rows={3}
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <div className="vip-add-row vip-card-add-row">
                  <button type="button" onClick={addFaq} className="store-features-btn store-features-btn-outline">
                    + Add FAQ item
                  </button>
                </div>
                <div className="vip-tab-actions spin-wheel-actions">
                  <p className="vip-actions-guide">
                    {isMasterAdmin && 'Save to update the platform default FAQ. New stores inherit this until they override.'}
                    {isStoreAdmin && 'Save applies to your store. Reset restores platform default FAQ for your store.'}
                  </p>
                  <div className="spin-wheel-actions-right">
                    <button type="button" disabled={savingFaq} className="store-features-btn store-features-btn-primary" onClick={handleSaveFaq}>
                      {savingFaq ? 'Updating…' : 'Update VIP FAQ'}
                    </button>
                    {isStoreAdmin && (
                      <button type="button" disabled={resettingFaq} className="store-features-btn store-features-btn-secondary" onClick={handleResetFaq}>
                        {resettingFaq ? 'Resetting…' : 'Reset FAQ to default'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
