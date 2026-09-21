import { useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'
import {
  getDashboardPromoModalsSettings,
  updateDashboardPromoModalsSettings,
  clearDashboardPromoModalsSettings,
  getStoreDashboardPromoModals,
  updateStoreDashboardPromoModals,
  clearStoreDashboardPromoModals,
  uploadDashboardPromoModalImage,
  MODAL_TYPE_OPTIONS,
  MODAL_TYPE_META,
  DEFAULT_SETTINGS,
  MAX_STEPS,
  MIN_DELAY_SECONDS,
  MAX_DELAY_SECONDS,
  MAX_MODAL_IMAGE_LABEL,
} from '../api/dashboardPromoModals'
import '../pages/DashboardPromoModals.css'

function newStep(type = 'custom') {
  return {
    id: crypto.randomUUID(),
    type,
    enabled: true,
    delaySeconds: type === 'daily_bonus' ? 5 : 20,
    title: type === 'custom' ? 'Special offer' : '',
    imageUrl: null,
    ctaLabel: '',
    ctaUrl: '',
  }
}

function normalizeStep(raw) {
  const type = raw?.type || 'custom'
  return {
    id: raw?.id || crypto.randomUUID(),
    type,
    enabled: raw?.enabled !== false,
    delaySeconds: Number(raw?.delaySeconds ?? raw?.delay_seconds) || 0,
    title: raw?.title || (type === 'custom' ? 'Special offer' : ''),
    imageUrl: raw?.imageUrl ?? raw?.image_url ?? null,
    ctaLabel: raw?.ctaLabel ?? raw?.cta_label ?? '',
    ctaUrl: raw?.ctaUrl ?? raw?.cta_url ?? '',
  }
}

function normalizeSettings(data) {
  const src = data?.dashboardPromoModals ?? data ?? {}
  const steps = Array.isArray(src.steps) && src.steps.length > 0
    ? src.steps.map(normalizeStep)
    : DEFAULT_SETTINGS.steps.map((s) => ({ ...s }))
  return {
    enabled: src.enabled !== false,
    initialLoginDelaySeconds:
      Number(src.initialLoginDelaySeconds ?? src.initial_login_delay_seconds) ||
      DEFAULT_SETTINGS.initialLoginDelaySeconds,
    afterOnboardingDelaySeconds:
      Number(src.afterOnboardingDelaySeconds ?? src.after_onboarding_delay_seconds) ||
      DEFAULT_SETTINGS.afterOnboardingDelaySeconds,
    steps,
  }
}

function stepMeta(type) {
  return MODAL_TYPE_META[type] || {
    label: type,
    emoji: '📋',
    description: 'Popup shown to the player.',
  }
}

export function DashboardPromoModalsEditor({
  storeId = null,
  title = 'Login popups',
}) {
  const toast = useToast()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [uploadingStepId, setUploadingStepId] = useState(null)
  const [addType, setAddType] = useState(MODAL_TYPE_OPTIONS[0]?.value || 'daily_bonus')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = storeId ? getStoreDashboardPromoModals(storeId) : getDashboardPromoModalsSettings()
    load
      .then((res) => {
        if (cancelled) return
        setSettings(normalizeSettings(res))
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'Could not load settings.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storeId, toast])

  function updateStep(index, patch) {
    setSettings((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }))
  }

  function moveStep(index, direction) {
    setSettings((prev) => {
      const next = [...prev.steps]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp
      return { ...prev, steps: next }
    })
  }

  function removeStep(index) {
    if (!window.confirm('Remove this popup from the list?')) return
    setSettings((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }))
  }

  function addStep() {
    setSettings((prev) => {
      if (prev.steps.length >= MAX_STEPS) return prev
      return { ...prev, steps: [...prev.steps, newStep(addType)] }
    })
  }

  async function handleImageUpload(stepId, file) {
    if (!file) return
    setUploadingStepId(stepId)
    try {
      const res = await uploadDashboardPromoModalImage(file)
      const url = res?.data?.url ?? res?.url
      if (!url) throw new Error('Upload worked, but no image link came back.')
      setSettings((prev) => ({
        ...prev,
        steps: prev.steps.map((step) =>
          step.id === stepId ? { ...step, imageUrl: url } : step,
        ),
      }))
      toast.success('Picture uploaded. Click Save at the bottom.')
    } catch (err) {
      toast.error(err.message || 'Could not upload picture.')
    } finally {
      setUploadingStepId(null)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        enabled: settings.enabled,
        initialLoginDelaySeconds: Number(settings.initialLoginDelaySeconds) || 0,
        afterOnboardingDelaySeconds: Number(settings.afterOnboardingDelaySeconds) || 0,
        steps: settings.steps.map((step) => {
          const base = {
            id: step.id,
            type: step.type,
            enabled: step.enabled !== false,
            delaySeconds: Number(step.delaySeconds) || 0,
          }
          if (step.type === 'custom') {
            return {
              ...base,
              title: (step.title || '').trim() || 'Special offer',
              imageUrl: step.imageUrl || null,
              ctaLabel: (step.ctaLabel || '').trim() || null,
              ctaUrl: (step.ctaUrl || '').trim() || null,
            }
          }
          return base
        }),
      }
      const res = storeId
        ? await updateStoreDashboardPromoModals(storeId, payload)
        : await updateDashboardPromoModalsSettings(payload)
      setSettings(normalizeSettings(res))
      toast.success(res.message || 'Saved!')
    } catch (err) {
      toast.error(err.message || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!window.confirm('Reset everything back to the default popup list?')) return
    setClearing(true)
    try {
      const res = storeId
        ? await clearStoreDashboardPromoModals(storeId)
        : await clearDashboardPromoModalsSettings()
      setSettings(normalizeSettings(res))
      toast.success(res.message || 'Reset to defaults.')
    } catch (err) {
      toast.error(err.message || 'Could not reset.')
    } finally {
      setClearing(false)
    }
  }

  const disabled = saving || clearing || uploadingStepId != null

  return (
    <div className="profile-site-url-panel dpm-editor">
      <div className="profile-site-url-panel-header">
        <div>
          <h3 className="profile-subcard-title profile-site-url-title">{title}</h3>
          <p className="profile-site-url-lead">
            Choose which popups show after a player logs in, and how long to wait between them.
          </p>
        </div>
        <span className={`profile-site-badge ${settings.enabled ? 'profile-site-badge--active' : 'profile-site-badge--default'}`}>
          {settings.enabled ? 'On' : 'Off'}
        </span>
      </div>

      {loading ? (
        <p className="profile-hint">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="dpm-editor">
          <div className="dpm-help-box">
            <h4>How it works (simple)</h4>
            <ol>
              <li>Player logs in to the website.</li>
              <li>You pick how many seconds to wait, then the <strong>first popup</strong> appears.</li>
              <li>When they click <strong>Close</strong>, you wait again, then the <strong>next popup</strong> shows.</li>
              <li>This continues down your list, from top to bottom.</li>
            </ol>
          </div>

          <div className="dpm-card">
            <div className="dpm-master-row">
              <label className="dpm-toggle-label">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                  disabled={disabled}
                />
                Show login popups for players
              </label>
              <p className="dpm-hint" style={{ margin: 0 }}>
                Turn this off to hide all popups in the list below.
              </p>
            </div>
          </div>

          <div className="dpm-card dpm-card--muted">
            <div className="dpm-card-header">
              <div>
                <h4 className="dpm-card-title">⏱️ When to start</h4>
                <p className="dpm-card-subtitle">How long to wait before the first popup shows.</p>
              </div>
            </div>
            <div className="dpm-fields-grid">
              <div className="dpm-field">
                <label htmlFor="initial-login-delay">After login (seconds)</label>
                <input
                  id="initial-login-delay"
                  type="number"
                  min={MIN_DELAY_SECONDS}
                  max={MAX_DELAY_SECONDS}
                  step="0.5"
                  value={settings.initialLoginDelaySeconds}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      initialLoginDelaySeconds: e.target.value,
                    }))
                  }
                  disabled={disabled}
                />
                <p className="dpm-hint">
                  For players who already finished signup before.
                  <span className="dpm-hint--example"> Example: 5 = wait 5 seconds.</span>
                </p>
              </div>
              <div className="dpm-field">
                <label htmlFor="after-onboarding-delay">After new-user tutorial (seconds)</label>
                <input
                  id="after-onboarding-delay"
                  type="number"
                  min={MIN_DELAY_SECONDS}
                  max={MAX_DELAY_SECONDS}
                  step="0.5"
                  value={settings.afterOnboardingDelaySeconds}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      afterOnboardingDelaySeconds: e.target.value,
                    }))
                  }
                  disabled={disabled}
                />
                <p className="dpm-hint">
                  Only for brand-new players going through the first-time tutorial.
                </p>
              </div>
            </div>
          </div>

          <div className="dpm-card">
            <div className="dpm-sequence-header">
              <div>
                <h4 className="dpm-card-title">📋 Popup list (top = shows first)</h4>
                <p className="dpm-card-subtitle">
                  Use Move up / Move down to change the order. Each row is one popup.
                </p>
              </div>
            </div>

            {settings.steps.length === 0 ? (
              <div className="dpm-empty-steps">
                No popups yet. Pick a type below and click &quot;Add popup&quot;.
              </div>
            ) : (
              <div className="dpm-steps">
                {settings.steps.map((step, index) => {
                  const meta = stepMeta(step.type)
                  const isCustom = step.type === 'custom'
                  return (
                    <div
                      key={step.id}
                      className={`dpm-step${step.enabled === false ? ' dpm-step--off' : ''}`}
                    >
                      <div className="dpm-step-top">
                        <div className="dpm-step-num">{index + 1}</div>
                        <div className="dpm-step-main">
                          <div className="dpm-step-title-row">
                            <span className="dpm-step-emoji" aria-hidden>{meta.emoji}</span>
                            <h5 className="dpm-step-name">{meta.label}</h5>
                          </div>
                          <p className="dpm-step-desc">{meta.description}</p>
                        </div>
                        <div className="dpm-step-actions">
                          <label className="dpm-step-on-label">
                            <input
                              type="checkbox"
                              checked={step.enabled !== false}
                              onChange={(e) => updateStep(index, { enabled: e.target.checked })}
                              disabled={disabled}
                            />
                            {step.enabled !== false ? 'On' : 'Off'}
                          </label>
                          <div className="dpm-step-move-row">
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => moveStep(index, -1)}
                              disabled={disabled || index === 0}
                            >
                              ↑ Up
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => moveStep(index, 1)}
                              disabled={disabled || index === settings.steps.length - 1}
                            >
                              ↓ Down
                            </button>
                            <button
                              type="button"
                              className="admin-btn admin-btn-danger admin-btn-sm"
                              onClick={() => removeStep(index)}
                              disabled={disabled}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="dpm-step-body">
                        <div className="dpm-field dpm-delay-field">
                          <label htmlFor={`step-delay-${step.id}`}>
                            Wait after player closes this (seconds)
                          </label>
                          <input
                            id={`step-delay-${step.id}`}
                            type="number"
                            min={MIN_DELAY_SECONDS}
                            max={MAX_DELAY_SECONDS}
                            step="0.5"
                            value={step.delaySeconds}
                            onChange={(e) => updateStep(index, { delaySeconds: e.target.value })}
                            disabled={disabled}
                          />
                          {index === 0 ? (
                            <p className="dpm-hint">
                              The first popup also uses &quot;After login&quot; wait time above.
                            </p>
                          ) : (
                            <p className="dpm-hint dpm-hint--example">
                              Example: 5 = next popup shows 5 seconds after they close this one.
                            </p>
                          )}
                        </div>

                        {isCustom ? (
                          <div className="dpm-custom-block">
                            <div>
                              <div className="dpm-image-preview">
                                {step.imageUrl ? (
                                  <img src={step.imageUrl} alt={step.title || 'Promo preview'} />
                                ) : (
                                  <span className="dpm-image-preview-empty">
                                    No picture yet
                                    <br />
                                    Upload one →
                                  </span>
                                )}
                              </div>
                              <label className="dpm-upload-btn">
                                {uploadingStepId === step.id ? 'Uploading…' : 'Upload picture (WEBP)'}
                                <input
                                  type="file"
                                  accept="image/webp"
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleImageUpload(step.id, file)
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                              <p className="dpm-hint">Max {MAX_MODAL_IMAGE_LABEL}. Any image height is OK.</p>
                            </div>
                            <div className="dpm-fields-grid" style={{ gridTemplateColumns: '1fr' }}>
                              <div className="dpm-field">
                                <label htmlFor={`step-title-${step.id}`}>Name (for your records)</label>
                                <input
                                  id={`step-title-${step.id}`}
                                  type="text"
                                  placeholder="e.g. Summer sale"
                                  value={step.title}
                                  onChange={(e) => updateStep(index, { title: e.target.value })}
                                  disabled={disabled}
                                  maxLength={120}
                                />
                              </div>
                              <div className="dpm-field">
                                <label htmlFor={`step-cta-url-${step.id}`}>
                                  Where to go when they click the picture (optional)
                                </label>
                                <input
                                  id={`step-cta-url-${step.id}`}
                                  type="text"
                                  placeholder="/deposit or https://yoursite.com/promo"
                                  value={step.ctaUrl}
                                  onChange={(e) => updateStep(index, { ctaUrl: e.target.value })}
                                  disabled={disabled}
                                />
                                <p className="dpm-hint">Leave empty if the picture is just for show.</p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="dpm-add-bar">
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                disabled={disabled || settings.steps.length >= MAX_STEPS}
                aria-label="Popup type to add"
              >
                {MODAL_TYPE_OPTIONS.map((opt) => {
                  const meta = stepMeta(opt.value)
                  return (
                    <option key={opt.value} value={opt.value}>
                      {meta.emoji} {meta.label}
                    </option>
                  )
                })}
              </select>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={addStep}
                disabled={disabled || settings.steps.length >= MAX_STEPS}
              >
                + Add popup
              </button>
              {settings.steps.length >= MAX_STEPS ? (
                <span className="dpm-hint" style={{ margin: 0 }}>
                  Maximum {MAX_STEPS} popups reached.
                </span>
              ) : null}
            </div>
          </div>

          <div className="dpm-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={disabled}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleClear}
              disabled={disabled}
            >
              {clearing ? 'Resetting…' : 'Reset to defaults'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
