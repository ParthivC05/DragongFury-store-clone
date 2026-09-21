import { site } from '../config/site';
import './SiteLogo.css';

/**
 * Branded site logo from public/logo.png (override via VITE_LOGO_URL).
 * Same asset on landing, auth, and post-login chrome.
 */
const LOGO_SIZE = {
  nav: { width: 220, height: 80 },
  auth: { width: 280, height: 96 },
  drawer: { width: 180, height: 68 },
  footer: { width: 240, height: 90 },
  loader: { width: 180, height: 68 },
};

export function SiteLogo({ variant = 'nav', className = '' }) {
  const alt = (site.platformName || 'Site').trim() || 'Logo';
  const size = LOGO_SIZE[variant] || LOGO_SIZE.nav;

  return (
    <img
      src={site.logoUrl}
      alt={alt}
      width={size.width}
      height={size.height}
      className={['site-logo', `site-logo--${variant}`, className].filter(Boolean).join(' ')}
      decoding="async"
      loading={variant === 'nav' ? 'eager' : 'lazy'}
    />
  );
}
