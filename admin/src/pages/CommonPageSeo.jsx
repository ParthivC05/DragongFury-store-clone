import { useEffect, useMemo, useState } from 'react'
import { getAdminPageSeo, getAdminPageSeoOne, getStores, saveAdminPageSeo } from '../api/admin'
import { SeoMetaFields } from '../components/SeoMetaFields'
import { SchemaEditor, schemaErrorFor } from '../components/SchemaEditor'
import { originForStore } from '../utils/pageSchema'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, filterStoreCodesByAdminScope } from '../constants/permissions'
import './BlogPosts.css'

function hostOf(origin) {
  return String(origin || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
}

function emptyForm() {
  return {
    metaTitle: '',
    metaDescription: '',
    metaTags: '',
    canonicalUrl: '',
    allowIndex: true,
    schemaEnabled: true,
    schemaType: 'WebPage',
    schemaFields: {},
    schemaCustom: ''
  }
}

function fromApi(res) {
  return {
    metaTitle: res.metaTitle || '',
    metaDescription: res.metaDescription || '',
    metaTags: res.metaTags || '',
    canonicalUrl: res.canonicalUrl || '',
    allowIndex: res.allowIndex !== false,
    schemaEnabled: res.schemaEnabled !== false,
    schemaType: res.schemaType || 'WebPage',
    schemaFields: res.schemaFields || {},
    schemaCustom: res.schemaCustom || ''
  }
}

function pageSchemaAuto(form, origin, spec) {
  const base = String(origin || '').replace(/\/$/, '')
  const url = String(form.canonicalUrl || '').trim() || (spec.path === '/' ? `${base}/` : `${base}${spec.path}`)
  return {
    name: String(form.metaTitle || '').trim() || spec.label,
    description: String(form.metaDescription || '').trim(),
    url,
    image: '',
    author: hostOf(base),
    logo: `${base}/logo.png`,
    breadcrumbs: [
      { name: 'Home', url: `${base}/` },
      ...(spec.path === '/' ? [] : [{ name: spec.label, url }])
    ]
  }
}

export default function CommonPageSeo() {
  const toast = useToast()
  const { user } = useAuth()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const [storeCode, setStoreCode] = useState(() => (isMaster ? '' : (user?.storeCode || '')))
  const [storeOptions, setStoreOptions] = useState([])
  const [pages, setPages] = useState([])
  const [selectedKey, setSelectedKey] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const spec = pages.find((page) => page.pageKey === selectedKey) || pages[0]
  const origin = originForStore(storeCode)
  const auto = useMemo(
    () => (spec ? pageSchemaAuto(form, origin, spec) : null),
    [form, origin, spec]
  )

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }))

  useEffect(() => {
    if (!isMaster) return undefined
    getStores({ limit: 200 })
      .then((res) => {
        const rows = res.list || res.stores || res.items || []
        const codes = [...new Set(
          rows
            .map((s) => s.storeCode || s.store_code)
            .filter(Boolean)
            .map((code) => String(code))
        )].sort((a, b) => a.localeCompare(b))
        const scoped = filterStoreCodesByAdminScope(codes, user?.adminPermissions, ADMIN_FEATURE_KEYS.BLOG_POSTS)
        setStoreOptions(scoped)
        setStoreCode((prev) => {
          if (prev && scoped.some((c) => c.toLowerCase() === String(prev).toLowerCase())) return prev
          return scoped[0] || ''
        })
      })
      .catch(() => setStoreOptions([]))
    return undefined
  }, [isMaster, user])

  useEffect(() => {
    if (isMaster && !storeCode) {
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    getAdminPageSeo(isMaster ? storeCode : '')
      .then((res) => {
        if (cancelled) return
        const list = res.pages || []
        setPages(list)
        setSelectedKey((prev) => {
          if (prev && list.some((page) => page.pageKey === prev)) return prev
          return list[0]?.pageKey || ''
        })
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'Could not load common page SEO.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isMaster, storeCode, toast])

  useEffect(() => {
    if (!selectedKey || (isMaster && !storeCode)) return undefined
    let cancelled = false
    getAdminPageSeoOne(selectedKey, isMaster ? storeCode : '')
      .then((res) => {
        if (!cancelled) setForm(fromApi(res || {}))
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'Could not load this page.')
      })
    return () => {
      cancelled = true
    }
  }, [selectedKey, isMaster, storeCode, toast])

  const save = async (e) => {
    e.preventDefault()
    if (!selectedKey) return
    if (isMaster && !storeCode) {
      toast.error('Pick which website these SEO settings are for.')
      return
    }
    const schemaError = auto ? schemaErrorFor(form, auto) : ''
    if (schemaError) {
      toast.error(schemaError)
      return
    }
    setSaving(true)
    try {
      const res = await saveAdminPageSeo(selectedKey, form, isMaster ? storeCode : '')
      setForm(fromApi(res))
      setPages((prev) => prev.map((page) => (
        page.pageKey === selectedKey
          ? { ...page, metaTitle: res.metaTitle || '', allowIndex: res.allowIndex !== false }
          : page
      )))
      toast.success(`${spec?.label || 'Page'} SEO saved.`)
    } catch (err) {
      toast.error(err.message || 'Could not save page SEO.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="blog-admin-page"><p>Loading…</p></div>

  return (
    <div className="blog-admin-page blog-admin-form-page blog-easy">
      <div className="blog-easy-top">
        <div>
          <h2>Common SEO pages</h2>
          <p className="blog-admin-intro">
            Title, description, canonical, robots, and schema for fixed pages
            ({hostOf(origin) || 'this website'}). Leave a field blank to keep the site default.
          </p>
        </div>
      </div>

      <form className="blog-easy-form" onSubmit={save}>
        {isMaster && (
          <section className="blog-easy-step">
            <p className="blog-easy-num">1</p>
            <div className="blog-easy-step-body">
              <label className="blog-admin-field">
                <span>Which website?</span>
                <select value={storeCode} onChange={(e) => setStoreCode(e.target.value)} required>
                  {storeOptions.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        <section className="blog-easy-step">
          <p className="blog-easy-num">{isMaster ? '2' : '1'}</p>
          <div className="blog-easy-step-body">
            <label className="blog-admin-field">
              <span>Page</span>
              <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
                {pages.map((page) => (
                  <option key={page.pageKey} value={page.pageKey}>
                    {page.label} ({page.path}){page.metaTitle ? ` — ${page.metaTitle}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {spec ? (
              <p className="blog-admin-hint">Live URL: <code>{spec.path}</code></p>
            ) : null}
          </div>
        </section>

        {spec ? (
          <>
            <section className="blog-easy-step">
              <p className="blog-easy-num">{isMaster ? '3' : '2'}</p>
              <div className="blog-easy-step-body">
                <p className="footer-form-panel-title">Search / SEO</p>
                <SeoMetaFields
                  form={form}
                  setField={setField}
                  hideHeading
                  showIndexControl
                  showCanonical
                  indexNoun="page"
                  indexControlName={`common-seo-${spec.pageKey}`}
                  titleHint="Browser tab title, Google snippet, canonical, and index setting for this fixed page."
                />
              </div>
            </section>
            <section className="blog-easy-step">
              <p className="blog-easy-num">{isMaster ? '4' : '3'}</p>
              <div className="blog-easy-step-body">
                <p className="footer-form-panel-title">Schema</p>
                <SchemaEditor
                  value={form}
                  auto={auto}
                  defaultType="WebPage"
                  onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
                />
              </div>
            </section>
          </>
        ) : null}

        <div className="blog-easy-save">
          <button type="submit" className="admin-btn admin-btn-primary blog-easy-save-btn" disabled={saving || !selectedKey || (isMaster && !storeCode)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
