import { useEffect, useState } from 'react';
import { hideHtmlLcpSlideshow } from '../api/geo';
import { site } from '../config/site';
import './GeoBlocker.css';

function isTinyFavicon(url) {
  return /\.ico(\?|$)/i.test(String(url || ''));
}

function resolveBrand() {
  const landing = site.landingLogoUrl && String(site.landingLogoUrl).trim();
  if (landing && !isTinyFavicon(landing)) return { type: 'image', src: landing };

  const logo = site.logoUrl && String(site.logoUrl).trim();
  if (logo && !isTinyFavicon(logo)) return { type: 'image', src: logo };

  return {
    type: 'text',
    name: site.platformName || 'Welcome'
  };
}

function geoThemeVars() {
  const theme = site.geoTheme || {};
  const vars = {};
  if (theme.accent) vars['--geo-accent'] = theme.accent;
  if (theme.glow) vars['--geo-glow'] = theme.glow;
  if (theme.bgFrom) vars['--geo-bg-from'] = theme.bgFrom;
  if (theme.bgMid) vars['--geo-bg-mid'] = theme.bgMid;
  if (theme.bgTo) vars['--geo-bg-to'] = theme.bgTo;
  if (theme.text) vars['--geo-text'] = theme.text;
  if (theme.muted) vars['--geo-muted'] = theme.muted;
  if (theme.email) vars['--geo-email'] = theme.email;
  return vars;
}

function LocationMark() {
  return (
    <svg className="geo-blocker__mark" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="54" fill="currentColor" opacity="0.14" />
      <path
        fill="currentColor"
        d="M60 22c-15.5 0-28 12.3-28 27.5 0 20.6 28 50.5 28 50.5s28-29.9 28-50.5C88 34.3 75.5 22 60 22zm0 37.4a10.2 10.2 0 1 1 0-20.4 10.2 10.2 0 0 1 0 20.4z"
      />
    </svg>
  );
}

export function GeoBlocker({ errorCode }) {
  const brand = resolveBrand();
  const name = site.platformName || 'this platform';
  const support = site.supportEmail || null;
  const [showArt, setShowArt] = useState(true);

  useEffect(() => {
    hideHtmlLcpSlideshow();
  }, []);

  return (
    <div className="geo-blocker" role="alert" aria-live="polite" style={geoThemeVars()}>
      <header className="geo-blocker__header">
        {brand.type === 'image' ? (
          <img className="geo-blocker__logo" src={brand.src} alt={name} width={160} height={40} />
        ) : (
          <span className="geo-blocker__brand-name">{brand.name}</span>
        )}
      </header>

      <main className="geo-blocker__main">
        <div className="geo-blocker__avatar-wrap">
          {showArt ? (
            <img
              className="geo-blocker__avatar"
              src="/geo-blocker.webp"
              alt=""
              width={320}
              height={320}
              decoding="async"
              loading="eager"
              fetchPriority="high"
              onError={() => setShowArt(false)}
            />
          ) : (
            <LocationMark />
          )}
        </div>
        <h1 className="geo-blocker__title">Thank you for your interest!</h1>
        <p className="geo-blocker__copy">
          {name} is currently available only within the United States.
        </p>
        <p className="geo-blocker__copy">
          If you believe you should have access, please contact us
          {support ? ':' : '.'}
        </p>
        {support ? (
          <a className="geo-blocker__email" href={`mailto:${support}`}>
            {support}
          </a>
        ) : null}
        {errorCode ? (
          <p className="geo-blocker__ref">Reference code: {errorCode}</p>
        ) : null}
        <p className="geo-blocker__signoff">Kind regards, the {name} team</p>
      </main>
    </div>
  );
}
