import { useCallback, useEffect, useMemo, useState } from 'react'
import * as welcomeSignupBonusApi from '../api/welcomeSignupBonus'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './WalletLimits.css'
import './WelcomeSignupBonus.css'

const MAX_AMOUNT_SC = 10000

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

function isValidAmount(raw) {
  if (raw === '' || raw == null) return false
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT_SC) return false
  return true
}

function normalizeImageUrl(value) {
  if (value == null) return null
  const url = String(value).trim()
  return url || null
}

export default function WelcomeSignupBonus() {
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN

  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState([])
  const [drafts, setDrafts] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [uploadingKey, setUploadingKey] = useState(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await welcomeSignupBonusApi.listWelcomeSignupBonusStores()
      const list = Array.isArray(data?.stores) ? data.stores : []
      setStores(list)
      const nextDrafts = {}
      list.forEach((s) => {
        const key = storeKey(s)
        nextDrafts[key] = {
          enabled: s.enabled === true,
          amountSc: s.amountSc != null ? String(s.amountSc) : '10',
          modalImageUrl: normalizeImageUrl(s.modalImageUrl)
        }
      })
      setDrafts(nextDrafts)
    } catch (err) {
      toast.error(err.message || 'Unable to load welcome signup bonus settings.')
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

  function updateDraft(key, patch) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch }
    }))
  }

  async function handleModalImageUpload(store, file) {
    if (!file) return
    const key = storeKey(store)
    setUploadingKey(key)
    try {
      const res = await welcomeSignupBonusApi.uploadWelcomeSignupBonusModalImage(file)
      const url = res?.data?.url
      if (!url) throw new Error('Upload did not return a URL.')
      updateDraft(key, { modalImageUrl: url })
      toast.success('Image uploaded. Remember to save.')
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
    if (!isValidAmount(draft.amountSc)) {
      toast.error(`Amount must be a number between 0 and ${MAX_AMOUNT_SC}.`)
      return
    }
    if (draft.enabled === true && !(Number(draft.amountSc) > 0)) {
      toast.error('When enabled, amount must be greater than 0.')
      return
    }

    setSavingKey(key)
    try {
      const payload = {
        enabled: draft.enabled === true,
        amountSc: Number(draft.amountSc),
        modalImageUrl: normalizeImageUrl(draft.modalImageUrl)
      }
      if (isMasterAdmin) {
        payload.storeCode = store.storeCode
        if (store.distributorCode != null) payload.distributorCode = store.distributorCode
      }
      const updated = await welcomeSignupBonusApi.updateWelcomeSignupBonusStore(payload)
      toast.success(
        `Saved ${store.storeCode}: ${updated.enabled ? `${updated.amountSc} SC` : 'disabled'}.`
      )
      await load()
    } catch (err) {
      toast.error(err.message || 'Unable to save welcome signup bonus.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="wallet-limits-page welcome-signup-bonus-page">
      <header className="wallet-limits-header">
        <h1>Welcome signup bonus</h1>
        <p>
          Set how much free SC new players receive when they sign up, and the image shown in the
          landing-page welcome bonus popup (WEBP only, max 150 KB). Guests see it about 1–2 seconds
          after opening the site.
          {isMasterAdmin
            ? ' Super admin and technical staff can view and edit every store.'
            : ' Changes apply only to your store.'}
          {' '}Grant happens once per user at signup when Enabled is on and amount is greater than 0.
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
        <div className="wl-table-wrap">
          <table className="wl-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Distributor</th>
                <th>Enabled</th>
                <th>Amount (SC)</th>
                <th>Landing modal image</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="wsb-empty">
                    No stores found.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const key = storeKey(s)
                  const draft = drafts[key] || {
                    enabled: false,
                    amountSc: '10',
                    modalImageUrl: null
                  }
                  const amountOk = isValidAmount(draft.amountSc)
                  const enabledNeedsPositive =
                    draft.enabled === true && !(Number(draft.amountSc) > 0)
                  const savedImage = normalizeImageUrl(s.modalImageUrl)
                  const draftImage = normalizeImageUrl(draft.modalImageUrl)
                  const dirty =
                    draft.enabled !== (s.enabled === true) ||
                    Number(draft.amountSc) !== Number(s.amountSc) ||
                    draftImage !== savedImage
                  const saving = savingKey === key
                  const uploading = uploadingKey === key
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
                        <label className="wsb-toggle">
                          <input
                            type="checkbox"
                            checked={draft.enabled === true}
                            onChange={(e) => updateDraft(key, { enabled: e.target.checked })}
                            disabled={saving || uploading}
                          />
                          <span>{draft.enabled ? 'On' : 'Off'}</span>
                        </label>
                      </td>
                      <td>
                        <input
                          className={`store-features-input wsb-amount ${amountOk && !enabledNeedsPositive ? '' : 'wsb-amount--invalid'}`}
                          type="number"
                          min={0}
                          max={MAX_AMOUNT_SC}
                          step="0.01"
                          value={draft.amountSc}
                          onChange={(e) => updateDraft(key, { amountSc: e.target.value })}
                          disabled={saving || uploading}
                        />
                      </td>
                      <td>
                        <div className="wsb-image-cell">
                          {draftImage ? (
                            <img
                              src={draftImage}
                              alt={`${s.storeCode || 'Store'} welcome modal`}
                              className="wsb-image-preview"
                            />
                          ) : (
                            <div className="wsb-image-placeholder">No image<br />(modal hidden)</div>
                          )}
                          <div className="wsb-image-actions">
                            <label className="wsb-upload">
                              {uploading ? 'Uploading…' : draftImage ? 'Replace' : 'Upload'}
                              <input
                                type="file"
                                accept="image/webp,.webp"
                                hidden
                                disabled={saving || uploading}
                                onChange={(e) => {
                                  handleModalImageUpload(s, e.target.files?.[0])
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            <span className="wsb-image-hint">WEBP only, max {welcomeSignupBonusApi.MAX_MODAL_IMAGE_LABEL}</span>
                            {draftImage ? (
                              <button
                                type="button"
                                className="wsb-remove-image"
                                disabled={saving || uploading}
                                onClick={() => updateDraft(key, { modalImageUrl: null })}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div>{formatUpdatedAt(s.updatedAt)}</div>
                        {s.updatedBy ? <span className="wl-muted">{s.updatedBy}</span> : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="wsb-save"
                          disabled={saving || uploading || !amountOk || enabledNeedsPositive || !dirty}
                          onClick={() => saveRow(s)}
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
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
