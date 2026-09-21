import { useState, useEffect } from 'react'
import { useNavigate, Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { ADMIN_FEATURE_KEYS, canAccessAdminFeature } from '../constants/permissions'
import { getStoresFilterOptions, createStore, getStore, updateStore } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { PERMISSION_GROUPS, getAllRolePermissionKeys } from '../constants/permissionGroups'
import { STORE_FEATURE_KEYS } from '../constants/permissions'
import './DistributorForm.css'
import './StoreForm.css'

const initialForm = {
  distributorCode: '',
  email: '',
  password: '',
  username: '',
  storeCode: '',
  userSiteUrl: '',
  firstName: '',
  lastName: '',
  isActive: true
}

function defaultPermissionValue(key) {
  return key !== STORE_FEATURE_KEYS.CASINO_GAMES_REPORT
}

function initialPermissions() {
  const p = {}
  getAllRolePermissionKeys().forEach((k) => { p[k] = defaultPermissionValue(k) })
  return p
}

function PermissionTile({ label, checked, onChange, id }) {
  return (
    <label
      htmlFor={id}
      className={`store-perm-tile ${checked ? 'store-perm-tile--on' : 'store-perm-tile--off'}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="store-perm-tile__switch" aria-hidden>
        <span className="store-perm-tile__knob" />
      </span>
      <span className="store-perm-tile__body">
        <span className="store-perm-tile__name">{label}</span>
        <span className="store-perm-tile__state">{checked ? 'ON — can open' : 'OFF — hidden'}</span>
      </span>
    </label>
  )
}

export default function StoreForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const canManagePagePermissions = isMasterAdmin && canAccessAdminFeature(user, ADMIN_FEATURE_KEYS.STORES)
  const isEdit = Boolean(id)
  const [distributorCodes, setDistributorCodes] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(isMasterAdmin)
  const [formLoading, setFormLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [showPassword, setShowPassword] = useState(false)
  const [permissions, setPermissions] = useState(initialPermissions)
  const [showPagePermissions, setShowPagePermissions] = useState(false)

  useEffect(() => {
    if (!isMasterAdmin) {
      setOptionsLoading(false)
      return
    }
    getStoresFilterOptions()
      .then((opts) => setDistributorCodes(opts.distributorCodes || []))
      .catch(() => setDistributorCodes([]))
      .finally(() => setOptionsLoading(false))
  }, [isMasterAdmin])

  useEffect(() => {
    if (!isEdit) return
    setFormLoading(true)
    getStore(id)
      .then((s) => {
        setForm({
          distributorCode: s.distributorCode ?? '',
          email: s.email ?? '',
          password: '',
          username: s.username ?? '',
          storeCode: s.storeCode ?? '',
          userSiteUrl: s.userSiteUrl ?? '',
          firstName: s.firstName ?? '',
          lastName: s.lastName ?? '',
          isActive: s.isActive !== false
        })
        if (s.canManagePagePermissions || (canManagePagePermissions && s.permissions)) {
          setShowPagePermissions(true)
          const perms = { ...initialPermissions(), ...(s.permissions || {}) }
          getAllRolePermissionKeys().forEach((k) => { if (perms[k] === undefined) perms[k] = defaultPermissionValue(k) })
          setPermissions(perms)
        }
      })
      .catch((err) => {
        toast.error(err.message || 'Failed to load store')
      })
      .finally(() => setFormLoading(false))
  }, [id, isEdit, canManagePagePermissions])

  const setPerm = (key, value) => {
    setPermissions((p) => ({ ...p, [key]: !!value }))
  }

  const totalPermissions = getAllRolePermissionKeys().length
  const enabledPermissions = Object.values(permissions || {}).filter(Boolean).length

  const setAllPermissions = (enabled) => {
    const next = {}
    getAllRolePermissionKeys().forEach((k) => { next[k] = !!enabled })
    setPermissions(next)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!isEdit && isMasterAdmin && !form.distributorCode.trim()) {
      toast.error('Please select a distributor.')
      return
    }
    setSaving(true)
    if (isEdit) {
      const payload = {
        email: form.email.trim(),
        username: form.username.trim() || undefined,
        storeCode: form.storeCode.trim() || undefined,
        userSiteUrl: form.userSiteUrl.trim() || null,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        isActive: form.isActive
      }
      if (isMasterAdmin && form.password) {
        payload.password = form.password
      }
      if (showPagePermissions && canManagePagePermissions) {
        payload.permissions = permissions
      }
      updateStore(id, payload)
        .then(() => {
          toast.success('Store updated.')
          navigate('/stores')
        })
        .catch((err) => { toast.error(err.message || 'Update failed'); setSaving(false) })
    } else {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim() || undefined,
        storeCode: form.storeCode.trim() || undefined,
        userSiteUrl: form.userSiteUrl.trim() || undefined,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        isActive: form.isActive
      }
      if (isMasterAdmin) payload.distributorCode = form.distributorCode.trim()
      createStore(payload)
        .then(() => {
          toast.success('Store created.')
          navigate('/stores')
        })
        .catch((err) => { toast.error(err.message || 'Create failed'); setSaving(false) })
    }
  }

  const wideLayout = isEdit && showPagePermissions && canManagePagePermissions

  if (formLoading) {
    return (
      <div className="admin-form-page store-form-page">
        <div className="admin-form-container">
          <div className="page-loading">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-form-page distributor-form-page store-form-page">
      <div className={`admin-form-container${wideLayout ? ' store-form-container--wide' : ''}`}>
        <div className="page-header">
          <h2>{isEdit ? 'Update Store' : 'Create Store'}</h2>
          <Link to="/stores" className="admin-btn admin-btn-secondary">Back</Link>
        </div>
        <form onSubmit={handleSubmit} className="admin-form">
          <div className={wideLayout ? 'store-form-details-grid' : undefined}>
            {isMasterAdmin && (
              <div className="admin-form-group admin-form-distributor-block">
                <label htmlFor="distributorCode" className="admin-form-distributor-label">
                  <span className="admin-form-distributor-label-text">Distributor</span>
                  <span className="admin-form-distributor-label-badge">Required</span>
                </label>
                {isEdit ? (
                  <div className="admin-form-distributor-value">
                    <input id="distributorCode" type="text" value={form.distributorCode} readOnly disabled className="admin-form-readonly" />
                  </div>
                ) : (
                  <>
                    <select
                      id="distributorCode"
                      className="admin-form-distributor-select"
                      value={form.distributorCode}
                      onChange={(e) => setForm((f) => ({ ...f, distributorCode: e.target.value }))}
                      required
                      disabled={optionsLoading}
                      aria-describedby="distributorCode-hint"
                    >
                      <option value="">Choose a distributor…</option>
                      {distributorCodes.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <span id="distributorCode-hint" className="admin-form-hint admin-form-distributor-hint">
                      This store will be linked to the selected distributor.
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="admin-form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            {(!isEdit || isMasterAdmin) && (
              <div className="admin-form-group">
                <label htmlFor="password">{isEdit ? 'Change Password' : 'Password'}</label>
                <div className="admin-form-password-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required={!isEdit}
                    minLength={8}
                    placeholder={isEdit ? "Leave blank to keep current password" : "Min 8 chars, include upper, lower, number, special"}
                  />
                  <button
                    type="button"
                    className="admin-form-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                    )}
                  </button>
                </div>
                {isEdit && <span className="admin-form-hint">Leave blank if you do not want to change the password.</span>}
              </div>
            )}
            <div className="admin-form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Optional — defaults to email prefix"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="storeCode">Store code</label>
              <input
                id="storeCode"
                type="text"
                value={form.storeCode}
                onChange={(e) => setForm((f) => ({ ...f, storeCode: e.target.value }))}
                placeholder="Optional — use username or choose (e.g. coco)"
              />
              <span className="admin-form-hint">Unique code for this store under the selected distributor.</span>
            </div>
            <div className="admin-form-group admin-form-group-url-block">
              <label htmlFor="userSiteUrl" className="admin-form-url-label">
                <span className="admin-form-url-label-text">Customer site URL</span>
                <span className="admin-form-url-label-badge">Optional</span>
              </label>
              <input
                id="userSiteUrl"
                type="url"
                className="admin-form-url-input"
                value={form.userSiteUrl}
                onChange={(e) => setForm((f) => ({ ...f, userSiteUrl: e.target.value }))}
                placeholder="https://yourstore.com"
                aria-describedby="userSiteUrl-hint"
              />
              <p id="userSiteUrl-hint" className="admin-form-url-hint">
                Used for verification emails, password resets, and referral links. Use <strong>https</strong> in production; localhost is fine for dev.
              </p>
            </div>
            <div className="admin-form-group">
              <label htmlFor="firstName">First name</label>
              <input id="firstName" type="text" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="admin-form-group">
              <label htmlFor="lastName">Last name</label>
              <input id="lastName" type="text" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="admin-form-group admin-form-group-checkbox">
              <label>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                Active
              </label>
            </div>
          </div>

          {wideLayout && (
            <div className="store-perm-board">
              <div className="store-perm-board__intro">
                <div>
                  <h3 className="store-perm-board__title">Which pages can this store open?</h3>
                  <p className="store-perm-board__hint">
                    Tap a card to switch it. <strong>Green / ON</strong> = they can open that page.
                    {' '}<em>Red / OFF</em> = that page is hidden for them.
                  </p>
                </div>
                <div className="store-perm-board__tools">
                  <span className="store-perm-board__count">{enabledPermissions} of {totalPermissions} ON</span>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary store-perm-board__btn store-perm-board__btn--on"
                    onClick={() => setAllPermissions(true)}
                  >
                    Turn all ON
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary store-perm-board__btn store-perm-board__btn--off"
                    onClick={() => setAllPermissions(false)}
                  >
                    Turn all OFF
                  </button>
                </div>
              </div>

              <div className="store-perm-legend" aria-hidden>
                <span><i className="store-perm-dot store-perm-dot--on" /> ON — page is open</span>
                <span><i className="store-perm-dot store-perm-dot--off" /> OFF — page is hidden</span>
              </div>

              <div className="store-perm-grid">
                {PERMISSION_GROUPS.map((item) => {
                  if (item.key) {
                    const on = !!permissions[item.key]
                    return (
                      <PermissionTile
                        key={item.key}
                        id={`store-perm-${item.key}`}
                        label={item.label}
                        checked={on}
                        onChange={(v) => setPerm(item.key, v)}
                      />
                    )
                  }
                  if (item.children) {
                    return (
                      <div key={item.groupLabel} className="store-perm-group">
                        <p className="store-perm-group__title">{item.groupLabel}</p>
                        <p className="store-perm-group__desc">Pick which request types they can open.</p>
                        <div className="store-perm-group__kids">
                          {item.children.map((c) => (
                            <PermissionTile
                              key={c.key}
                              id={`store-perm-${c.key}`}
                              label={c.label}
                              checked={!!permissions[c.key]}
                              onChange={(v) => setPerm(c.key, v)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  }
                  return null
                })}
              </div>
            </div>
          )}

          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || (!isEdit && isMasterAdmin && optionsLoading)}>
              {saving ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Store' : 'Create Store')}
            </button>
            <Link to="/stores" className="admin-btn admin-btn-secondary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
