import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getDistributor, createDistributor, updateDistributor } from '../api/admin'
import { useToast } from '../context/ToastContext'
import './DistributorForm.css'

const initialCreate = {
  email: '',
  password: '',
  username: '',
  distributorCode: '',
  firstName: '',
  lastName: '',
  isActive: true
}

const initialEdit = {
  email: '',
  username: '',
  distributorCode: '',
  firstName: '',
  lastName: '',
  isActive: true
}

export default function DistributorForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const isEdit = Boolean(id)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(isEdit ? initialEdit : initialCreate)

  useEffect(() => {
    if (!isEdit) return
    getDistributor(id)
      .then((d) => setForm({
        email: d.email || '',
        username: d.username || '',
        distributorCode: d.distributorCode || '',
        firstName: d.firstName || '',
        lastName: d.lastName || '',
        isActive: d.isActive !== false
      }))
      .catch((err) => {
        toast.error(err.message || 'Failed to load')
      })
      .finally(() => setLoading(false))
  }, [id, isEdit])

  function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    if (isEdit) {
      const payload = {
        email: form.email.trim(),
        username: form.username.trim(),
        distributorCode: form.distributorCode.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        isActive: form.isActive
      }
      updateDistributor(id, payload)
        .then(() => {
          toast.success('Distributor updated.')
          navigate('/distributors')
        })
        .catch((err) => { toast.error(err.message || 'Save failed'); setSaving(false) })
    } else {
      const payload = {
        email: form.email.trim(),
        password: form.password,
        username: form.username.trim() || undefined,
        distributorCode: form.distributorCode.trim() || undefined,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        isActive: form.isActive
      }
      createDistributor(payload)
        .then(() => {
          toast.success('Distributor created.')
          navigate('/distributors')
        })
        .catch((err) => { toast.error(err.message || 'Create failed'); setSaving(false) })
    }
  }

  if (loading) {
    return (
      <div className="admin-form-page">
        <div className="admin-form-container">
          <div className="page-loading">Loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-form-page distributor-form-page">
      <div className="admin-form-container">
        <div className="page-header">
          <h2>{isEdit ? 'Update Distributor' : 'Create Distributor'}</h2>
          <Link to="/distributors" className="admin-btn admin-btn-secondary">Back</Link>
        </div>
        <form onSubmit={handleSubmit} className="admin-form">
        <div className="admin-form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            disabled={isEdit}
            placeholder="admin@example.com"
          />
          {isEdit && <span className="admin-form-hint">Email cannot be changed.</span>}
        </div>
        {!isEdit && (
          <div className="admin-form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
              placeholder="Min 8 chars, include upper, lower, number, special"
            />
          </div>
        )}
        <div className="admin-form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            placeholder={isEdit ? '' : 'Optional — defaults to email prefix'}
          />
        </div>
        <div className="admin-form-group">
          <label htmlFor="distributorCode">Distributor code</label>
          <input
            id="distributorCode"
            type="text"
            value={form.distributorCode}
            onChange={(e) => setForm((f) => ({ ...f, distributorCode: e.target.value }))}
            placeholder={isEdit ? '' : 'Optional — use username or choose (e.g. acme)'}
          />
          <span className="admin-form-hint">Unique code for this distributor. Leave blank to derive from username.</span>
        </div>
        <div className="admin-form-group">
          <label htmlFor="firstName">First name</label>
          <input id="firstName" type="text" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" />
        </div>
        <div className="admin-form-group">
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" type="text" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last name" />
        </div>
        <div className="admin-form-group admin-form-group-checkbox">
          <label>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Active
          </label>
        </div>
        <div className="admin-form-actions">
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            {saving ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Distributor' : 'Create Distributor')}
          </button>
          <Link to="/distributors" className="admin-btn admin-btn-secondary">Cancel</Link>
        </div>
      </form>
      </div>
    </div>
  )
}
