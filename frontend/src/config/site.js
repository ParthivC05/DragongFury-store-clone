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
      : 'Dragon Fury | Instant sweepstakes games in black and green',
  /** Default meta description for SEO */
  seoDescription:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SEO_DESCRIPTION
      ? String(import.meta.env.VITE_SEO_DESCRIPTION).trim()
      : 'Dragon Fury is a black-and-green sweepstakes lobby for fish games, slots, and exclusive platforms. Join free and play in minutes.',
  /** Header / auth / footer / landing logo image */
  logoUrl:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOGO_URL
      ? String(import.meta.env.VITE_LOGO_URL).trim()
      : '/logo.png',
  /** Alias for screens that still read landingLogoUrl — same as post-login logo */
  get landingLogoUrl() {
    return this.logoUrl;
  },
  /** Loader splash logo (transparent / dark-friendly asset) */
  loaderLogoUrl:
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_LOADER_LOGO_URL
      ? String(import.meta.env.VITE_LOADER_LOGO_URL).trim()
      : '/logo.png',
  /** Browser tab icon (favicon) */
  faviconUrl: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FAVICON_URL
    ? String(import.meta.env.VITE_FAVICON_URL).trim()
    : '/logo.png',
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
  /** Geo-blocker palette (black + lime) */
  geoTheme: {
    accent: '#B6FF2A',
    glow: 'rgba(182, 255, 42, 0.18)',
    bgFrom: '#0a0c0a',
    bgMid: '#121512',
    bgTo: '#0d120d',
    text: '#f3f7f0',
    email: '#B6FF2A',
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
