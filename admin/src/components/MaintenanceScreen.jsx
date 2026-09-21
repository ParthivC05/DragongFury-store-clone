import './MaintenanceScreen.css'

const TITLE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_TITLE
    ? String(import.meta.env.VITE_SITE_TITLE).trim()
    : '') || 'Partner Platform Admin'

export function MaintenanceScreen() {
  return (
    <div className="maint-screen" role="alert" aria-live="polite">
      <div className="maint-screen__glow" aria-hidden="true" />
      <div className="maint-screen__card">
        <div className="maint-screen__logo">
          <div className="maint-screen__header-brand" aria-label={TITLE}>
            <div className="maint-screen__header-ring">
              <div className="maint-screen__header-inner">🛡️</div>
            </div>
            <span className="maint-screen__header-name">{TITLE}</span>
          </div>
        </div>
        <h1 className="maint-screen__title">Be right back</h1>
        <p className="maint-screen__copy">
          Something unexpected happened and we are working to get {TITLE} back for you.
        </p>
        <p className="maint-screen__copy maint-screen__copy--second">
          Your account is safe. Please check back soon, and thank you for your patience.
        </p>
      </div>
    </div>
  )
}
