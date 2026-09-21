import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getAdminStaff, getAdminRoles, createAdminStaff, updateAdminStaff } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { ADMIN_FEATURE_KEYS } from '../constants/permissions'
import { teamAccessPath } from '../utils/teamAccessPaths'
import './StoreStaffForm.css'
import './FooterPages.css'

function describeFooterAccess(role) {
  if (!role) {
    return {
      title: 'Full admin',
      text: 'No role selected — this person can manage footer links and blog posts for all stores (full admin).'
    }
  }
  const perms = role.permissions || {}
  if (perms[ADMIN_FEATURE_KEYS.FOOTER_PAGES] !== true) {
    return {
      title: 'No footer access',
      text: 'This role cannot manage footer links. Turn on “Footer pages” in Admin roles if needed.'
    }
  }
  const scope = perms.footer_pages_store_scope === 'particular' ? 'particular' : 'all'
  if (scope === 'particular') {
    const codes = Array.isArray(perms.footer_pages_store_codes) ? perms.footer_pages_store_codes.filter(Boolean) : []
    const storeLabel = codes.length ? codes.join(', ') : 'a store you still need to pick on the role'
    return {
      title: 'Footer: one store',
      text: `This role can manage footer links only for: ${storeLabel}.`
    }
  }
  return {
    title: 'Footer: all stores',
    text: 'This role can manage footer links for every store.'
  }
}

function describeBlogAccess(role) {
  if (!role) {
    return {
      title: 'Blog: all stores',
      text: 'No role selected — this person can manage blog posts for all stores (full admin).'
    }
  }
  const perms = role.permissions || {}
  if (perms[ADMIN_FEATURE_KEYS.BLOG_POSTS] !== true) {
    return {
      title: 'No blog access',
      text: 'This role cannot manage blog posts. Turn on “Blog posts” in Admin roles if needed.'
    }
  }
  const scope = perms.blog_posts_store_scope === 'particular' ? 'particular' : 'all'
  if (scope === 'particular') {
    const codes = Array.isArray(perms.blog_posts_store_codes) ? perms.blog_posts_store_codes.filter(Boolean) : []
    const storeLabel = codes.length ? codes.join(', ') : 'a store you still need to pick on the role'
    return {
      title: 'Blog: one store',
      text: `This role can manage blog posts only for: ${storeLabel}.`
    }
  }
  return {
    title: 'Blog: all stores',
    text: 'This role can manage blog posts for every store.'
  }
}

export default function AdminStaffForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [adminRoles, setAdminRoles] = useState([])
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    firstName: '',
    lastName: '',
    adminRoleId: '',
    isActive: true
  })

  useEffect(() => {
    const load = async () => {
      try {
        const [staffRes, rolesRes] = await Promise.all([getAdminStaff(), getAdminRoles()])
        setAdminRoles(rolesRes.list || [])
        if (isEdit) {
          const staff = (staffRes.list || []).find((s) => String(s.userId) === String(id))
          if (!staff) {
            toast.error('Staff not found')
            navigate(teamAccessPath({ scope: 'platform', tab: 'staff' }))
            return
          }
          setForm({
            email: staff.email || '',
            password: '',
            username: staff.username || '',
            firstName: staff.firstName || '',
            lastName: staff.lastName || '',
            adminRoleId: staff.adminRoleId ?? '',
            isActive: staff.isActive !== false
          })
        }
      } catch (err) {
        toast.error(err.message || 'Failed to load')
        if (isEdit) navigate(teamAccessPath({ scope: 'platform', tab: 'staff' }))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, isEdit])

  const selectedRole = useMemo(() => {
    if (!form.adminRoleId) return null
    return adminRoles.find((r) => String(r.id) === String(form.adminRoleId)) || null
  }, [adminRoles, form.adminRoleId])

  const footerAccess = describeFooterAccess(selectedRole)
  const blogAccess = describeBlogAccess(selectedRole)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.email.trim()) { toast.error('Email is required'); return }
    if (!isEdit && !form.password) { toast.error('Password is required for new staff'); return }
    setSaving(true)
    if (isEdit) {
      const payload = {
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        adminRoleId: form.adminRoleId ? Number(form.adminRoleId) : null,
        isActive: form.isActive
      }
      updateAdminStaff(id, payload)
        .then(() => { toast.success('Staff updated.'); navigate(teamAccessPath({ scope: 'platform', tab: 'staff' })) })
        .catch((err) => toast.error(err.message || 'Update failed'))
        .finally(() => setSaving(false))
    } else {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim() || undefined,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        adminRoleId: form.adminRoleId ? Number(form.adminRoleId) : undefined,
        isActive: form.isActive
      }
      createAdminStaff(payload)
        .then(() => { toast.success('Staff created.'); navigate(teamAccessPath({ scope: 'platform', tab: 'staff' })) })
        .catch((err) => toast.error(err.message || 'Create failed'))
        .finally(() => setSaving(false))
    }
  }

  if (loading) {
    return (
      <div className="store-staff-form-page">
        <div className="store-staff-form-container" style={{ padding: '2rem' }}>
          <div className="page-loading">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="store-staff-form-page">
      <div className="page-header">
        <h2>{isEdit ? 'Update Admin Staff' : 'Create Admin Staff'}</h2>
        <Link to={teamAccessPath({ scope: 'platform', tab: 'staff' })} className="admin-btn admin-btn-secondary">Back</Link>
      </div>

      <form onSubmit={handleSubmit} className="store-staff-form-container">
        <div className="store-staff-form-section">
          <p className="store-staff-form-section-title">Staff details</p>
          <div className="store-staff-form-row">
            <div className="store-staff-form-group">
              <label htmlFor="asf-email">Email</label>
              <input
                id="asf-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                disabled={!!isEdit}
              />
              {isEdit && <span className="store-staff-form-hint">Email cannot be changed.</span>}
            </div>
            {!isEdit ? (
              <div className="store-staff-form-group">
                <label htmlFor="asf-password">Password</label>
                <input
                  id="asf-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
            ) : (
              <div className="admin-form-group">
                <span className="admin-form-hint">Password cannot be changed here. Use Forgot password or Reset password.</span>
              </div>
            )}
          </div>
          <div className="store-staff-form-row">
            <div className="store-staff-form-group">
              <label htmlFor="asf-username">Username</label>
              <input
                id="asf-username"
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                disabled={!!isEdit}
              />
              {isEdit && <span className="store-staff-form-hint">Username cannot be changed.</span>}
            </div>
            <div className="store-staff-form-group">
              <label htmlFor="asf-role">Role</label>
              <select
                id="asf-role"
                value={form.adminRoleId}
                onChange={(e) => setForm((f) => ({ ...f, adminRoleId: e.target.value }))}
              >
                <option value="">— Full admin —</option>
                {adminRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <div className="staff-footer-access-note">
                <strong>{footerAccess.title}</strong>
                <p>{footerAccess.text}</p>
                <strong style={{ display: 'block', marginTop: '0.75rem' }}>{blogAccess.title}</strong>
                <p>{blogAccess.text}</p>
                {selectedRole ? (
                  <p style={{ marginTop: '0.45rem' }}>
                    To change All stores / One store for footer or blog:{' '}
                    <Link to={`/admin-roles/${selectedRole.id}/edit`}>Edit this role</Link>
                  </p>
                ) : (
                  <p style={{ marginTop: '0.45rem' }}>
                    To give limited footer or blog access, create/edit a role under{' '}
                    <Link to={teamAccessPath({ scope: 'platform', tab: 'roles' })}>Role and staff management</Link>, then pick it here.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="store-staff-form-row">
            <div className="store-staff-form-group">
              <label htmlFor="asf-firstName">First name</label>
              <input
                id="asf-firstName"
                type="text"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="store-staff-form-group">
              <label htmlFor="asf-lastName">Last name</label>
              <input
                id="asf-lastName"
                type="text"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
          {isEdit && (
            <div className="store-staff-form-group">
              <label className="store-staff-form-check">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span>Active</span>
              </label>
            </div>
          )}
        </div>

        <div className="store-staff-form-section">
          <div className="store-staff-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Admin Staff' : 'Create Admin Staff')}
            </button>
            <Link to={teamAccessPath({ scope: 'platform', tab: 'staff' })} className="admin-btn admin-btn-secondary">Cancel</Link>
          </div>
        </div>
      </form>
    </div>
  )
}
