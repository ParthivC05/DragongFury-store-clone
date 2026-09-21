import { site } from '../config/site';
import './SiteLogo.css';

/**
 * Branded site logo from public/logo.png (override via VITE_LOGO_URL).
 * Same asset on landing, auth, and post-login chrome.
 */
const LOGO_SIZE = {
  nav: { width: 180, height: 44 },
  auth: { width: 240, height: 72 },
  drawer: { width: 160, height: 36 },
  footer: { width: 240, height: 80 },
  loader: { width: 160, height: 48 },
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
