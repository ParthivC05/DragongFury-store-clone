import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  getAdminLegalPage,
  updateAdminLegalPage,
  getStores,
  uploadAdminFooterImage
} from '../api/admin'
import { BlogContentEditor } from '../components/BlogContentEditor'
import { SeoMetaFields } from '../components/SeoMetaFields'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { LEGAL_PAGE_OPTIONS } from '../constants/legalPages'
import './BlogPosts.css'
import './FooterPages.css'

const LEGAL_PAGE_MAP = Object.fromEntries(LEGAL_PAGE_OPTIONS.map((page) => [page.pageKey, page]))

function defaultForm(catalog, storeCode = '') {
  return {
    title: catalog?.title || '',
    content: '',
    isActive: true,
    storeCode,
    metaTitle: '',
    metaDescription: '',
    metaTags: '',
    allowIndex: true
  }
}

export default function LegalPageForm() {
  const { pageKey } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const catalog = LEGAL_PAGE_MAP[pageKey]
  const initialStoreCode = isMaster
    ? (searchParams.get('storeCode') || '')
    : (user?.storeCode || '')

  const [loadStoreCode, setLoadStoreCode] = useState(initialStoreCode)
  const [form, setForm] = useState(() => defaultForm(catalog, initialStoreCode))
  const [loading, setLoading] = useState(Boolean(catalog) && (!isMaster || Boolean(initialStoreCode)))
  const [saving, setSaving] = useState(false)
  const [storeOptions, setStoreOptions] = useState([])

  useEffect(() => {
    if (!isMaster) return undefined
    let cancelled = false
    getStores({ limit: 200 })
      .then((res) => {
        if (cancelled) return
        const rows = res.list || res.stores || res.items || []
        let codes = rows
          .map((s) => s.storeCode || s.store_code)
          .filter(Boolean)
          .sort((a, b) => String(a).localeCompare(String(b)))
        const scope = user?.adminPermissions?.footer_pages_store_scope
        const limited = user?.adminPermissions?.footer_pages_store_codes
        if (scope === 'particular' && Array.isArray(limited) && limited.length > 0) {
          const allow = new Set(limited.map((c) => String(c).toLowerCase()))
          codes = codes.filter((c) => allow.has(String(c).toLowerCase()))
        }
        setStoreOptions(codes)
        setLoadStoreCode((prev) => prev || codes[0] || '')
      })
      .catch(() => {
        if (!cancelled) setStoreOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [isMaster, user])

  useEffect(() => {
    if (!catalog) return undefined
    const storeCode = isMaster ? loadStoreCode : (user?.storeCode || '')
    if (isMaster && !storeCode) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    const params = isMaster ? { storeCode } : {}
    getAdminLegalPage(pageKey, params)
      .then((res) => {
        if (cancelled) return
        const page = res.legal_page || {}
        setForm({
          title: page.title || catalog.title,
          content: page.content || '',
          isActive: page.isActive !== false,
          storeCode: page.storeCode || storeCode,
          metaTitle: page.metaTitle || '',
          metaDescription: page.metaDescription || '',
          metaTags: page.metaTags || '',
          allowIndex: page.allowIndex !== false
        })
      })
      .catch((err) => {
        if (cancelled) return
        toast.error(err.message || 'Failed to load legal page.')
        navigate('/footer')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [catalog, isMaster, pageKey, loadStoreCode, user?.storeCode, navigate, toast])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleStoreChange = (value) => {
    setForm((prev) => ({ ...prev, storeCode: value }))
    setLoadStoreCode(value)
  }

  const handleContentImageUpload = async (file) => {
    const res = await uploadAdminFooterImage(file)
    const url = res?.url
    if (!url) throw new Error('Upload failed.')
    return url
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) {
      toast.error('Title is required.')
      return
    }
    if (isMaster && !form.storeCode.trim()) {
      toast.error('Store is required.')
      return
    }
    setSaving(true)
    try {
      const body = {
        title,
        content: form.content || '',
        isActive: form.isActive !== false,
        metaTitle: form.metaTitle.trim() || null,
        metaDescription: form.metaDescription.trim() || null,
        metaTags: form.metaTags.trim() || null,
        allowIndex: form.allowIndex !== false
      }
      if (isMaster) body.storeCode = form.storeCode.trim()
      await updateAdminLegalPage(pageKey, body)
      toast.success(`${catalog.title} saved.`)
      navigate('/footer')
    } catch (err) {
      toast.error(err.message || 'Save failed.')
      setSaving(false)
    }
  }

  if (!catalog) {
    return (
      <div className="blog-admin-page">
        <p>Unknown legal page.</p>
        <Link to="/footer" className="admin-btn admin-btn-secondary">Back</Link>
      </div>
    )
  }

  if (loading) {
    return <div className="blog-admin-page"><p>Loading…</p></div>
  }

  return (
    <div className="blog-admin-page blog-admin-form-page footer-admin-page footer-form-page">
      <div className="footer-admin-hero">
        <div>
          <h2>Edit {catalog.title}</h2>
          <p className="footer-admin-hero-sub">
            Use the visual editor or HTML / code palette. Live URL is <code>{catalog.path}</code>.
          </p>
        </div>
        <Link to="/footer" className="admin-btn admin-btn-secondary">Back</Link>
      </div>

      <form className="blog-admin-form footer-form-steps" onSubmit={handleSubmit}>
        <div className="footer-form-panel">
          <p className="footer-form-panel-title">Page</p>
          {isMaster && (
            <label className="blog-admin-field">
              <span>Store</span>
              <select
                value={form.storeCode}
                onChange={(e) => handleStoreChange(e.target.value)}
                required
              >
                <option value="">Pick a store…</option>
                {storeOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          )}
          <label className="blog-admin-field">
            <span>Page title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              required
              maxLength={512}
            />
          </label>
          <div className="footer-url-preview">
            Website link: <code>{catalog.path}</code>
          </div>
          <label className="blog-admin-field blog-admin-field-toggle">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            <span>Show on website</span>
          </label>
        </div>

        <div className="footer-form-panel">
          <p className="footer-form-panel-title">Search / SEO</p>
          <SeoMetaFields
            form={form}
            setField={setField}
            hideHeading
            showIndexControl
            indexControlName={`legal-google-index-${pageKey}`}
            indexNoun="page"
            titleHint="Shown in the browser tab and Google. Leave blank to use the page title."
          />
        </div>

        <div className="footer-form-panel">
          <p className="footer-form-panel-title">Content</p>
          <p className="footer-form-panel-desc">
            Use the visual editor or HTML / code palette for full custom markup (tables, embeds, styled blocks).
          </p>
          <BlogContentEditor
            value={form.content}
            onChange={(html) => setField('content', html)}
            onUploadImage={handleContentImageUpload}
            placeholder={`Write the ${catalog.title.toLowerCase()}…`}
            minHeight="360px"
            defaultMode="visual"
          />
        </div>

        <div className="blog-admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save page'}
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => navigate('/footer')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
