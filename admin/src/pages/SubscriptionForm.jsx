import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getSubscription, createSubscription, updateSubscription, getStoresFilterOptions } from '../api/admin'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../constants/roles'
import './DistributorForm.css'
import './SubscriptionForm.css'

const BILLING_TYPES = [
  { value: 'flat', label: 'Flat ($)' },
  { value: 'percentage', label: 'Percentage (%)' }
]
const PERCENTAGE_BASES = [
  { value: 'game_bot_deposit', label: 'Game BOT Deposit %' },
  { value: 'game_bot_net_profit', label: 'Game BOT Net Profit %' }
]

const initialForm = {
  name: '',
  description: '',
  priceDisplay: '',
  durationMonths: 1,
  isActive: true,
  distributorCode: '',
  billingType: 'flat',
  flatAmountCents: '',
  flatPriceDollars: '',
  percentageValue: '',
  percentageBase: 'game_bot_deposit'
}

export default function SubscriptionForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const isEdit = Boolean(id)
  const isMasterAdmin = user?.role === ROLES.MASTER_ADMIN
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [distributorCodes, setDistributorCodes] = useState([])
  const [form, setForm] = useState(initialForm)

  useEffect(() => {
    if (isMasterAdmin) {
      getStoresFilterOptions()
        .then((opts) => setDistributorCodes(opts.distributorCodes || []))
        .catch(() => setDistributorCodes([]))
    }
  }, [isMasterAdmin])

  useEffect(() => {
    if (!isEdit) {
      if (!isMasterAdmin && user?.distributorCode) {
        setForm((f) => ({ ...f, distributorCode: user.distributorCode }))
      }
      setLoading(false)
      return
    }
    getSubscription(id)
      .then((s) => {
        const flatCents = s.flatAmountCents != null ? s.flatAmountCents : ''
        const flatDollars = typeof flatCents === 'number' ? (flatCents / 100).toFixed(2) : ''
        setForm({
          name: s.name ?? '',
          description: s.description ?? '',
          priceDisplay: s.priceDisplay ?? '',
          durationMonths: s.durationMonths ?? 1,
          isActive: s.isActive !== false,
          distributorCode: s.distributorCode ?? '',
          billingType: s.billingType ?? 'flat',
          flatAmountCents: flatCents,
          flatPriceDollars: flatDollars,
          percentageValue: s.percentageValue != null ? s.percentageValue : '',
          percentageBase: s.percentageBase ?? 'game_bot_deposit'
        })
      })
      .catch((err) => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id, isEdit, isMasterAdmin, user?.distributorCode])

  function handleChange(e) {
    const { name, value } = e.target
    if (name === 'isActive') {
      setForm((f) => ({ ...f, isActive: e.target.checked }))
      return
    }
    if (name === 'durationMonths') {
      setForm((f) => ({ ...f, durationMonths: value === '' ? '' : Math.max(1, parseInt(value, 10) || 1) }))
      return
    }
    if (name === 'billingType') {
      setForm((f) => ({
        ...f,
        billingType: value,
        flatAmountCents: value === 'flat' ? f.flatAmountCents : '',
        flatPriceDollars: value === 'flat' ? f.flatPriceDollars : '',
        percentageValue: value === 'percentage' ? f.percentageValue : '',
        percentageBase: value === 'percentage' ? (f.percentageBase || 'game_bot_deposit') : 'game_bot_deposit'
      }))
      return
    }
    if (name === 'flatAmountCents') {
      const v = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0)
      setForm((f) => ({ ...f, flatAmountCents: v }))
      return
    }
    if (name === 'flatPriceDollars') {
      const v = value === '' ? '' : value
      setForm((f) => ({ ...f, flatPriceDollars: v }))
      return
    }
    if (name === 'percentageValue') {
      const v = value === '' ? '' : Math.min(100, Math.max(0, parseFloat(value) || 0))
      setForm((f) => ({ ...f, percentageValue: v }))
      return
    }
    if (name === 'percentageBase') {
      setForm((f) => ({ ...f, percentageBase: value }))
      return
    }
    setForm((f) => ({ ...f, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const nameTrim = form.name.trim()
    if (!nameTrim) {
      toast.error('Name is required.')
      return
    }
    const duration = Math.max(1, parseInt(form.durationMonths, 10) || 1)
    if (form.billingType === 'flat') {
      const dollars = form.flatPriceDollars !== '' ? parseFloat(form.flatPriceDollars) : (form.flatAmountCents !== '' ? Number(form.flatAmountCents) / 100 : null)
      if (dollars == null || isNaN(dollars) || dollars < 0) {
        toast.error('Please enter a valid price ($).')
        return
      }
    }
    if (form.billingType === 'percentage') {
      const pct = parseFloat(form.percentageValue)
      if (isNaN(pct) || pct < 0 || pct > 100) {
        toast.error('Percentage must be between 0 and 100.')
        return
      }
      if (!form.percentageBase) {
        toast.error('Please select percentage base (Game BOT Deposit or Net Profit).')
        return
      }
    }
    setSaving(true)
    const isFlat = form.billingType === 'flat'
    const flatCents = isFlat && (form.flatPriceDollars !== '' || form.flatAmountCents !== '')
      ? (form.flatPriceDollars !== '' ? Math.round(parseFloat(form.flatPriceDollars) * 100) : Math.max(0, parseInt(form.flatAmountCents, 10) || 0))
      : null
    const payload = {
      name: nameTrim,
      description: form.description.trim() || undefined,
      priceDisplay: isFlat && flatCents != null ? `$${(flatCents / 100).toFixed(2)}` : (form.billingType === 'percentage' ? `${form.percentageValue}% of Game BOT ${form.percentageBase === 'game_bot_net_profit' ? 'Net Profit' : 'Deposit'}` : form.priceDisplay?.trim() || undefined),
      durationMonths: duration,
      isActive: form.isActive,
      billingType: form.billingType,
      flatAmountCents: isFlat ? (flatCents ?? undefined) : undefined,
      percentageValue: !isFlat ? (parseFloat(form.percentageValue) ?? 0) : undefined,
      percentageBase: !isFlat ? (form.percentageBase || 'game_bot_deposit') : undefined
    }
    if (!isFlat) {
      payload.flatAmountCents = null
    } else {
      payload.percentageValue = null
      payload.percentageBase = null
    }
    if (isEdit) {
      updateSubscription(id, payload)
        .then(() => {
          toast.success('Subscription updated.')
          navigate('/subscriptions')
        })
        .catch((err) => { toast.error(err.message || 'Save failed'); setSaving(false) })
    } else {
      if (isMasterAdmin && form.distributorCode) payload.distributorCode = form.distributorCode.trim()
      createSubscription(payload)
        .then(() => {
          toast.success('Subscription created.')
          navigate('/subscriptions')
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
    <div className="admin-form-page distributor-form-page subscription-form-page">
      <div className="admin-form-container">
        <header className="page-header">
          <div>
            <h2>{isEdit ? 'Update Subscription' : 'Create Subscription'}</h2>
            <p className="admin-form-intro">
              {isEdit
                ? 'Update the plan details below. Stores with an active subscription keep their current period until it ends.'
                : 'Create a subscription plan that store admins can request. All subscriptions are handled manually (no online payment).'}
            </p>
          </div>
          <Link to="/subscriptions" className="admin-btn admin-btn-secondary">Back to list</Link>
        </header>
        <form onSubmit={handleSubmit} className="admin-form">
          {!isEdit && isMasterAdmin && (
            <div className="admin-form-section">
              <h3 className="admin-form-section-title">Distributor</h3>
              <div className="admin-form-distributor-block">
                <div className="admin-form-group">
                  <label htmlFor="distributorCode">Distributor code</label>
                  <select
                    id="distributorCode"
                    value={form.distributorCode}
                    onChange={handleChange}
                    name="distributorCode"
                    required
                    className="admin-form-distributor-select"
                  >
                    <option value="">Select distributor</option>
                    {distributorCodes.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
          <div className="admin-form-section">
            <h3 className="admin-form-section-title">Plan details</h3>
            <div className="admin-form-group">
              <label htmlFor="name">Plan name</label>
              <input
                id="name"
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="e.g. Basic, Premium, Enterprise"
              />
            </div>
            <div className="admin-form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                placeholder="Optional – short description shown to store admins"
              />
            </div>
            <div className="admin-form-group">
              <label>Billing type</label>
              <div className="admin-form-radio-group">
                {BILLING_TYPES.map(({ value, label }) => (
                  <label key={value} className="admin-form-radio-label">
                    <input
                      type="radio"
                      name="billingType"
                      value={value}
                      checked={form.billingType === value}
                      onChange={handleChange}
                    />
                    {' '}{label}
                  </label>
                ))}
              </div>
            </div>
            {form.billingType === 'flat' && (
              <div className="admin-form-group">
                <label htmlFor="flatPriceDollars">Price ($)</label>
                <input
                  id="flatPriceDollars"
                  type="number"
                  name="flatPriceDollars"
                  min={0}
                  step={0.01}
                  value={form.flatPriceDollars}
                  onChange={handleChange}
                  placeholder="e.g. 99"
                />
                <span className="admin-form-hint">Fixed amount in dollars. Store admins see this as the plan price.</span>
              </div>
            )}
            {form.billingType === 'percentage' && (
              <>
                <div className="admin-form-group">
                  <label htmlFor="percentageValue">Percentage (0–100)%</label>
                  <input
                    id="percentageValue"
                    type="number"
                    name="percentageValue"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.percentageValue}
                    onChange={handleChange}
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="admin-form-group">
                  <label htmlFor="percentageBase">Percentage of</label>
                  <select
                    id="percentageBase"
                    name="percentageBase"
                    value={form.percentageBase}
                    onChange={handleChange}
                  >
                    {PERCENTAGE_BASES.map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <span className="admin-form-hint">Calculated from store’s Game BOT deposit or net profit. Shown only to distributor admin when approving.</span>
                </div>
              </>
            )}
            <div className="admin-form-group">
              <label htmlFor="durationMonths">Duration (months)</label>
              <input
                id="durationMonths"
                type="number"
                name="durationMonths"
                min={1}
                value={form.durationMonths}
                onChange={handleChange}
              />
              <span className="admin-form-hint">How long the plan is valid after approval.</span>
            </div>
            <div className="admin-form-group admin-form-group-checkbox">
              <label>
                <input
                  type="checkbox"
                  name="isActive"
                  checked={form.isActive}
                  onChange={handleChange}
                />
                {' '}Active – available for stores to request
              </label>
            </div>
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? (isEdit ? 'Updating…' : 'Creating…') : (isEdit ? 'Update Subscription' : 'Create Subscription')}
            </button>
            <Link to="/subscriptions" className="admin-btn admin-btn-secondary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
