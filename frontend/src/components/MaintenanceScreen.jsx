import { site } from '../config/site';
import './MaintenanceScreen.css';

export function MaintenanceScreen() {
  const title = site.platformName || 'our site';

  return (
    <div className="maint-screen" role="alert" aria-live="polite">
      <div className="maint-screen__glow" aria-hidden="true" />
      <div className="maint-screen__card">
        <div className="maint-screen__logo">
          <img src="/logo-bg.png" alt={title} decoding="async" />
        </div>

        <h1 className="maint-screen__title">Be right back</h1>
        <p className="maint-screen__copy">
          Something unexpected happened and we are working to get {title} back for you.
        </p>
        <p className="maint-screen__copy maint-screen__copy--second">
          Your account and balance are safe. Please check back soon, and thank you for your patience.
        </p>

        {site.supportEmail ? (
          <p className="maint-screen__support">
            Need help?{' '}
            <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
