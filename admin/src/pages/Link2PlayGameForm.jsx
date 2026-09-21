import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createAdminLink2PlayGame,
  getAdminLink2PlayGame,
  updateAdminLink2PlayGame,
  uploadAdminLink2PlayImage,
  getStores
} from '../api/admin'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './BlogPosts.css'

const EXCLUDED_STORES = new Set(['casinoslots', 'grandsweeps', 'grandsweep'])

const EMPTY = {
  name: '',
  imageUrl: '',
  isPopular: false,
  isLive: true,
  linkWeb: '',
  linkAndroid: '',
  linkIos: '',
  isActive: true,
  storeCode: ''
}

function normalizeStoreCode(code) {
  return String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

export default function Link2PlayGameForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    storeCode: isMaster ? 'dragonfury' : (user?.storeCode || '')
  }))
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [storeOptions, setStoreOptions] = useState([])

  useEffect(() => {
    if (!isMaster) return
    getStores({ limit: 200 })
      .then((res) => {
        const rows = res.list || res.stores || res.items || []
        setStoreOptions(
          rows
            .map((s) => s.storeCode || s.store_code)
            .filter((code) => code && !EXCLUDED_STORES.has(normalizeStoreCode(code)))
            .sort((a, b) => String(a).localeCompare(String(b)))
        )
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster])

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getAdminLink2PlayGame(id)
      .then((res) => {
        const game = res.link2play_game || {}
        setForm({
          name: game.name || '',
          imageUrl: game.imageUrl || '',
          isPopular: Boolean(game.isPopular),
          isLive: game.isLive !== false,
          linkWeb: game.linkWeb || '',
          linkAndroid: game.linkAndroid || '',
          linkIos: game.linkIos || '',
          isActive: game.isActive !== false,
          storeCode: game.storeCode || ''
        })
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load Link2Play game.')
        navigate('/link2play')
      })
      .finally(() => setLoading(false))
  }, [id, isEdit, navigate, toast])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingImage(true)
    try {
      const res = await uploadAdminLink2PlayImage(file)
      const url = res?.url
      if (!url) throw new Error('Upload failed.')
      setField('imageUrl', url)
      toast.success('Image uploaded.')
    } catch (err) {
      toast.error(err.message || 'Image upload failed.')
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Game name is required.')
      return
    }
    if (!form.isPopular && !form.isLive) {
      toast.error('Select at least one category: Popular or Live.')
      return
    }
    if (isMaster && !form.storeCode.trim()) {
      toast.error('Store code is required.')
      return
    }
    const linkWeb = form.linkWeb.trim()
    const linkAndroid = form.linkAndroid.trim()
    const linkIos = form.linkIos.trim()
    if (!linkWeb && !linkAndroid && !linkIos) {
      toast.error('At least one platform link (Web, Android, or iPhone) is required.')
      return
    }

    setSaving(true)
    const body = {
      name: form.name.trim(),
      imageUrl: form.imageUrl.trim() || null,
      isPopular: Boolean(form.isPopular),
      isLive: Boolean(form.isLive),
      linkWeb: linkWeb || null,
      linkAndroid: linkAndroid || null,
      linkIos: linkIos || null,
      isActive: Boolean(form.isActive)
    }
    if (isMaster) body.storeCode = form.storeCode.trim()

    try {
      if (isEdit) {
        await updateAdminLink2PlayGame(id, body)
        toast.success('Link2Play game updated.')
      } else {
        await createAdminLink2PlayGame(body)
        toast.success('Link2Play game created.')
      }
      navigate('/link2play')
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="blog-admin-page"><p>Loading…</p></div>
  }

  return (
    <div className="blog-admin-page blog-admin-form-page">
      <div className="blog-admin-header">
        <div>
          <h2>{isEdit ? 'Edit Link2Play game' : 'Add Link2Play game'}</h2>
          <p className="blog-admin-intro">
            Empty platform links are hidden on the site. Casinoslots and grandsweeps are excluded.
          </p>
        </div>
        <Link to="/link2play" className="admin-btn admin-btn-secondary">Back to list</Link>
      </div>

      <form className="blog-admin-form" onSubmit={handleSubmit}>
        {isMaster && (
          <label className="blog-admin-field">
            <span>Store code</span>
            <select
              value={form.storeCode}
              onChange={(e) => setField('storeCode', e.target.value)}
              required
            >
              <option value="">Select store</option>
              {storeOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
              {!storeOptions.includes('dragonfury') && (
                <option value="dragonfury">dragonfury</option>
              )}
            </select>
          </label>
        )}

        <label className="blog-admin-field">
          <span>Game name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
            maxLength={255}
            placeholder="e.g. Golden Dragon"
          />
        </label>

        <div className="blog-admin-field">
          <span>Category <em className="blog-admin-required">(at least one)</em></span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={form.isPopular}
                onChange={(e) => setField('isPopular', e.target.checked)}
              />
              Popular
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={form.isLive}
                onChange={(e) => setField('isLive', e.target.checked)}
              />
              Live
            </label>
          </div>
        </div>

        <div className="blog-admin-field">
          <span>Game image</span>
          <div className="blog-admin-cover">
            {form.imageUrl ? (
              <div className="blog-admin-cover-preview">
                <img src={form.imageUrl} alt="Game preview" />
              </div>
            ) : (
              <div className="blog-admin-cover-empty">No image yet</div>
            )}
            <div className="blog-admin-cover-actions">
              <label className="admin-btn admin-btn-secondary blog-admin-upload-btn">
                {uploadingImage ? 'Uploading…' : form.imageUrl ? 'Replace image' : 'Upload image'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={uploadingImage}
                  onChange={handleImageUpload}
                />
              </label>
              {form.imageUrl ? (
                <button
                  type="button"
                  className="admin-btn admin-btn-secondary admin-btn-sm"
                  onClick={() => setField('imageUrl', '')}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <label className="blog-admin-field">
          <span>Web link</span>
          <input
            type="url"
            value={form.linkWeb}
            onChange={(e) => setField('linkWeb', e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label className="blog-admin-field">
          <span>Android link</span>
          <input
            type="url"
            value={form.linkAndroid}
            onChange={(e) => setField('linkAndroid', e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label className="blog-admin-field">
          <span>iPhone link</span>
          <input
            type="url"
            value={form.linkIos}
            onChange={(e) => setField('linkIos', e.target.value)}
            placeholder="https://…"
          />
        </label>

        <p className="blog-admin-intro" style={{ marginTop: '-0.5rem' }}>
          At least one of Web / Android / iPhone is required. Empty links are not shown on the site.
        </p>

        <label className="blog-admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setField('isActive', e.target.checked)}
          />
          <span>Active (visible on Link2Play page)</span>
        </label>

        <div className="blog-admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || uploadingImage}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create game'}
          </button>
          <Link to="/link2play" className="admin-btn admin-btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
