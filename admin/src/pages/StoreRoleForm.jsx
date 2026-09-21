import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { getStoreRole, createStoreRole, updateStoreRole } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { PERMISSION_GROUPS, getAllRolePermissionKeys } from '../constants/permissionGroups'
import { STORE_FEATURE_KEYS } from '../constants/permissions'
import { teamAccessPath } from '../utils/teamAccessPaths'
import './RoleForm.css'

function initialPermissions(keys = getAllRolePermissionKeys()) {
  const p = {}
  keys.forEach((k) => { p[k] = false })
  return p
}

function canGrantKey(user, isMaster, key) {
  if (isMaster) return true
  if (!user || user.role !== ROLES.STORE_ADMIN) return false
  const perms = user.permissions
  if (!perms || typeof perms !== 'object' || Object.keys(perms).length === 0) return true
  return perms[key] === true
}

export default function StoreRoleForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const isEdit = Boolean(id)
  const distributorCode = searchParams.get('distributorCode') || ''
  const storeCode = searchParams.get('storeCode') || ''
  const backPath = useMemo(() => {
    if (isMaster && distributorCode && storeCode) {
      return teamAccessPath({ scope: 'store', tab: 'roles', distributorCode, storeCode })
    }
    return teamAccessPath({ scope: isMaster ? 'store' : undefined, tab: 'roles' })
  }, [isMaster, distributorCode, storeCode])

  const grantableKeys = useMemo(
    () => getAllRolePermissionKeys().filter((k) => canGrantKey(user, isMaster, k)),
    [user, isMaster]
  )

  const visiblePermissionGroups = useMemo(() => {
    return PERMISSION_GROUPS.map((item) => {
      if (item.key) {
        return canGrantKey(user, isMaster, item.key) ? item : null
      }
      if (item.children) {
        const children = item.children.filter((c) => canGrantKey(user, isMaster, c.key))
        if (children.length === 0) return null
        return { ...item, children }
      }
      return null
    }).filter(Boolean)
  }, [user, isMaster])

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    permissions: initialPermissions()
  })
  const [roleStoreScope, setRoleStoreScope] = useState({ distributorCode: '', storeCode: '' })

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    getStoreRole(id)
      .then((role) => {
        const perms = { ...initialPermissions(), ...(role.permissions || {}) }
        if (
          role.permissions?.[STORE_FEATURE_KEYS.BLOG_POSTS] === undefined &&
          role.permissions?.[STORE_FEATURE_KEYS.HELP_CONTENT] === true
        ) {
          perms[STORE_FEATURE_KEYS.BLOG_POSTS] = true
        }
        if (
          role.permissions?.[STORE_FEATURE_KEYS.SUPPORT_TICKETS] === undefined &&
          (
            role.permissions?.[STORE_FEATURE_KEYS.HELP_CONTENT] === true ||
            role.permissions?.[STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS] === true
          )
        ) {
          perms[STORE_FEATURE_KEYS.SUPPORT_TICKETS] = true
        }
        if (
          role.permissions?.[STORE_FEATURE_KEYS.CHIME_ACCOUNTS] === undefined &&
          role.permissions?.[STORE_FEATURE_KEYS.CHIME_DEPOSITS] === true
        ) {
          perms[STORE_FEATURE_KEYS.CHIME_ACCOUNTS] = true
        }
        if (
          role.permissions?.[STORE_FEATURE_KEYS.WALLET_ADJUST] === undefined &&
          role.permissions?.[STORE_FEATURE_KEYS.USERS_LIST] === true
        ) {
          perms[STORE_FEATURE_KEYS.WALLET_ADJUST] = true
        }
        getAllRolePermissionKeys().forEach((k) => { if (perms[k] === undefined) perms[k] = false })
        getAllRolePermissionKeys().forEach((k) => {
          if (!canGrantKey(user, isMaster, k)) perms[k] = false
        })
        setForm({
          name: role.name || '',
          slug: role.slug || '',
          permissions: perms
        })
        setRoleStoreScope({
          distributorCode: role.distributorCode || '',
          storeCode: role.storeCode || ''
        })
      })
      .catch((err) => toast.error(err.message || 'Failed to load role'))
      .finally(() => setLoading(false))
  }, [id, isEdit, user, isMaster])

  const setPerm = (key, value) => {
    if (!canGrantKey(user, isMaster, key)) return
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [key]: !!value } }))
  }

  const totalPermissions = grantableKeys.length
  const enabledPermissions = grantableKeys.filter((k) => !!form.permissions[k]).length

  const setAllPermissions = (enabled) => {
    setForm((f) => {
      const next = { ...f.permissions }
      grantableKeys.forEach((k) => { next[k] = !!enabled })
      getAllRolePermissionKeys().forEach((k) => {
        if (!canGrantKey(user, isMaster, k)) next[k] = false
      })
      return { ...f, permissions: next }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const name = form.name.trim()
    let slug = (form.slug || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 64)
    if (!name) { toast.error('Name is required'); return }
    if (!slug) {
      slug = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 64) || `role_${Date.now()}`
    }
    const scopeDc = distributorCode || roleStoreScope.distributorCode
    const scopeSc = storeCode || roleStoreScope.storeCode
    if (isMaster && !isEdit && (!scopeDc || !scopeSc)) {
      toast.error('Select a store before creating a role.')
      return
    }
    setSaving(true)
    const permissions = { ...form.permissions }
    getAllRolePermissionKeys().forEach((k) => {
      if (!canGrantKey(user, isMaster, k)) permissions[k] = false
    })
    const payload = { name, slug, permissions }
    if (isMaster && scopeDc && scopeSc) {
      payload.distributorCode = scopeDc
      payload.storeCode = scopeSc
    }

    const navigateBack = () => {
      if (isMaster && scopeDc && scopeSc) {
        navigate(teamAccessPath({ scope: 'store', tab: 'roles', distributorCode: scopeDc, storeCode: scopeSc }))
      } else {
        navigate(backPath)
      }
    }

    if (isEdit) {
      updateStoreRole(id, payload)
        .then(() => { toast.success('Role updated.'); navigateBack() })
        .catch((err) => { toast.error(err.message || 'Save failed'); setSaving(false) })
    } else {
      createStoreRole(payload)
        .then(() => { toast.success('Role created.'); navigateBack() })
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
        <h2>{isEdit ? 'Update Store Role' : 'Create Store Role'}</h2>
        <Link to={backPath} className="admin-btn admin-btn-secondary">Back</Link>
      </div>

      <form onSubmit={handleSubmit} className="role-form-container">
        <div className="role-form-section">
          <p className="role-form-section-title">Role details</p>
          {isMaster && (distributorCode || roleStoreScope.storeCode) && (
            <p className="role-form-hint" style={{ marginBottom: '1rem' }}>
              Store: <strong>{distributorCode || roleStoreScope.distributorCode}</strong> / <strong>{storeCode || roleStoreScope.storeCode}</strong>
            </p>
          )}
          <div className="role-form-row">
            <div className="role-form-group">
              <label htmlFor="sr-name">Name</label>
              <input
                id="sr-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Cashier"
                required
              />
            </div>
            <div className="role-form-group">
              <label htmlFor="sr-slug">Slug (unique per store)</label>
              <input
                id="sr-slug"
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="e.g. cashier"
              />
              <span className="role-form-hint">Lowercase letters, numbers, underscores only. One role per slug per store.</span>
            </div>
          </div>
        </div>

        <div className="role-form-section">
          <div className="role-form-permissions-head">
            <div>
              <p className="role-form-permissions-title">Permissions</p>
              <p className="role-form-permissions-desc">
                {isMaster
                  ? 'Select which features this role can access in the store.'
                  : 'You can only give staff pages that you can open yourself.'}
              </p>
            </div>
            <div className="role-form-permissions-tools">
              <span className="role-form-permissions-count">{enabledPermissions}/{totalPermissions} enabled</span>
              <button type="button" className="admin-btn admin-btn-secondary role-form-mini-btn" onClick={() => setAllPermissions(true)}>
                Select all
              </button>
              <button type="button" className="admin-btn admin-btn-secondary role-form-mini-btn" onClick={() => setAllPermissions(false)}>
                Clear all
              </button>
            </div>
          </div>
          {visiblePermissionGroups.length === 0 ? (
            <p className="role-form-hint">No page permissions available to assign.</p>
          ) : (
            <div className="permission-cards-grid">
              {visiblePermissionGroups.map((item) => {
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
          )}
        </div>

        <div className="role-form-section">
          <div className="role-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Store Role' : 'Create Store Role')}
            </button>
            <Link to={backPath} className="admin-btn admin-btn-secondary">Cancel</Link>
          </div>
        </div>
      </form>
    </div>
  )
}
