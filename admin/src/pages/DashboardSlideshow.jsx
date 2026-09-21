import { useCallback, useEffect, useMemo, useState } from 'react'
import * as dashboardSlideshowApi from '../api/dashboardSlideshow'
import { WEBP_ACCEPT } from '../utils/adminImageUploadConstraints'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './WalletLimits.css'
import './DashboardSlideshow.css'

const MAX_SLIDES = 12

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

function normalizeSlide(slide, index) {
  const linkRaw =
    typeof slide?.link === 'string'
      ? slide.link
      : typeof slide?.href === 'string'
        ? slide.href
        : typeof slide?.url === 'string'
          ? slide.url
          : ''
  return {
    id: typeof slide?.id === 'string' && slide.id.trim() ? slide.id.trim() : `slide-${index + 1}`,
    src: typeof slide?.src === 'string' ? slide.src.trim() : '',
    mobileSrc:
      typeof slide?.mobileSrc === 'string'
        ? slide.mobileSrc.trim()
        : typeof slide?.mobile_src === 'string'
          ? slide.mobile_src.trim()
          : '',
    alt: typeof slide?.alt === 'string' ? slide.alt : `Slide ${index + 1}`,
    link: linkRaw.trim(),
    order: index
  }
}

function slidesEqual(a, b) {
  if (a.length !== b.length) return false
  return a.every((slide, i) => {
    const other = b[i]
    return (
      slide.src === other.src &&
      (slide.mobileSrc || '') === (other.mobileSrc || '') &&
      (slide.alt || '') === (other.alt || '') &&
      (slide.link || '') === (other.link || '')
    )
  })
}

function newSlide(index) {
  return {
    id: `slide-${Date.now()}-${index}`,
    src: '',
    mobileSrc: '',
    alt: `Slide ${index + 1}`,
    link: '',
    order: index
  }
}

function isValidSlideLink(link) {
  const s = typeof link === 'string' ? link.trim() : ''
  if (!s) return true
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s)
      return Boolean(url.hostname) && (url.protocol === 'http:' || url.protocol === 'https:')
    } catch {
      return false
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false
  const path = s.startsWith('/') ? s : `/${s}`
  return /^\/[a-zA-Z0-9/_\-.~%?=&#+]*$/.test(path)
}

function ImageUploadCell({
  label,
  sizeLabel,
  maxSizeLabel,
  previewSrc,
  uploading,
  busy,
  onUpload,
  onClear,
  previewClassName
}) {
  return (
    <div className="dss-image-cell">
      <div className="dss-image-label">
        <strong>{label}</strong>
        <span>
          Must be {sizeLabel} px, WEBP, max {maxSizeLabel}
        </span>
      </div>
      {previewSrc ? (
        <img src={previewSrc} alt="" className={`dss-image-preview ${previewClassName || ''}`} />
      ) : (
        <div className={`dss-image-placeholder ${previewClassName || ''}`}>No picture yet</div>
      )}
      <div className="dss-image-actions">
        <label className="dss-upload">
          {uploading ? 'Uploading…' : previewSrc ? 'Change picture' : 'Add picture'}
          <input
            type="file"
            accept={WEBP_ACCEPT}
            hidden
            disabled={busy}
            onChange={(e) => {
              onUpload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {previewSrc ? (
          <button type="button" className="dss-remove-image" disabled={busy} onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SlideshowPlacementEditor({
  title,
  hint,
  emptyMessage,
  slides,
  store,
  storeKeyValue,
  field,
  saving,
  uploadingKey,
  onAdd,
  onRemove,
  onMove,
  onUpdateSlide,
  onUpload
}) {
  return (
    <div className="dss-placement">
      <h3>{title}</h3>
      {hint ? <p className="dss-placement-hint">{hint}</p> : null}
      {slides.length === 0 ? <p className="dss-empty">{emptyMessage}</p> : null}
      {slides.map((slide, index) => {
        const uploadingDesktop = uploadingKey === `${storeKeyValue}:${field}:${index}:desktop`
        const uploadingMobile = uploadingKey === `${storeKeyValue}:${field}:${index}:mobile`
        const busy = saving || !!uploadingKey
        return (
          <div key={slide.id || `${field}-${index}`} className="dss-slide-row">
            <div className="dss-slide-order">
              <span>#{index + 1}</span>
              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => onMove(field, index, -1)}
                aria-label="Move slide up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || index === slides.length - 1}
                onClick={() => onMove(field, index, 1)}
                aria-label="Move slide down"
              >
                ↓
              </button>
            </div>

            <div className="dss-slide-images">
              <ImageUploadCell
                label="Computer"
                sizeLabel={dashboardSlideshowApi.DESKTOP_DIMENSION_LABEL}
                maxSizeLabel={dashboardSlideshowApi.MAX_SLIDE_IMAGE_LABEL}
                previewSrc={slide.src}
                uploading={uploadingDesktop}
                busy={busy}
                previewClassName="dss-image-preview--desktop"
                onUpload={(file) => onUpload(store, field, index, 'desktop', file)}
                onClear={() => onUpdateSlide(field, index, { src: '' })}
              />
              <ImageUploadCell
                label="Phone"
                sizeLabel={dashboardSlideshowApi.MOBILE_DIMENSION_LABEL}
                maxSizeLabel={dashboardSlideshowApi.MAX_MOBILE_SLIDE_IMAGE_LABEL}
                previewSrc={slide.mobileSrc}
                uploading={uploadingMobile}
                busy={busy}
                previewClassName="dss-image-preview--mobile"
                onUpload={(file) => onUpload(store, field, index, 'mobile', file)}
                onClear={() => onUpdateSlide(field, index, { mobileSrc: '' })}
              />
            </div>

            <label className="dss-alt-field">
              <span>Picture name (for accessibility)</span>
              <input
                type="text"
                maxLength={160}
                value={slide.alt || ''}
                disabled={busy}
                placeholder="Example: Welcome bonus"
                onChange={(e) => onUpdateSlide(field, index, { alt: e.target.value })}
              />
            </label>

            <label className="dss-alt-field">
              <span>Link (optional)</span>
              <input
                type="text"
                maxLength={2048}
                value={slide.link || ''}
                disabled={busy}
                placeholder="Example: /deposit or https://…"
                onChange={(e) => onUpdateSlide(field, index, { link: e.target.value })}
              />
              <span className="dss-field-hint">
                Logged-in players open this page when they tap the slide. Guests go to sign up.
                Leave empty for no extra action.
              </span>
            </label>

            <button
              type="button"
              className="dss-remove-slide"
              disabled={busy}
              onClick={() => onRemove(field, index)}
            >
              Remove this slide
            </button>
          </div>
        )
      })}

      <div className="dss-slide-footer">
        <button
          type="button"
          className="dss-add"
          disabled={saving || !!uploadingKey || slides.length >= MAX_SLIDES}
          onClick={() => onAdd(field)}
        >
          Add slide
        </button>
        <span className="dss-hint">
          Computer {dashboardSlideshowApi.DESKTOP_DIMENSION_LABEL} · Phone{' '}
          {dashboardSlideshowApi.MOBILE_DIMENSION_LABEL} · Max{' '}
          {dashboardSlideshowApi.MAX_SLIDE_IMAGE_LABEL}
        </span>
      </div>
    </div>
  )
}

function draftSummary(draft) {
  const home = draft?.slides?.length || 0
  const casino = draft?.casinoSlides?.length || 0
  const homeText =
    home === 0 ? 'Homepage: default website pictures' : `Homepage: ${home} custom slide${home === 1 ? '' : 's'}`
  const casinoText =
    casino === 0 ? 'Casino: using homepage pictures' : `Casino: ${casino} custom slide${casino === 1 ? '' : 's'}`
  return `${homeText} · ${casinoText}`
}

export default function DashboardSlideshow() {
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const canManageAllStores = isMasterAdmin

  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [drafts, setDrafts] = useState({})
  const [expandedKey, setExpandedKey] = useState(null)
  const [savingKey, setSavingKey] = useState(null)
  const [uploadingKey, setUploadingKey] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await dashboardSlideshowApi.listDashboardSlideshowStores()
      const list = Array.isArray(data?.stores) ? data.stores : []
      setStores(list)
      const nextDrafts = {}
      list.forEach((s) => {
        const key = storeKey(s)
        nextDrafts[key] = {
          slides: Array.isArray(s.slides) ? s.slides.map(normalizeSlide) : [],
          casinoSlides: Array.isArray(s.casinoSlides) ? s.casinoSlides.map(normalizeSlide) : []
        }
      })
      setDrafts(nextDrafts)
      if (!canManageAllStores && list.length === 1) {
        setExpandedKey(storeKey(list[0]))
      }
    } catch (err) {
      toast.error(err.message || 'Unable to load dashboard slideshow settings.')
    } finally {
      setLoading(false)
    }
  }, [toast, canManageAllStores])

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

  function updateDraft(key, patch) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch }
    }))
  }

  function updateSlide(key, field, index, patch) {
    const draft = drafts[key]
    if (!draft || !Array.isArray(draft[field])) return
    const slides = draft[field].map((slide, i) => (i === index ? { ...slide, ...patch } : slide))
    updateDraft(key, { [field]: slides })
  }

  function addSlide(key, field) {
    const draft = drafts[key]
    if (!draft || !Array.isArray(draft[field])) return
    if (draft[field].length >= MAX_SLIDES) {
      toast.error(`You can add at most ${MAX_SLIDES} slides.`)
      return
    }
    updateDraft(key, { [field]: [...draft[field], newSlide(draft[field].length)] })
  }

  function removeSlide(key, field, index) {
    const draft = drafts[key]
    if (!draft || !Array.isArray(draft[field])) return
    updateDraft(key, {
      [field]: draft[field].filter((_, i) => i !== index).map((slide, i) => ({ ...slide, order: i }))
    })
  }

  function moveSlide(key, field, index, direction) {
    const draft = drafts[key]
    if (!draft || !Array.isArray(draft[field])) return
    const next = index + direction
    if (next < 0 || next >= draft[field].length) return
    const slides = [...draft[field]]
    const tmp = slides[index]
    slides[index] = slides[next]
    slides[next] = tmp
    updateDraft(key, { [field]: slides.map((slide, i) => ({ ...slide, order: i })) })
  }

  async function handleImageUpload(store, field, slideIndex, kind, file) {
    if (!file) return
    const key = storeKey(store)
    setUploadingKey(`${key}:${field}:${slideIndex}:${kind}`)
    try {
      const res = await dashboardSlideshowApi.uploadDashboardSlideshowImage(file, kind)
      const url = res?.data?.url
      if (!url) throw new Error('Upload did not return a URL.')
      updateSlide(key, field, slideIndex, kind === 'mobile' ? { mobileSrc: url } : { src: url })
      toast.success(`${kind === 'mobile' ? 'Phone' : 'Computer'} picture added. Click Save when done.`)
    } catch (err) {
      toast.error(err.message || 'Image upload failed.')
    } finally {
      setUploadingKey(null)
    }
  }

  async function saveRow(store) {
    const key = storeKey(store)
    const draft = drafts[key]
    if (!draft) return

    const slides = (draft.slides || []).map(normalizeSlide)
    const casinoSlides = (draft.casinoSlides || []).map(normalizeSlide)
    const allSlides = [...slides, ...casinoSlides]
    if (allSlides.some((s) => !s.src || !s.mobileSrc)) {
      toast.error('Each slide needs both a computer picture and a phone picture.')
      return
    }
    if (allSlides.some((s) => !isValidSlideLink(s.link))) {
      toast.error('Slide links must be a site path like /deposit or a full http(s) URL.')
      return
    }

    setSavingKey(key)
    try {
      const toPayloadSlides = (list) =>
        list.map((s, i) => ({
          id: s.id,
          src: s.src,
          mobileSrc: s.mobileSrc,
          alt: s.alt || `Slide ${i + 1}`,
          link: s.link || '',
          order: i
        }))
      const payload = {
        slides: toPayloadSlides(slides),
        casinoSlides: toPayloadSlides(casinoSlides)
      }
      if (canManageAllStores) {
        payload.storeCode = store.storeCode
        if (store.distributorCode != null) payload.distributorCode = store.distributorCode
      }
      const updated = await dashboardSlideshowApi.updateDashboardSlideshowStore(payload)
      const homeCount = updated.slideCount ?? slides.length
      const casinoCount = updated.casinoSlideCount ?? casinoSlides.length
      toast.success(
        `Saved ${store.storeCode}: ${homeCount} homepage slide(s), ${casinoCount} casino slide(s).`
      )
      await load()
    } catch (err) {
      toast.error(err.message || 'Unable to save dashboard slideshow.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="wallet-limits-page dashboard-slideshow-page">
      <header className="wallet-limits-header">
        <h1>Homepage pictures</h1>
        <p className="dss-lead">
          These are the big pictures that slide on your store homepage. You can also add a separate
          slideshow for the casino page. If casino pictures are empty, the casino page uses the
          homepage pictures.
        </p>
      </header>

      <div className="dss-howto">
        <h2>How to use (easy steps)</h2>
        <ol>
          <li>
            Click <strong>Add slide</strong>.
          </li>
          <li>
            Upload a <strong>Computer</strong> picture ({dashboardSlideshowApi.DESKTOP_DIMENSION_LABEL}{' '}
            pixels).
          </li>
          <li>
            Upload a <strong>Phone</strong> picture ({dashboardSlideshowApi.MOBILE_DIMENSION_LABEL}{' '}
            pixels).
          </li>
          <li>
            Optional: add a <strong>Link</strong> (for example <code>/deposit</code> or{' '}
            <code>/promotions</code>). Guests who tap the slide go to sign up. Logged-in players go
            to that page. Leave it blank if tapping should do nothing extra.
          </li>
          <li>
            Click <strong>Save</strong>.
          </li>
        </ol>
        <p className="dss-howto-note">
          Tip: Homepage and casino pictures are separate. Leave casino empty to reuse homepage
          pictures. If you add no homepage slides, your website shows its default pictures from the
          public folder. Max {dashboardSlideshowApi.MAX_SLIDE_IMAGE_LABEL} for computer pictures and{' '}
          {dashboardSlideshowApi.MAX_MOBILE_SLIDE_IMAGE_LABEL} for phone pictures. WEBP only.
        </p>
      </div>

      {canManageAllStores && (
        <div className="dss-toolbar">
          <label className="wl-field">
            <span>Find a store</span>
            <input
              type="search"
              placeholder="Type store code, name, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button type="button" className="dss-refresh" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      )}

      {loading ? (
        <p className="wallet-limits-loading">Loading…</p>
      ) : (
        <div className="dss-store-list">
          {filtered.length === 0 ? (
            <p className="dss-empty">No stores found.</p>
          ) : (
            filtered.map((s) => {
              const key = storeKey(s)
              const draft = drafts[key] || { slides: [], casinoSlides: [] }
              const savedSlides = Array.isArray(s.slides) ? s.slides.map(normalizeSlide) : []
              const savedCasinoSlides = Array.isArray(s.casinoSlides)
                ? s.casinoSlides.map(normalizeSlide)
                : []
              const dirty =
                !slidesEqual(draft.slides || [], savedSlides) ||
                !slidesEqual(draft.casinoSlides || [], savedCasinoSlides)
              const saving = savingKey === key
              const expanded = expandedKey === key
              return (
                <section key={key} className="dss-store-card">
                  <div className="dss-store-card-head">
                    <div>
                      <strong>{s.storeCode || '—'}</strong>
                      {s.username ? <span className="wl-muted"> · {s.username}</span> : null}
                      {s.distributorCode ? (
                        <div className="wl-muted">Distributor: {s.distributorCode}</div>
                      ) : null}
                      <div className="wl-muted">
                        {draftSummary(draft)}
                        {s.updatedAt ? ` · Updated ${formatUpdatedAt(s.updatedAt)}` : ''}
                        {s.updatedBy ? ` · ${s.updatedBy}` : ''}
                      </div>
                    </div>
                    <div className="dss-store-card-actions">
                      <button
                        type="button"
                        className="dss-expand"
                        onClick={() => setExpandedKey(expanded ? null : key)}
                      >
                        {expanded ? 'Hide' : 'Edit slides'}
                      </button>
                      <button
                        type="button"
                        className="dss-save"
                        disabled={saving || !!uploadingKey || !dirty}
                        onClick={() => saveRow(s)}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="dss-slides">
                      <SlideshowPlacementEditor
                        title="Homepage pictures"
                        hint="Shown on the landing / home page."
                        emptyMessage="No custom homepage slides yet. Add one below, or leave empty to keep the default website pictures."
                        slides={draft.slides || []}
                        store={s}
                        storeKeyValue={key}
                        field="slides"
                        saving={saving}
                        uploadingKey={uploadingKey}
                        onAdd={(field) => addSlide(key, field)}
                        onRemove={(field, index) => removeSlide(key, field, index)}
                        onMove={(field, index, direction) => moveSlide(key, field, index, direction)}
                        onUpdateSlide={(field, index, patch) => updateSlide(key, field, index, patch)}
                        onUpload={handleImageUpload}
                      />
                      <SlideshowPlacementEditor
                        title="Casino page pictures"
                        hint="Shown on the casino page. If you add none, the casino page uses the homepage pictures."
                        emptyMessage="No casino slides yet. The casino page will use homepage pictures until you add some here."
                        slides={draft.casinoSlides || []}
                        store={s}
                        storeKeyValue={key}
                        field="casinoSlides"
                        saving={saving}
                        uploadingKey={uploadingKey}
                        onAdd={(field) => addSlide(key, field)}
                        onRemove={(field, index) => removeSlide(key, field, index)}
                        onMove={(field, index, direction) => moveSlide(key, field, index, direction)}
                        onUpdateSlide={(field, index, patch) => updateSlide(key, field, index, patch)}
                        onUpload={handleImageUpload}
                      />
                    </div>
                  ) : null}
                </section>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
