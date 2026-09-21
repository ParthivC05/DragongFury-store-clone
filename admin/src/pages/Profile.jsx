import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { changePassword, getMe } from '../api/auth'
import { patchUserSiteUrl, patchDrawer } from '../api/admin'
import { getRoleDisplayLabel, showDistributorCode, showStoreCode, getNewPasswordRuleChecks, isNewPasswordValid } from '../utils/profileHelpers'
import { ROLES } from '../constants/roles'
import './Profile.css'

const initialPasswordState = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
}

export default function Profile() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [passwordForm, setPasswordForm] = useState(initialPasswordState)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({ currentPassword: '', newPassword: '', confirm: '', sameAsCurrent: '' })
  const [siteUrlInput, setSiteUrlInput] = useState('')
  const [siteUrlSaving, setSiteUrlSaving] = useState(false)
  const [drawerInput, setDrawerInput] = useState('')
  const [drawerSaving, setDrawerSaving] = useState(false)

  useEffect(() => {
    const v = (user?.customerSiteUrl ?? user?.userSiteUrl ?? '').trim() || ''
    setSiteUrlInput((prev) => (prev !== v ? v : prev))
  }, [user?.customerSiteUrl, user?.userSiteUrl])

  const resetPasswordForm = useCallback(() => {
    setPasswordForm(initialPasswordState)
    setFormErrors({ currentPassword: '', newPassword: '', confirm: '', sameAsCurrent: '' })
  }, [])

  function handlePasswordFieldChange(field, value) {
    setPasswordForm((prev) => ({ ...prev, [field]: value }))
    setFormErrors((prev) => ({ ...prev, currentPassword: '', newPassword: '', confirm: '', sameAsCurrent: '' }))
  }

  /** Returns { valid, formErrors }. Inline errors only; no toast. */
  function getValidationErrors() {
    const { currentPassword, newPassword, confirmPassword } = passwordForm
    const errs = { currentPassword: '', newPassword: '', confirm: '', sameAsCurrent: '' }
    if (!currentPassword.trim()) errs.currentPassword = 'Current password is required.'
    if (!newPassword.trim()) errs.newPassword = 'New password is required.'
    else if (!isNewPasswordValid(newPassword)) errs.newPassword = 'New password does not meet all requirements above.'
    if (newPassword.trim() && confirmPassword.trim() && newPassword !== confirmPassword) {
      errs.confirm = 'New password and confirmation do not match.'
    }
    if (currentPassword.trim() && newPassword.trim() && currentPassword.trim() === newPassword.trim()) {
      errs.sameAsCurrent = 'New password must be different from current password.'
    }
    const valid = !errs.currentPassword && !errs.newPassword && !errs.confirm && !errs.sameAsCurrent &&
      currentPassword.trim() && isNewPasswordValid(newPassword) && newPassword === confirmPassword
    return { valid, formErrors: errs }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault()
    const { valid, formErrors: errs } = getValidationErrors()
    setFormErrors(errs)
    if (!valid) return

    setPasswordSubmitting(true)
    try {
      const data = await changePassword(
        passwordForm.currentPassword.trim(),
        passwordForm.newPassword.trim()
      )
      toast.success(data.message || 'Password updated successfully.')
      resetPasswordForm()
    } catch (err) {
      toast.error(err.message || 'Failed to update password.')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="profile-page-wrapper">
        <div className="profile-page">
          <p className="profile-loading">Loading profile…</p>
        </div>
      </div>
    )
  }

  const role = user.role
  const showDist = showDistributorCode(role)
  const showStore = showStoreCode(role)
  const isStoreAdmin = role === ROLES.STORE_ADMIN
  const isMasterAdmin = role === ROLES.MASTER_ADMIN
  const isFullStoreAdmin = isStoreAdmin && !user.storeRoleId
  const canEditSiteUrl = isFullStoreAdmin || isMasterAdmin
  const canSeeStoreSection = isStoreAdmin

  async function handleSaveCustomerSiteUrl(e) {
    e.preventDefault()
    setSiteUrlSaving(true)
    try {
      const res = await patchUserSiteUrl(siteUrlInput.trim())
      toast.success(res.message || 'Saved.')
      const fresh = await getMe()
      setUser((u) => (u ? { ...u, ...fresh } : u))
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setSiteUrlSaving(false)
    }
  }

  async function handleSaveDrawer(e) {
    e.preventDefault()
    setDrawerSaving(true)
    try {
      const trimmed = drawerInput.trim()
      const res = await patchDrawer(trimmed === '' ? '' : trimmed)
      toast.success(res.message || 'Saved.')
      const fresh = await getMe()
      setUser((u) => (u ? { ...u, ...fresh } : u))
    } catch (err) {
      toast.error(err.message || 'Save failed.')
    } finally {
      setDrawerSaving(false)
    }
  }

    return (
    <div className="profile-page-wrapper">
      <div className="profile-page">
        <header className="profile-header">
          <h1 className="profile-title">Profile</h1>
          <p className="profile-subtitle">Your account information and security settings.</p>
        </header>

        <section className="profile-section profile-section-info" aria-labelledby="profile-info-heading">
          <h2 id="profile-info-heading" className="profile-section-title">
            Account information
          </h2>
          <div className="profile-card">
            <dl className="profile-dl">
              <div className="profile-row">
                <dt>Email</dt>
                <dd>{user.email || '—'}</dd>
              </div>
              <div className="profile-row">
                <dt>First name</dt>
                <dd>{user.firstName || '—'}</dd>
              </div>
              <div className="profile-row">
                <dt>Last name</dt>
                <dd>{user.lastName || '—'}</dd>
              </div>
              <div className="profile-row">
                <dt>Role</dt>
                <dd className="profile-role">{getRoleDisplayLabel(role)}</dd>
              </div>
              {showDist && (
                <div className="profile-row">
                  <dt>Distributor code</dt>
                  <dd className="profile-value">{user.distributorCode ?? '—'}</dd>
                </div>
              )}
              {showStore && (
                <div className="profile-row">
                  <dt>Store code</dt>
                  <dd className="profile-value">{user.storeCode ?? '—'}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        {canSeeStoreSection && (
          <section className="profile-section profile-section-store" aria-labelledby="profile-store-heading">
            <h2 id="profile-store-heading" className="profile-section-title">
              Store
            </h2>
            <div className="profile-card profile-card-store">
              <p className="profile-store-intro">
                Distributor and store codes identify your store. The <strong>player website URL</strong> tells the system
                which public site to use for verification emails, password resets, and referral links.
              </p>

              <div className="profile-store-identifiers">
                <h3 className="profile-subcard-title">Store codes</h3>
                <div className="profile-store-code-grid">
                  <div className="profile-stat-tile">
                    <span className="profile-stat-label">Distributor</span>
                    <span className="profile-stat-value">{user.distributorCode ?? '—'}</span>
                  </div>
                  <div className="profile-stat-tile">
                    <span className="profile-stat-label">Store</span>
                    <span className="profile-stat-value">{user.storeCode ?? '—'}</span>
                  </div>
                </div>
              </div>

              <div className="profile-site-url-panel">
                <div className="profile-site-url-panel-header">
                  <div>
                    <h3 className="profile-subcard-title profile-site-url-title">Player website URL</h3>
                    <p className="profile-site-url-lead">
                      Your customers&apos; login site (must match where your player app is hosted).
                    </p>
                  </div>
                  {(user.customerSiteUrl || user.userSiteUrl || '').trim() ? (
                    <span className="profile-site-badge profile-site-badge--active">Custom URL</span>
                  ) : (
                    <span className="profile-site-badge profile-site-badge--default">Platform default</span>
                  )}
                </div>

                <div
                  className={`profile-site-url-display${(user.customerSiteUrl || user.userSiteUrl || '').trim() ? ' profile-site-url-display--set' : ''}`}
                  aria-label="Current player website URL"
                >
                  {(user.customerSiteUrl || user.userSiteUrl || '').trim() || (
                    <span className="profile-site-url-display-placeholder">
                      No custom URL — emails and links use the platform default until you set one below.
                    </span>
                  )}
                </div>

                {canEditSiteUrl ? (
                  <form onSubmit={handleSaveCustomerSiteUrl} className="profile-site-url-form">
                    <div className="profile-field profile-field--full">
                      <label htmlFor="profile-customer-site-url">Set or update URL</label>
                      <input
                        id="profile-customer-site-url"
                        className="profile-site-url-input"
                        type="url"
                        placeholder="https://yourstore.com"
                        value={siteUrlInput}
                        onChange={(e) => setSiteUrlInput(e.target.value)}
                        disabled={siteUrlSaving}
                        autoComplete="off"
                      />
                      {import.meta.env.DEV && (
                        <p className="profile-hint profile-hint--dev">
                          Dev: localhost OK. Production: https only. Clear field and save to use default.
                        </p>
                      )}
                    </div>
                    <div className="profile-site-url-actions">
                      <button type="submit" className="admin-btn admin-btn-primary" disabled={siteUrlSaving}>
                        {siteUrlSaving ? 'Saving…' : 'Save URL'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="profile-callout profile-callout--muted" role="note">
                    <span className="profile-callout-icon" aria-hidden>ℹ</span>
                    <p>
                      Only <strong>store admin</strong> (main account) or <strong>master admin</strong> can change this URL. You can view it above.
                    </p>
                  </div>
                )}
              </div>

              {isFullStoreAdmin && (
                <div className="profile-site-url-panel" style={{ marginTop: '1.25rem' }}>
                  <div className="profile-site-url-panel-header">
                    <div>
                      <h3 className="profile-subcard-title profile-site-url-title">Golden Dragon drawer (moneybox)</h3>
                      <p className="profile-site-url-lead">
                        Used when adding a <strong>Golden Dragon</strong> game: sent to the provider as <code>moneybox</code> on add-client.
                        Leave empty if you do not use Golden Dragon.
                      </p>
                    </div>
                  </div>
                  <form onSubmit={handleSaveDrawer} className="profile-site-url-form">
                    <div className="profile-field profile-field--full">
                      <label htmlFor="profile-store-drawer">Drawer number</label>
                      <input
                        id="profile-store-drawer"
                        type="number"
                        min={1}
                        step={1}
                        className="profile-site-url-input"
                        placeholder="e.g. 1"
                        value={drawerInput}
                        onChange={(e) => setDrawerInput(e.target.value)}
                        disabled={drawerSaving}
                        autoComplete="off"
                      />
                      <p className="profile-hint">Clear the field and save to remove. Distributors can also set this when editing your store.</p>
                    </div>
                    <div className="profile-site-url-actions">
                      <button type="submit" className="admin-btn admin-btn-primary" disabled={drawerSaving}>
                        {drawerSaving ? 'Saving…' : 'Save drawer'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </section>
        )}

      <section className="profile-section profile-section-password" aria-labelledby="profile-password-heading">
        <h2 id="profile-password-heading" className="profile-section-title">
          Update password
        </h2>
        <div className="profile-card profile-card-password">
          <p className="profile-password-intro">
            Change your password. You must enter your current password to confirm your identity.
            Use at least 8 characters with uppercase, lowercase, a number and a special character.
          </p>
          <form onSubmit={handleUpdatePassword} className="profile-password-form" noValidate>
            <div className="profile-field">
              <label htmlFor="profile-current-password">Current password</label>
              <input
                id="profile-current-password"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => handlePasswordFieldChange('currentPassword', e.target.value)}
                autoComplete="current-password"
                placeholder="Enter current password"
                disabled={passwordSubmitting}
                aria-invalid={!!formErrors.currentPassword}
                aria-describedby={formErrors.currentPassword ? 'profile-current-password-error' : undefined}
              />
              {formErrors.currentPassword && (
                <p id="profile-current-password-error" className="profile-field-error" role="alert">
                  {formErrors.currentPassword}
                </p>
              )}
            </div>
            <div className="profile-field">
              <label htmlFor="profile-new-password">New password</label>
              <input
                id="profile-new-password"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => handlePasswordFieldChange('newPassword', e.target.value)}
                autoComplete="new-password"
                placeholder="Min 8 chars, upper, lower, number, special"
                minLength={8}
                disabled={passwordSubmitting}
                aria-invalid={passwordForm.newPassword.length > 0 && !isNewPasswordValid(passwordForm.newPassword)}
              />
              <ul className="profile-password-rules" aria-live="polite">
                {getNewPasswordRuleChecks(passwordForm.newPassword).map((rule) => (
                  <li key={rule.label} className={rule.met ? 'profile-password-rule met' : 'profile-password-rule'}>
                    <span className="profile-password-rule-icon" aria-hidden>{rule.met ? '✓' : '○'}</span>
                    {rule.label}
                  </li>
                ))}
              </ul>
              {formErrors.newPassword && (
                <p className="profile-field-error" role="alert">
                  {formErrors.newPassword}
                </p>
              )}
            </div>
            <div className="profile-field">
              <label htmlFor="profile-confirm-password">Confirm new password</label>
              <input
                id="profile-confirm-password"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => handlePasswordFieldChange('confirmPassword', e.target.value)}
                autoComplete="new-password"
                placeholder="Confirm new password"
                minLength={8}
                disabled={passwordSubmitting}
                aria-invalid={!!formErrors.confirm}
                aria-describedby={formErrors.confirm ? 'profile-confirm-password-error' : undefined}
              />
              {formErrors.confirm && (
                <p id="profile-confirm-password-error" className="profile-field-error" role="alert">
                  {formErrors.confirm}
                </p>
              )}
            </div>
            {formErrors.sameAsCurrent && (
              <p className="profile-field-error profile-form-error" role="alert">
                {formErrors.sameAsCurrent}
              </p>
            )}
            <div className="profile-password-actions">
              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                disabled={passwordSubmitting}
              >
                {passwordSubmitting ? 'Updating…' : 'Update password'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={resetPasswordForm}
                disabled={passwordSubmitting}
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      </section>
      </div>
    </div>
  )
}
