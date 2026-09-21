/**
 * Dragon Fury white-label branding.
 * STORE_CODE must match a store_admin's `storeCode` in the backend database.
 * One store = one email + one Google SSO + one Facebook SSO per user.
 */
/** Store code for this deployment (VITE_STORE_CODE env or default). Must exist as store_admin in DB. */
export const STORE_CODE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_STORE_CODE
  ? String(import.meta.env.VITE_STORE_CODE).trim()
  : 'dragonfury';

export const site = {
  /** Display name of the platform */
  platformName: typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_TITLE
    ? String(import.meta.env.VITE_SITE_TITLE).trim()
    : 'Dragon Fury',
  /** Default document title / SEO title (homepage) */
  seoTitle:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SEO_TITLE
      ? String(import.meta.env.VITE_SEO_TITLE).trim()
      : 'DragonFury - Access 20+ Sweepstakes Game Systems Online',
  /** Default meta description for SEO */
  seoDescription:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SEO_DESCRIPTION
      ? String(import.meta.env.VITE_SEO_DESCRIPTION).trim()
      : 'Dragon Fury, Orion Stars, Golden Dragon, Fire Kirin & more — all in one place. Explore our full games list and start playing today.',
  /** Header / auth / footer / landing logo image */
  logoUrl:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOGO_URL
      ? String(import.meta.env.VITE_LOGO_URL).trim()
      : '/optimized/logo.webp',
  /** Alias for screens that still read landingLogoUrl — same as post-login logo */
  get landingLogoUrl() {
    return this.logoUrl;
  },
  /** Loader splash logo (transparent / dark-friendly asset) */
  loaderLogoUrl:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOADER_LOGO_URL
      ? String(import.meta.env.VITE_LOADER_LOGO_URL).trim()
      : '/logo-bg.png',
  /** Browser tab icon (favicon) */
  faviconUrl: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FAVICON_URL
    ? String(import.meta.env.VITE_FAVICON_URL).trim()
    : '/optimized/logo.webp',
  /** Current year for copyright */
  year: new Date().getFullYear(),
  /** Copyright text */
  get copyright() {
    return `Copyright © ${this.year}, ${this.platformName}`;
  },
  /** Support / contact email */
  supportEmail: 'support@dragonfury.com',
  /** Support / contact phone */
  supportPhone: '+1 (987) 654-3210',
  /** Geo-blocker palette (navy + gold) */
  geoTheme: {
    accent: '#d4af37',
    glow: 'rgba(212, 175, 55, 0.16)',
    bgFrom: '#0a0c12',
    bgMid: '#12161f',
    bgTo: '#0d1018',
    text: '#f5f0e6',
    email: '#7eb6ff',
  },
  /** Social profile URLs (optional — icons hidden when empty) */
  socialLinks: {
    facebook:
      typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCIAL_FACEBOOK_URL
        ? String(import.meta.env.VITE_SOCIAL_FACEBOOK_URL).trim()
        : '',
    telegram:
      typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCIAL_TELEGRAM_URL
        ? String(import.meta.env.VITE_SOCIAL_TELEGRAM_URL).trim()
        : '',
    messenger:
      typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCIAL_MESSENGER_URL
        ? String(import.meta.env.VITE_SOCIAL_MESSENGER_URL).trim()
        : '',
  },
};

export default site;
