import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { resetPassword } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getNewPasswordRuleChecks, isNewPasswordValid } from '../utils/profileHelpers'
import './Login.css'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const token = searchParams.get('token') || ''
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({ newPassword: '', confirm: '' })

  function handleFieldChange() {
    setFormErrors({ newPassword: '', confirm: '' })
  }

  function getValidationErrors() {
    const errs = { newPassword: '', confirm: '' }
    if (!newPassword.trim()) errs.newPassword = 'New password is required.'
    else if (!isNewPasswordValid(newPassword)) errs.newPassword = 'New password does not meet all requirements below.'
    if (newPassword.trim() && confirmPassword.trim() && newPassword !== confirmPassword) {
      errs.confirm = 'New password and confirmation do not match.'
    }
    const valid = !errs.newPassword && !errs.confirm && isNewPasswordValid(newPassword) && newPassword === confirmPassword
    return { valid, formErrors: errs }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!token) {
      toast.error('Invalid reset link. Use the link from your email.')
      return
    }
    const { valid, formErrors: errs } = getValidationErrors()
    setFormErrors(errs)
    if (!valid) return

    setSubmitting(true)
    try {
      const data = await resetPassword(token, newPassword)
      toast.success(data.message || 'Password reset. You can now sign in.')
      navigate('/login', { replace: true })
    } catch (err) {
      toast.error(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (user) window.location.replace('/')
  }, [user])

  if (user) return <div className="login-page"><div className="login-box">Redirecting…</div></div>

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-box">
          <h1>Invalid link</h1>
          <p className="login-subtitle">This reset link is missing or invalid. Request a new one from the forgot password page.</p>
          <Link to="/forgot-password" className="login-btn" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
            Forgot password
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <h1>Set new password</h1>
        <p className="login-subtitle">Enter your new password. It must meet all the requirements below.</p>
        <form onSubmit={handleSubmit} className="reset-password-form" noValidate>
          <div className="reset-password-field">
            <label htmlFor="reset-new-password">New password</label>
            <input
              id="reset-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); handleFieldChange() }}
              autoComplete="new-password"
              placeholder="Enter new password"
              disabled={submitting}
              aria-invalid={!!formErrors.newPassword}
            />
            <ul className="reset-password-rules" aria-live="polite">
              {getNewPasswordRuleChecks(newPassword).map((rule) => (
                <li key={rule.label} className={rule.met ? 'reset-password-rule met' : 'reset-password-rule'}>
                  <span className="reset-password-rule-icon" aria-hidden>{rule.met ? '✓' : '○'}</span>
                  {rule.label}
                </li>
              ))}
            </ul>
            {formErrors.newPassword && (
              <p className="reset-password-field-error" role="alert">{formErrors.newPassword}</p>
            )}
          </div>
          <div className="reset-password-field">
            <label htmlFor="reset-confirm-password">Confirm password</label>
            <input
              id="reset-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); handleFieldChange() }}
              autoComplete="new-password"
              placeholder="Confirm new password"
              disabled={submitting}
              aria-invalid={!!formErrors.confirm}
            />
            {formErrors.confirm && (
              <p className="reset-password-field-error" role="alert">{formErrors.confirm}</p>
            )}
          </div>
          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
        <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
