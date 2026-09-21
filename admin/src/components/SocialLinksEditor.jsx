import { useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'
import {
  getSocialLinksSettings,
  updateSocialLinksSettings,
  clearSocialLinksSettings,
  getStoreSocialLinks,
  updateStoreSocialLinks,
  clearStoreSocialLinks,
} from '../api/socialLinks'

const EMPTY = { facebook: '', telegram: '', messenger: '', whatsapp: '' }

const FIELDS = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    placeholder: 'https://wa.me/15551234567',
    help: 'Use a wa.me or WhatsApp chat link. Leave blank to hide the icon.',
  },
  { id: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
  {
    id: 'telegram',
    label: 'Facebook Group',
    placeholder: 'https://facebook.com/groups/yourgroup',
    help: 'Shown as the Facebook Group icon on your public landing page.',
  },
  { id: 'messenger', label: 'Messenger', placeholder: 'https://m.me/yourpage' },
]

export function SocialLinksEditor({ storeId = null, title = 'Social media links', description }) {
  const toast = useToast()
  const [links, setLinks] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = storeId ? getStoreSocialLinks(storeId) : getSocialLinksSettings()
    load
      .then((res) => {
        if (cancelled) return
        const data = res?.socialLinks ?? EMPTY
        setLinks({
          facebook: data.facebook || '',
          telegram: data.telegram || '',
          messenger: data.messenger || '',
          whatsapp: data.whatsapp || '',
        })
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'Failed to load social links.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storeId, toast])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        facebook: links.facebook.trim(),
        telegram: links.telegram.trim(),
        messenger: links.messenger.trim(),
        whatsapp: links.whatsapp.trim(),
      }
      const res = storeId
        ? await updateStoreSocialLinks(storeId, payload)
        : await updateSocialLinksSettings(payload)
      const data = res?.socialLinks ?? payload
      setLinks({
        facebook: data.facebook || '',
        telegram: data.telegram || '',
        messenger: data.messenger || '',
        whatsapp: data.whatsapp || '',
      })
      toast.success(res.message || 'Social media links saved.')
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!window.confirm('Clear all social media links for this store?')) return
    setClearing(true)
    try {
      const res = storeId ? await clearStoreSocialLinks(storeId) : await clearSocialLinksSettings()
      const data = res?.socialLinks ?? EMPTY
      setLinks({
        facebook: data.facebook || '',
        telegram: data.telegram || '',
        messenger: data.messenger || '',
        whatsapp: data.whatsapp || '',
      })
      toast.success(res.message || 'Social media links cleared.')
    } catch (err) {
      toast.error(err.message || 'Clear failed.')
    } finally {
      setClearing(false)
    }
  }

  const hasAny = FIELDS.some((f) => (links[f.id] || '').trim())

  return (
    <div className="profile-site-url-panel social-links-editor">
      <div className="profile-site-url-panel-header">
        <div>
          <h3 className="profile-subcard-title profile-site-url-title">{title}</h3>
          <p className="profile-site-url-lead">
            {description ||
              'Links shown on your public landing page (Facebook, Facebook Group, Messenger, WhatsApp). Leave blank to hide an icon.'}
          </p>
        </div>
        {hasAny ? (
          <span className="profile-site-badge profile-site-badge--active">Configured</span>
        ) : (
          <span className="profile-site-badge profile-site-badge--default">Not set</span>
        )}
      </div>

      {loading ? (
        <p className="profile-hint">Loading social links…</p>
      ) : (
        <form onSubmit={handleSave} className="profile-site-url-form">
          {FIELDS.map((field) => (
            <div key={field.id} className="profile-field profile-field--full">
              <label htmlFor={`social-link-${storeId || 'profile'}-${field.id}`}>{field.label}</label>
              <input
                id={`social-link-${storeId || 'profile'}-${field.id}`}
                className="profile-site-url-input"
                type="url"
                placeholder={field.placeholder}
                value={links[field.id]}
                onChange={(e) => setLinks((prev) => ({ ...prev, [field.id]: e.target.value }))}
                disabled={saving || clearing}
                autoComplete="off"
              />
              {field.help ? <p className="profile-hint">{field.help}</p> : null}
            </div>
          ))}
          <div className="profile-site-url-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || clearing}>
              {saving ? 'Saving…' : 'Save links'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleClear}
              disabled={saving || clearing || !hasAny}
            >
              {clearing ? 'Clearing…' : 'Clear all'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
