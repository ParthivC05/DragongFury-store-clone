import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminHomeSchema, getStores, saveAdminHomeSchema } from '../api/admin'
import { SchemaEditor, schemaErrorFor } from '../components/SchemaEditor'
import { homeSchemaAuto, originForStore } from '../utils/pageSchema'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, filterStoreCodesByAdminScope } from '../constants/permissions'
import './BlogPosts.css'

function hostOf(origin) {
  return String(origin || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export default function HomeSchemaForm() {
  const toast = useToast()
  const { user } = useAuth()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const [storeCode, setStoreCode] = useState(() => (isMaster ? '' : (user?.storeCode || '')))
  const [storeOptions, setStoreOptions] = useState([])
  const [form, setForm] = useState({
    schemaEnabled: true,
    schemaType: 'WebPage',
    schemaFields: {},
    schemaCustom: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const origin = originForStore(storeCode)
  const auto = useMemo(() => homeSchemaAuto(origin), [origin])
  const label = hostOf(origin)

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
    getAdminHomeSchema(isMaster ? storeCode : '')
      .then((res) => {
        if (cancelled) return
        setForm({
          schemaEnabled: res.schemaEnabled !== false,
          schemaType: res.schemaType || 'WebPage',
          schemaFields: res.schemaFields || {},
          schemaCustom: res.schemaCustom || ''
        })
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || 'Could not load home page schema.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isMaster, storeCode, toast])

  const save = async (e) => {
    e.preventDefault()
    if (isMaster && !storeCode) {
      toast.error('Pick which website this schema is for.')
      return
    }
    const schemaError = schemaErrorFor(form, auto)
    if (schemaError) {
      toast.error(schemaError)
      return
    }
    setSaving(true)
    try {
      const res = await saveAdminHomeSchema(form, isMaster ? storeCode : '')
      setForm({
        schemaEnabled: res.schemaEnabled !== false,
        schemaType: res.schemaType || 'WebPage',
        schemaFields: res.schemaFields || {},
        schemaCustom: res.schemaCustom || ''
      })
      toast.success('Home page schema saved.')
    } catch (err) {
      toast.error(err.message || 'Could not save home page schema.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="blog-admin-page"><p>Loading…</p></div>

  return (
    <div className="blog-admin-page blog-admin-form-page blog-easy">
      <div className="blog-easy-top">
        <div>
          <h2>Home page schema</h2>
          <p className="blog-admin-intro">{label || 'This website'} home page. This does not change the visible page text.</p>
        </div>
        <Link to="/blog" className="admin-btn admin-btn-secondary">Go back</Link>
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
            <SchemaEditor
              value={form}
              auto={auto}
              defaultType="WebPage"
              onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </section>
        <div className="blog-easy-save">
          <button type="submit" className="admin-btn admin-btn-primary blog-easy-save-btn" disabled={saving || (isMaster && !storeCode)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
