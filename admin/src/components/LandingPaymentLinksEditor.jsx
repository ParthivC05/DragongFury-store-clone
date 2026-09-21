import { useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'
import {
  getLandingPaymentLinksSettings,
  updateLandingPaymentLinksSettings,
  clearLandingPaymentLinksSettings,
  getStoreLandingPaymentLinks,
  updateStoreLandingPaymentLinks,
  clearStoreLandingPaymentLinks,
  uploadLandingPaymentLinksModalImage,
  DEFAULT_REDIRECT_DELAY_SECONDS,
  MAX_MODAL_IMAGE_LABEL,
  MAX_REDIRECT_MODALS,
} from '../api/landingPaymentLinks'
import '../pages/Profile.css'

const EMPTY = {
  deposit: [],
  withdrawal: [],
  redirectModals: [],
}

function newLink() {
  return { id: crypto.randomUUID(), label: '', urls: [''] }
}

function newModal() {
  return {
    id: crypto.randomUUID(),
    imageUrl: null,
    delaySeconds: DEFAULT_REDIRECT_DELAY_SECONDS,
  }
}

function parseDelaySeconds(raw, fallback = DEFAULT_REDIRECT_DELAY_SECONDS) {
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function normalizeImageUrl(url) {
  if (url == null) return null
  const s = String(url).trim()
  return s || null
}

// Normalize a stored/legacy link into the editor shape ({ id, label, urls: [] }).
function toLinkForm(link) {
  const urls = Array.isArray(link?.urls)
    ? link.urls.map((u) => u ?? '')
    : link?.url != null
      ? [link.url]
      : []
  return {
    id: link?.id || crypto.randomUUID(),
    label: link?.label || '',
    urls: urls.length ? urls : [''],
  }
}

function toModalForm(modal) {
  return {
    id: modal?.id || crypto.randomUUID(),
    imageUrl: normalizeImageUrl(
      modal?.imageUrl ?? modal?.image_url ?? modal?.modalImageUrl ?? modal?.modal_image_url,
    ),
    delaySeconds: parseDelaySeconds(
      modal?.delaySeconds ?? modal?.delay_seconds ?? modal?.redirectDelaySeconds,
    ),
  }
}

function normalizeRedirectModals(data) {
  const raw = data?.redirectModals ?? data?.redirect_modals
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map(toModalForm)
  }
  const imageUrl = normalizeImageUrl(data?.modalImageUrl ?? data?.modal_image_url)
  if (!imageUrl) return []
  return [
    {
      id: crypto.randomUUID(),
      imageUrl,
      delaySeconds: parseDelaySeconds(data?.redirectDelaySeconds ?? data?.redirect_delay_seconds),
    },
  ]
}

function normalizeLinks(data) {
  return {
    deposit: Array.isArray(data?.deposit) ? data.deposit.map(toLinkForm) : [],
    withdrawal: Array.isArray(data?.withdrawal) ? data.withdrawal.map(toLinkForm) : [],
    redirectModals: normalizeRedirectModals(data),
  }
}

function LinkListEditor({ type, title, links, onChange, disabled }) {
  function updateLink(index, field, value) {
    onChange(
      links.map((link, i) => (i === index ? { ...link, [field]: value } : link)),
    )
  }

  function updateUrl(linkIndex, urlIndex, value) {
    onChange(
      links.map((link, i) =>
        i === linkIndex
          ? { ...link, urls: link.urls.map((u, j) => (j === urlIndex ? value : u)) }
          : link,
      ),
    )
  }

  function addUrl(linkIndex) {
    onChange(
      links.map((link, i) =>
        i === linkIndex ? { ...link, urls: [...link.urls, ''] } : link,
      ),
    )
  }

  function removeUrl(linkIndex, urlIndex) {
    onChange(
      links.map((link, i) =>
        i === linkIndex
          ? { ...link, urls: link.urls.filter((_, j) => j !== urlIndex) }
          : link,
      ),
    )
  }

  function addLink() {
    onChange([...links, newLink()])
  }

  function removeLink(index) {
    onChange(links.filter((_, i) => i !== index))
  }

  return (
    <div className="landing-payment-links-group">
      <div className="landing-payment-links-group-header">
        <h4 className="profile-subcard-title">{title}</h4>
        <button
          type="button"
          className="admin-btn admin-btn-secondary admin-btn-sm"
          onClick={addLink}
          disabled={disabled}
        >
          Add link
        </button>
      </div>
      {links.length === 0 ? (
        <p className="profile-hint">No {type} links yet. Click &quot;Add link&quot; to create one.</p>
      ) : (
        <div className="landing-payment-links-list">
          {links.map((link, index) => (
            <div key={link.id || index} className="landing-payment-link-row">
              <div className="profile-field">
                <label htmlFor={`${type}-label-${index}`}>Label</label>
                <input
                  id={`${type}-label-${index}`}
                  className="profile-site-url-input"
                  type="text"
                  placeholder="e.g. Cash App"
                  value={link.label}
                  onChange={(e) => updateLink(index, 'label', e.target.value)}
                  disabled={disabled}
                  maxLength={100}
                  autoComplete="off"
                />
              </div>
              <div className="profile-field profile-field--grow">
                <label htmlFor={`${type}-url-${index}-0`}>
                  URLs <span className="profile-hint">(shuffled on each click)</span>
                </label>
                {link.urls.map((url, urlIndex) => (
                  <div key={urlIndex} className="landing-payment-link-url-row">
                    <input
                      id={`${type}-url-${index}-${urlIndex}`}
                      className="profile-site-url-input"
                      type="url"
                      placeholder="https://..."
                      value={url}
                      onChange={(e) => updateUrl(index, urlIndex, e.target.value)}
                      disabled={disabled}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="admin-btn admin-btn-danger admin-btn-sm"
                      onClick={() => removeUrl(index, urlIndex)}
                      disabled={disabled || link.urls.length <= 1}
                      aria-label={`Remove URL ${urlIndex + 1} from ${type} link ${index + 1}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-btn-sm"
                  onClick={() => addUrl(index)}
                  disabled={disabled}
                >
                  Add URL
                </button>
              </div>
              <button
                type="button"
                className="admin-btn admin-btn-danger admin-btn-sm landing-payment-link-remove"
                onClick={() => removeLink(index)}
                disabled={disabled}
                aria-label={`Remove ${type} link ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function LandingPaymentLinksEditor({
  storeId = null,
  title = 'Landing payment links',
  description,
}) {
  const toast = useToast()
  const [links, setLinks] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [uploadingIndex, setUploadingIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = storeId ? getStoreLandingPaymentLinks(storeId) : getLandingPaymentLinksSettings()
    load
      .then((res) => {
        if (cancelled) return
        setLinks(normalizeLinks(res?.landingPaymentLinks ?? EMPTY))
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'Failed to load landing payment links.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storeId, toast])

  async function handleModalImageUpload(index, file) {
    if (!file) return
    setUploadingIndex(index)
    try {
      const res = await uploadLandingPaymentLinksModalImage(file)
      const url = normalizeImageUrl(res?.data?.url ?? res?.url)
      if (!url) throw new Error('Upload succeeded but no image URL was returned.')
      setLinks((prev) => ({
        ...prev,
        redirectModals: (prev.redirectModals || []).map((modal, i) =>
          i === index
            ? {
                ...modal,
                imageUrl: url,
                delaySeconds:
                  modal.delaySeconds != null && modal.delaySeconds !== ''
                    ? modal.delaySeconds
                    : DEFAULT_REDIRECT_DELAY_SECONDS,
              }
            : modal,
        ),
      }))
      toast.success('Modal image uploaded. Save to apply.')
    } catch (err) {
      toast.error(err.message || 'Image upload failed.')
    } finally {
      setUploadingIndex(null)
    }
  }

  function addModal() {
    setLinks((prev) => {
      const current = prev.redirectModals || []
      if (current.length >= MAX_REDIRECT_MODALS) return prev
      return { ...prev, redirectModals: [...current, newModal()] }
    })
  }

  function updateModal(index, patch) {
    setLinks((prev) => ({
      ...prev,
      redirectModals: (prev.redirectModals || []).map((modal, i) =>
        i === index ? { ...modal, ...patch } : modal,
      ),
    }))
  }

  function removeModal(index) {
    setLinks((prev) => ({
      ...prev,
      redirectModals: (prev.redirectModals || []).filter((_, i) => i !== index),
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const mapLink = (l) => ({
        id: l.id,
        label: (l.label || '').trim(),
        urls: (l.urls || []).map((u) => (u || '').trim()).filter(Boolean),
      })
      const redirectModals = (links.redirectModals || [])
        .map((modal) => {
          const imageUrl = normalizeImageUrl(modal.imageUrl)
          if (!imageUrl) return null
          const delayNum = Number(modal.delaySeconds)
          return {
            imageUrl,
            delaySeconds:
              Number.isFinite(delayNum) && delayNum > 0
                ? delayNum
                : DEFAULT_REDIRECT_DELAY_SECONDS,
          }
        })
        .filter(Boolean)
      const payload = {
        deposit: links.deposit.map(mapLink),
        withdrawal: links.withdrawal.map(mapLink),
        redirectModals,
      }
      const res = storeId
        ? await updateStoreLandingPaymentLinks(storeId, payload)
        : await updateLandingPaymentLinksSettings(payload)
      setLinks(normalizeLinks(res?.landingPaymentLinks ?? payload))
      toast.success(res.message || 'Landing payment links saved.')
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!window.confirm('Clear all deposit and withdrawal links for this store?')) return
    setClearing(true)
    try {
      const res = storeId
        ? await clearStoreLandingPaymentLinks(storeId)
        : await clearLandingPaymentLinksSettings()
      setLinks(normalizeLinks(res?.landingPaymentLinks ?? EMPTY))
      toast.success(res.message || 'Landing payment links cleared.')
    } catch (err) {
      toast.error(err.message || 'Clear failed.')
    } finally {
      setClearing(false)
    }
  }

  const hasAny =
    links.deposit.length > 0 ||
    links.withdrawal.length > 0 ||
    (links.redirectModals || []).some((modal) => Boolean(normalizeImageUrl(modal.imageUrl)))
  const disabled = saving || clearing || uploadingIndex != null
  const redirectModals = links.redirectModals || []

  return (
    <div className="profile-site-url-panel landing-payment-links-editor">
      <div className="profile-site-url-panel-header">
        <div>
          <h3 className="profile-subcard-title profile-site-url-title">{title}</h3>
          <p className="profile-site-url-lead">
            {description ||
              "Deposit and withdrawal dropdown links shown on your public landing page below the header. Add label and URL for each option. Optional redirect modals: the guest closes each modal, then that modal's delay runs before the next modal (or the payment link)."}
          </p>
        </div>
        {hasAny ? (
          <span className="profile-site-badge profile-site-badge--active">Configured</span>
        ) : (
          <span className="profile-site-badge profile-site-badge--default">Not set</span>
        )}
      </div>

      {loading ? (
        <p className="profile-hint">Loading landing payment links…</p>
      ) : (
        <form onSubmit={handleSave} className="profile-site-url-form">
          <LinkListEditor
            type="deposit"
            title="Deposit links"
            links={links.deposit}
            onChange={(deposit) => setLinks((prev) => ({ ...prev, deposit }))}
            disabled={disabled}
          />
          <LinkListEditor
            type="withdrawal"
            title="Withdrawal links"
            links={links.withdrawal}
            onChange={(withdrawal) => setLinks((prev) => ({ ...prev, withdrawal }))}
            disabled={disabled}
          />

          <div className="landing-payment-links-group">
            <div className="landing-payment-links-group-header">
              <h4 className="profile-subcard-title">Redirect modals (optional)</h4>
              <button
                type="button"
                className="admin-btn admin-btn-secondary admin-btn-sm"
                onClick={addModal}
                disabled={disabled || redirectModals.length >= MAX_REDIRECT_MODALS}
              >
                Add modal
              </button>
            </div>
            <p className="profile-hint" style={{ marginTop: 0 }}>
              Shown in order when a guest clicks a deposit/withdraw link. The guest closes each modal,
              then that modal&apos;s delay runs before the next modal (or the payment link). Default delay
              is {DEFAULT_REDIRECT_DELAY_SECONDS}s. Maximum {MAX_REDIRECT_MODALS} modals. Images must be
              WEBP and {MAX_MODAL_IMAGE_LABEL} or smaller.
            </p>
            {redirectModals.length === 0 ? (
              <p className="profile-hint">No redirect modals. Links open immediately.</p>
            ) : (
              <div className="landing-payment-modals-list">
                {redirectModals.map((modal, index) => {
                  const modalImage = normalizeImageUrl(modal.imageUrl)
                  const uploading = uploadingIndex === index
                  const isLast = index === redirectModals.length - 1
                  return (
                    <div key={modal.id || index} className="landing-payment-modal-row">
                      <div className="landing-payment-modal-row-header">
                        <h5 className="landing-payment-modal-row-title">Modal {index + 1}</h5>
                        <button
                          type="button"
                          className="admin-btn admin-btn-danger admin-btn-sm"
                          onClick={() => removeModal(index)}
                          disabled={disabled}
                          aria-label={`Remove redirect modal ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="landing-payment-modal-settings">
                        <div className="landing-payment-modal-image-cell">
                          {modalImage ? (
                            <img
                              src={modalImage}
                              alt={`Redirect modal ${index + 1}`}
                              className="landing-payment-modal-image-preview"
                            />
                          ) : (
                            <div className="landing-payment-modal-image-placeholder">
                              No image
                            </div>
                          )}
                          <div className="landing-payment-modal-image-actions">
                            <label className="landing-payment-modal-upload">
                              {uploading ? 'Uploading…' : modalImage ? 'Replace' : 'Upload'}
                              <input
                                type="file"
                                accept="image/webp,.webp"
                                hidden
                                disabled={disabled}
                                onChange={(e) => {
                                  handleModalImageUpload(index, e.target.files?.[0])
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            <span className="profile-hint">WEBP only, max {MAX_MODAL_IMAGE_LABEL}</span>
                            {modalImage ? (
                              <button
                                type="button"
                                className="admin-btn admin-btn-secondary admin-btn-sm"
                                disabled={disabled}
                                onClick={() => updateModal(index, { imageUrl: null })}
                              >
                                Remove image
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="profile-field">
                          <label htmlFor={`landing-payment-redirect-delay-${index}`}>
                            Delay after this modal (seconds)
                          </label>
                          <input
                            id={`landing-payment-redirect-delay-${index}`}
                            className="profile-site-url-input"
                            type="number"
                            min={1}
                            max={60}
                            step={0.1}
                            value={modal.delaySeconds ?? ''}
                            onChange={(e) =>
                              updateModal(index, { delaySeconds: e.target.value })
                            }
                            disabled={disabled}
                            placeholder={String(DEFAULT_REDIRECT_DELAY_SECONDS)}
                          />
                          <p className="profile-hint">
                            {isLast
                              ? 'After the guest closes this modal, wait this long before opening the payment link (1–60).'
                              : `After the guest closes this modal, wait this long before showing modal ${index + 2} (1–60).`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="profile-site-url-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={disabled}>
              {saving ? 'Saving…' : 'Save links'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleClear}
              disabled={disabled || !hasAny}
            >
              {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
