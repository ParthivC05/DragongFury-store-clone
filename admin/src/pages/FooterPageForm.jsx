import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  createAdminFooterPage,
  getAdminFooterPage,
  updateAdminFooterPage,
  getAdminFooterMenus,
  getStores
} from '../api/admin'
import { SeoMetaFields } from '../components/SeoMetaFields'
import { FooterPageLayoutEditor } from '../components/FooterPageLayoutEditor'
import { emptySections, layoutHasContent, sectionsToHtml } from '../components/footerPageLayoutDefaults'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import './BlogPosts.css'
import './FooterPages.css'

function slugify(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function blockNeedsButtonUrl(block) {
  return Boolean(block?.showButton) && !String(block?.buttonUrl || '').trim()
}

function normalizeRedirectInput(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (!s.startsWith('/')) s = `/${s}`
  return s
}

const EMPTY = {
  title: '',
  slug: '',
  content: '',
  linkType: 'content',
  redirectPath: '',
  menuId: '',
  sortOrder: 0,
  isActive: true,
  storeCode: '',
  slugTouched: false,
  metaTitle: '',
  metaDescription: '',
  metaTags: '',
  allowIndex: true,
  sections: emptySections()
}

export default function FooterPageForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const isMaster = user?.role === ROLES.MASTER_ADMIN

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    menuId: searchParams.get('menuId') || '',
    storeCode: isMaster
      ? (searchParams.get('storeCode') || '')
      : (user?.storeCode || '')
  }))
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [storeOptions, setStoreOptions] = useState([])
  const [menus, setMenus] = useState([])
  const [slugError, setSlugError] = useState('')

  useEffect(() => {
    if (!isMaster) return
    getStores({ limit: 200 })
      .then((res) => {
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
        setForm((prev) => {
          if (prev.storeCode || isEdit) return prev
          return { ...prev, storeCode: codes[0] || '' }
        })
      })
      .catch(() => setStoreOptions([]))
  }, [isMaster, user, isEdit])

  useEffect(() => {
    const params = {}
    if (isMaster) {
      if (!form.storeCode) {
        setMenus([])
        return
      }
      params.storeCode = form.storeCode
    }
    getAdminFooterMenus(params)
      .then((res) => setMenus(res.footer_menus || []))
      .catch(() => setMenus([]))
  }, [isMaster, form.storeCode])

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getAdminFooterPage(id)
      .then((res) => {
        const page = res.footer_page || {}
        const isRedirect = Boolean(page.redirectPath) || page.linkType === 'redirect'
        setForm({
          title: page.title || '',
          slug: page.slug || '',
          content: page.content || '',
          linkType: isRedirect ? 'redirect' : 'content',
          redirectPath: page.redirectPath || '',
          menuId: page.menuId != null ? String(page.menuId) : '',
          sortOrder: page.sortOrder ?? 0,
          isActive: page.isActive !== false,
          storeCode: page.storeCode || '',
          slugTouched: true,
          metaTitle: page.metaTitle || '',
          metaDescription: page.metaDescription || '',
          metaTags: page.metaTags || '',
          allowIndex: page.allowIndex !== false,
          sections: page.sections || emptySections()
        })
        setSlugError('')
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load footer page.')
        navigate('/footer')
      })
      .finally(() => setLoading(false))
  }, [id, isEdit, navigate, toast])

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (key === 'slug') setSlugError('')
  }

  const handleTitleChange = (value) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: prev.slugTouched ? prev.slug : slugify(value)
    }))
    if (!form.slugTouched) setSlugError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const title = form.title.trim()
    const slug = slugify(form.slug || title)
    const isRedirect = form.linkType === 'redirect'
    const redirectPath = normalizeRedirectInput(form.redirectPath)
    setSlugError('')
    if (!title) {
      toast.error('Title is required.')
      return
    }
    if (!slug) {
      setSlugError('Slug is required.')
      toast.error('Slug is required.')
      return
    }
    if (!form.menuId) {
      toast.error('Select a footer menu.')
      return
    }
    if (isMaster && !isEdit && !form.storeCode.trim()) {
      toast.error('Store is required.')
      return
    }
    if (isRedirect && !redirectPath) {
      toast.error('Redirect is required (e.g. /download or https://example.com).')
      return
    }
    if (!isRedirect) {
      const hero = form.sections?.hero || {}
      const blocks = Array.isArray(form.sections?.blocks) ? form.sections.blocks : []
      if (blockNeedsButtonUrl(hero) || blocks.some(blockNeedsButtonUrl)) {
        toast.error('Add a button link, or turn the button off.')
        return
      }
    }

    setSaving(true)
    try {
      const body = {
        title,
        slug,
        linkType: isRedirect ? 'redirect' : 'content',
        redirectPath: isRedirect ? redirectPath : null,
        menuId: Number(form.menuId),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive !== false,
        metaTitle: form.metaTitle.trim() || null,
        metaDescription: form.metaDescription.trim() || null,
        metaTags: form.metaTags.trim() || null,
        allowIndex: form.allowIndex !== false,
        sections: isRedirect ? emptySections() : (form.sections || emptySections()),
        content: isRedirect
          ? ''
          : (layoutHasContent(form.sections)
            ? sectionsToHtml(form.sections)
            : (form.content || ''))
      }
      if (isMaster && !isEdit) body.storeCode = form.storeCode.trim()
      if (isEdit) {
        await updateAdminFooterPage(id, body)
        toast.success('Footer page updated.')
      } else {
        await createAdminFooterPage(body)
        toast.success('Footer page created.')
      }
      navigate('/footer')
    } catch (err) {
      const msg = err.message || 'Save failed.'
      const taken =
        err.status === 409 ||
        err.code === 'FOOTER_SLUG_TAKEN' ||
        /slug already used/i.test(msg) ||
        /already exists/i.test(msg)
      if (taken) {
        const text = 'Slug already used. Please choose another slug.'
        setSlugError(text)
        toast.error(text)
      } else {
        toast.error(msg)
      }
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="blog-admin-page"><p>Loading…</p></div>
  }

  const previewSlug = slugify(form.slug) || 'your-slug'
  const isRedirect = form.linkType === 'redirect'

  return (
    <div className="blog-admin-page blog-admin-form-page footer-admin-page footer-form-page">
      <div className="footer-admin-hero">
        <div>
          <h2>{isEdit ? 'Edit footer page' : 'Add a footer page'}</h2>
          <p className="footer-admin-hero-sub">
            Choose where the link sits, write the page, then save. Live URL is /page-name.
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
                onChange={(e) => {
                  setField('storeCode', e.target.value)
                  setField('menuId', '')
                }}
                disabled={isEdit}
                required={!isEdit}
              >
                <option value="">Pick a store…</option>
                {storeOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          )}
          <label className="blog-admin-field">
            <span>Footer group</span>
            <select
              value={form.menuId}
              onChange={(e) => setField('menuId', e.target.value)}
              required
            >
              <option value="">Pick a group…</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {menus.length === 0 && (
              <span className="blog-admin-hint">
                No group yet. <Link to="/footer">Create one</Link> first.
              </span>
            )}
          </label>
          <label className="blog-admin-field">
            <span>Page title</span>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Terms & Conditions"
              required
            />
          </label>
          <fieldset className="footer-link-type">
            <legend>What should this link do?</legend>
            <label className="blog-admin-field-toggle">
              <input
                type="radio"
                name="linkType"
                checked={!isRedirect}
                onChange={() => setField('linkType', 'content')}
              />
              <span>Open a page</span>
            </label>
            <label className="blog-admin-field-toggle">
              <input
                type="radio"
                name="linkType"
                checked={isRedirect}
                onChange={() => setField('linkType', 'redirect')}
              />
              <span>Send people somewhere else</span>
            </label>
          </fieldset>
          {isRedirect ? (
            <label className="blog-admin-field">
              <span>Send them to</span>
              <input
                type="text"
                value={form.redirectPath}
                onChange={(e) => setField('redirectPath', e.target.value)}
                placeholder="/download or https://example.com"
                required
              />
            </label>
          ) : null}
          <label className="blog-admin-field">
            <span>Link name</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => {
                setField('slugTouched', true)
                setField('slug', e.target.value)
              }}
              placeholder="terms-and-conditions"
              required
              aria-invalid={Boolean(slugError)}
            />
            {slugError ? (
              <span className="blog-admin-hint" style={{ color: '#b91c1c' }}>{slugError}</span>
            ) : (
              <div className="footer-url-preview">
                {isRedirect
                  ? <>Opens <code>{normalizeRedirectInput(form.redirectPath) || '/…'}</code></>
                  : <>Website link: <code>/{previewSlug}</code></>}
              </div>
            )}
          </label>
          <label className="blog-admin-field blog-admin-field-toggle">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            <span>Show on website</span>
          </label>
          <details className="footer-form-more">
            <summary>More options</summary>
            <label className="blog-admin-field">
              <span>Order in the footer (smaller = first)</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setField('sortOrder', e.target.value)}
              />
            </label>
          </details>
        </div>

        {!isRedirect && (
          <>
            <div className="footer-form-panel">
              <p className="footer-form-panel-title">Search / SEO</p>
              <SeoMetaFields
                form={form}
                setField={setField}
                hideHeading
                showIndexControl
                indexControlName="footer-google-index"
                indexNoun="page"
                titleHint="Shown in the browser tab and Google. Leave blank to use the page title."
              />
            </div>
            <div className="footer-form-panel">
              <p className="footer-form-panel-title">Page layout</p>
              <p className="footer-form-panel-desc">
                Add a heading, text, and optional photo or button. Open a section to edit it.
              </p>
              <FooterPageLayoutEditor
                value={form.sections}
                onChange={(sections) => setField('sections', sections)}
                legacyHtml={!layoutHasContent(form.sections) ? form.content : ''}
              />
            </div>
          </>
        )}

        <div className="blog-admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save page' : 'Create page')}
          </button>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={() => navigate('/footer')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
