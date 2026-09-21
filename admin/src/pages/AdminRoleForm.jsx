import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getAdminRole, createAdminRole, updateAdminRole, getStores } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ADMIN_PERMISSION_GROUPS, getAllAdminRolePermissionKeys } from '../constants/permissionGroups'
import { ADMIN_FEATURE_KEYS } from '../constants/permissions'
import { teamAccessPath } from '../utils/teamAccessPaths'
import './RoleForm.css'
import './FooterPages.css'

function initialPermissions() {
  const p = {}
  getAllAdminRolePermissionKeys().forEach((k) => { p[k] = false })
  // New technical-staff roles get Welcome signup bonus on by default
  p[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] = true
  // New technical-staff roles get Dashboard slideshow on by default (all stores)
  p[ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW] = true
  p[ADMIN_FEATURE_KEYS.TRANSACTION_FEES] = true
  p[ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS] = true
  p[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] = true
  p.footer_pages_store_scope = 'all'
  p.footer_pages_store_codes = []
  p.blog_posts_store_scope = 'all'
  p.blog_posts_store_codes = []
  return p
}

function scopeKey(featureKey) {
  return `${featureKey}_store_scope`
}

function codesKey(featureKey) {
  return `${featureKey}_store_codes`
}

function readScope(perms, featureKey) {
  return perms?.[scopeKey(featureKey)] === 'particular' ? 'particular' : 'all'
}

function readStoreCode(perms, featureKey) {
  const codes = perms?.[codesKey(featureKey)]
  return Array.isArray(codes) ? (codes[0] || '') : ''
}

export default function AdminRoleForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [storeOptions, setStoreOptions] = useState([])
  const [form, setForm] = useState({
    name: '',
    slug: '',
    permissions: initialPermissions()
  })

  useEffect(() => {
    getStores({ limit: 200 })
      .then((res) => {
        const rows = res.list || res.stores || res.items || []
        setStoreOptions(
          [...new Set(
            rows
              .map((s) => s.storeCode || s.store_code)
              .filter(Boolean)
          )].sort((a, b) => String(a).localeCompare(String(b)))
        )
      })
      .catch(() => setStoreOptions([]))
  }, [])

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getAdminRole(id)
      .then((role) => {
        const perms = { ...initialPermissions(), ...(role.permissions || {}) }
        // Existing roles: keep stored value; if key was never set, default ON for welcome bonus
        if (role.permissions?.[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] === undefined) {
          perms[ADMIN_FEATURE_KEYS.WELCOME_SIGNUP_BONUS] = true
        }
        // Existing roles: if dashboard slideshow key was never set, default ON (all-store access)
        if (role.permissions?.[ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW] === undefined) {
          perms[ADMIN_FEATURE_KEYS.DASHBOARD_SLIDESHOW] = true
        }
        if (role.permissions?.[ADMIN_FEATURE_KEYS.TRANSACTION_FEES] === undefined) {
          perms[ADMIN_FEATURE_KEYS.TRANSACTION_FEES] = true
        }
        if (role.permissions?.[ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS] === undefined) {
          perms[ADMIN_FEATURE_KEYS.CHIME_DEPOSIT_ACCOUNT_TOTALS] = true
        }
        if (role.permissions?.[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] === undefined) {
          perms[ADMIN_FEATURE_KEYS.PAYMENT_TOTALS] = true
        }
        // Roles that already manage help content should get blog access when the key is new
        if (
          role.permissions?.[ADMIN_FEATURE_KEYS.BLOG_POSTS] === undefined &&
          role.permissions?.[ADMIN_FEATURE_KEYS.HELP_CONTENT] === true
        ) {
          perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] = true
        }
        // Roles that already manage Chime deposits should get Chime accounts when the key is new
        if (
          role.permissions?.[ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS] === undefined &&
          role.permissions?.[ADMIN_FEATURE_KEYS.CHIME_DEPOSITS] === true
        ) {
          perms[ADMIN_FEATURE_KEYS.CHIME_ACCOUNTS] = true
        }
        // Legacy: Users access previously included add/remove SC
        if (
          role.permissions?.[ADMIN_FEATURE_KEYS.WALLET_ADJUST] === undefined &&
          role.permissions?.[ADMIN_FEATURE_KEYS.USERS] === true
        ) {
          perms[ADMIN_FEATURE_KEYS.WALLET_ADJUST] = true
        }
        getAllAdminRolePermissionKeys().forEach((k) => {
          if (perms[k] === undefined) perms[k] = false
        })
        perms.footer_pages_store_scope = readScope(role.permissions, ADMIN_FEATURE_KEYS.FOOTER_PAGES)
        perms.footer_pages_store_codes = Array.isArray(role.permissions?.footer_pages_store_codes)
          ? role.permissions.footer_pages_store_codes
          : []
        perms.blog_posts_store_scope = readScope(role.permissions, ADMIN_FEATURE_KEYS.BLOG_POSTS)
        perms.blog_posts_store_codes = Array.isArray(role.permissions?.blog_posts_store_codes)
          ? role.permissions.blog_posts_store_codes
          : []
        setForm({
          name: role.name || '',
          slug: role.slug || '',
          permissions: perms
        })
      })
      .catch((err) => toast.error(err.message || 'Failed to load role'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  const setPerm = (key, value) => {
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [key]: !!value } }))
  }

  const setFeatureScope = (featureKey, scope) => {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        [scopeKey(featureKey)]: scope === 'particular' ? 'particular' : 'all',
        [codesKey(featureKey)]:
          scope === 'particular' ? (f.permissions[codesKey(featureKey)] || []) : []
      }
    }))
  }

  const setFeatureStoreCode = (featureKey, code) => {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        [scopeKey(featureKey)]: 'particular',
        [codesKey(featureKey)]: code ? [code] : []
      }
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const name = form.name.trim()
    let slug = (form.slug || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 64)
    if (!name) { toast.error('Name is required'); return }
    if (!slug) {
      slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 64) || `admin_role_${Date.now()}`
    }

    const permissions = { ...form.permissions }
    const scopedFeatures = [
      { key: ADMIN_FEATURE_KEYS.FOOTER_PAGES, label: 'Footer pages' },
      { key: ADMIN_FEATURE_KEYS.BLOG_POSTS, label: 'Blog posts' }
    ]
    for (const feature of scopedFeatures) {
      if (permissions[feature.key]) {
        permissions[scopeKey(feature.key)] =
          permissions[scopeKey(feature.key)] === 'particular' ? 'particular' : 'all'
        if (permissions[scopeKey(feature.key)] === 'particular') {
          const codes = Array.isArray(permissions[codesKey(feature.key)])
            ? permissions[codesKey(feature.key)].filter(Boolean)
            : []
          if (codes.length === 0) {
            toast.error(`Select a store for ${feature.label}, or choose All stores.`)
            return
          }
          permissions[codesKey(feature.key)] = codes
        } else {
          permissions[codesKey(feature.key)] = []
        }
      } else {
        permissions[scopeKey(feature.key)] = 'all'
        permissions[codesKey(feature.key)] = []
      }
    }

    setSaving(true)
    const payload = { name, slug, permissions }

    if (isEdit) {
      updateAdminRole(id, payload)
        .then(() => { toast.success('Role updated.'); navigate(teamAccessPath({ scope: 'platform', tab: 'roles' })) })
        .catch((err) => { toast.error(err.message || 'Save failed'); setSaving(false) })
    } else {
      createAdminRole(payload)
        .then(() => { toast.success('Role created.'); navigate(teamAccessPath({ scope: 'platform', tab: 'roles' })) })
        .catch((err) => { toast.error(err.message || 'Create failed'); setSaving(false) })
    }
  }

  if (loading) {
    return (
      <div className="role-form-page">
        <div className="role-form-container" style={{ padding: '2rem' }}>
          <div className="page-loading">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="role-form-page">
      <div className="page-header">
        <h2>{isEdit ? 'Update Admin Role' : 'Create Admin Role'}</h2>
        <Link to={teamAccessPath({ scope: 'platform', tab: 'roles' })} className="admin-btn admin-btn-secondary">Back</Link>
      </div>

      <form onSubmit={handleSubmit} className="role-form-container">
        <div className="role-form-section">
          <p className="role-form-section-title">Role details</p>
          <div className="role-form-row">
            <div className="role-form-group">
              <label htmlFor="ar-name">Name</label>
              <input
                id="ar-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Support"
                required
              />
            </div>
            <div className="role-form-group">
              <label htmlFor="ar-slug">Slug (unique)</label>
              <input
                id="ar-slug"
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="e.g. support"
              />
              <span className="role-form-hint">Lowercase letters, numbers, underscores only. One role per slug.</span>
            </div>
          </div>
        </div>

        <div className="role-form-section">
          <p className="role-form-permissions-title">Permissions</p>
          <p className="role-form-permissions-desc">Select which features this role can access in the admin panel. Enable “Technical error email notification” to receive technical error emails.</p>
          <div className="permission-cards-grid">
            {ADMIN_PERMISSION_GROUPS.map((item) => {
              if (item.key) {
                return (
                  <div key={item.key} className="permission-card">
                    <div className="permission-card-header">
                      <span className="permission-card-label">{item.label}</span>
                      <label className="permission-check-inline">
                        <input
                          type="checkbox"
                          checked={!!form.permissions[item.key]}
                          onChange={(e) => setPerm(item.key, e.target.checked)}
                        />
                        <span>Allow</span>
                      </label>
                    </div>
                    {item.description && <p className="permission-card-desc">{item.description}</p>}
                    {item.storeScope && !!form.permissions[item.key] && (() => {
                      const scope = readScope(form.permissions, item.key)
                      const storeCode = readStoreCode(form.permissions, item.key)
                      const noun = item.storeScopeNoun || item.label.toLowerCase()
                      return (
                        <div className="permission-store-scope">
                          <p className="permission-store-scope-title">Which stores can they edit?</p>
                          <p className="permission-store-scope-desc">
                            Pick one. Staff with this role will only manage {noun} for what you choose here.
                          </p>
                          <div className="permission-scope-choices">
                            <label className={`permission-scope-choice${scope === 'all' ? ' is-active' : ''}`}>
                              <input
                                type="radio"
                                name={`${item.key}-store-scope`}
                                checked={scope === 'all'}
                                onChange={() => setFeatureScope(item.key, 'all')}
                              />
                              <span>
                                <strong>All stores</strong>
                                <span>They can add/edit {noun} for every store.</span>
                              </span>
                            </label>
                            <label className={`permission-scope-choice${scope === 'particular' ? ' is-active' : ''}`}>
                              <input
                                type="radio"
                                name={`${item.key}-store-scope`}
                                checked={scope === 'particular'}
                                onChange={() => setFeatureScope(item.key, 'particular')}
                              />
                              <span>
                                <strong>One store only</strong>
                                <span>They can manage {noun} for just one store you pick.</span>
                              </span>
                            </label>
                          </div>
                          {scope === 'particular' && (
                            <label>
                              Which store?
                              <select
                                value={storeCode}
                                onChange={(e) => setFeatureStoreCode(item.key, e.target.value)}
                                required
                              >
                                <option value="">Pick a store…</option>
                                {storeOptions.map((code) => (
                                  <option key={code} value={code}>{code}</option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              }
              if (item.children) {
                return (
                  <div key={item.groupLabel} className="permission-card permission-card-group">
                    <p className="permission-card-group-title">{item.groupLabel}</p>
                    {item.groupDescription && <p className="permission-card-group-desc">{item.groupDescription}</p>}
                    <div className="permission-card-group-children">
                      {item.children.map((c) => (
                        <label key={c.key} className="permission-check-inline">
                          <input
                            type="checkbox"
                            checked={!!form.permissions[c.key]}
                            onChange={(e) => setPerm(c.key, e.target.checked)}
                          />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              }
              return null
            })}
          </div>
        </div>

        <div className="role-form-section">
          <div className="role-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Admin Role' : 'Create Admin Role')}
            </button>
            <Link to={teamAccessPath({ scope: 'platform', tab: 'roles' })} className="admin-btn admin-btn-secondary">Cancel</Link>
          </div>
        </div>
      </form>
    </div>
  )
}
