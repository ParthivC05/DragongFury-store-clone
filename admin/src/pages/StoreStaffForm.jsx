import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom'
import { getStoreStaff, getStoreRoles, createStoreStaff, updateStoreStaff } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import { teamAccessPath } from '../utils/teamAccessPaths'
import './StoreStaffForm.css'

export default function StoreStaffForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const isMaster = user?.role === ROLES.MASTER_ADMIN
  const isEdit = Boolean(id)
  const distributorCode = searchParams.get('distributorCode') || ''
  const storeCode = searchParams.get('storeCode') || ''
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [storeRoles, setStoreRoles] = useState([])
  const [staffScope, setStaffScope] = useState({ distributorCode: '', storeCode: '' })
  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    firstName: '',
    lastName: '',
    storeRoleId: '',
    isActive: true
  })

  const effectiveScope = useMemo(() => ({
    distributorCode: distributorCode || staffScope.distributorCode,
    storeCode: storeCode || staffScope.storeCode
  }), [distributorCode, storeCode, staffScope])

  const backPath = useMemo(() => {
    if (isMaster && effectiveScope.distributorCode && effectiveScope.storeCode) {
      return teamAccessPath({
        scope: 'store',
        tab: 'staff',
        distributorCode: effectiveScope.distributorCode,
        storeCode: effectiveScope.storeCode
      })
    }
    return teamAccessPath({ scope: isMaster ? 'store' : undefined, tab: 'staff' })
  }, [isMaster, effectiveScope])

  useEffect(() => {
    const load = async () => {
      try {
        const staffParams = isMaster
          ? (distributorCode && storeCode ? { distributorCode, storeCode } : {})
          : {}
        const staffRes = await getStoreStaff(staffParams)
        let staff = null
        if (isEdit) {
          staff = (staffRes.list || []).find((s) => String(s.userId) === String(id))
          if (!staff) {
            toast.error('Staff not found')
            navigate(backPath)
            return
          }
          setStaffScope({
            distributorCode: staff.distributorCode || distributorCode || '',
            storeCode: staff.storeCode || storeCode || ''
          })
          setForm({
            email: staff.email || '',
            password: '',
            username: staff.username || '',
            firstName: staff.firstName || '',
            lastName: staff.lastName || '',
            storeRoleId: staff.storeRoleId ?? '',
            isActive: staff.isActive !== false
          })
        }

        const rolesDc = staff?.distributorCode || distributorCode
        const rolesSc = staff?.storeCode || storeCode
        if (isMaster && (!rolesDc || !rolesSc)) {
          toast.error('Select a store before managing staff.')
          navigate(teamAccessPath({ scope: 'store', tab: 'staff' }))
          return
        }
        const rolesRes = await getStoreRoles(isMaster ? { distributorCode: rolesDc, storeCode: rolesSc } : {})
        setStoreRoles(rolesRes.list || [])
      } catch (err) {
        toast.error(err.message || 'Failed to load')
        if (isEdit) navigate(backPath)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, isEdit, isMaster, distributorCode, storeCode])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.email.trim()) { toast.error('Email is required'); return }
    if (!isEdit && !form.password) { toast.error('Password is required for new staff'); return }
    if (isMaster && !isEdit && (!effectiveScope.distributorCode || !effectiveScope.storeCode)) {
      toast.error('Select a store before creating staff.')
      return
    }
    setSaving(true)
    if (isEdit) {
      const payload = {
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        storeRoleId: form.storeRoleId ? Number(form.storeRoleId) : null,
        isActive: form.isActive
      }
      updateStoreStaff(id, payload)
        .then(() => { toast.success('Staff updated.'); navigate(backPath) })
        .catch((err) => toast.error(err.message || 'Update failed'))
        .finally(() => setSaving(false))
    } else {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim() || undefined,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        storeRoleId: form.storeRoleId ? Number(form.storeRoleId) : undefined,
        isActive: form.isActive
      }
      if (isMaster) {
        payload.distributorCode = effectiveScope.distributorCode
        payload.storeCode = effectiveScope.storeCode
      }
      createStoreStaff(payload)
        .then(() => { toast.success('Staff created.'); navigate(backPath) })
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
        <h2>{isEdit ? 'Update Store Staff' : 'Create Store Staff'}</h2>
        <Link to={backPath} className="admin-btn admin-btn-secondary">Back</Link>
      </div>

      <form onSubmit={handleSubmit} className="store-staff-form-container">
        <div className="store-staff-form-section">
          <p className="store-staff-form-section-title">Staff details</p>
          {isMaster && effectiveScope.distributorCode && effectiveScope.storeCode && (
            <p className="store-staff-form-hint" style={{ marginBottom: '1rem' }}>
              Store: <strong>{effectiveScope.distributorCode}</strong> / <strong>{effectiveScope.storeCode}</strong>
            </p>
          )}
          <div className="store-staff-form-row">
            <div className="store-staff-form-group">
              <label htmlFor="ssf-email">Email</label>
              <input
                id="ssf-email"
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
                <label htmlFor="ssf-password">Password</label>
                <input
                  id="ssf-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
            ) : (
              <div className="admin-form-group">
                <span className="admin-form-hint">Password cannot be changed here. For password change use Forgot password or Reset password.</span>
              </div>
            )}
          </div>
          <div className="store-staff-form-row">
            <div className="store-staff-form-group">
              <label htmlFor="ssf-username">Username</label>
              <input
                id="ssf-username"
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                disabled={!!isEdit}
              />
              {isEdit && <span className="store-staff-form-hint">Username cannot be changed.</span>}
            </div>
            <div className="store-staff-form-group">
              <label htmlFor="ssf-role">Role</label>
              <select
                id="ssf-role"
                value={form.storeRoleId}
                onChange={(e) => setForm((f) => ({ ...f, storeRoleId: e.target.value }))}
              >
                <option value="">— Full store admin —</option>
                {storeRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="store-staff-form-row">
            <div className="store-staff-form-group">
              <label htmlFor="ssf-firstName">First name</label>
              <input
                id="ssf-firstName"
                type="text"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="store-staff-form-group">
              <label htmlFor="ssf-lastName">Last name</label>
              <input
                id="ssf-lastName"
                type="text"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
          </div>
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
        </div>

        <div className="store-staff-form-section">
          <div className="store-staff-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Store Staff' : 'Create Store Staff')}
            </button>
            <Link to={backPath} className="admin-btn admin-btn-secondary">Cancel</Link>
          </div>
        </div>
      </form>
    </div>
  )
}
