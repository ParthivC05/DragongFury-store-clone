const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const config = require('../../configs/app.config');

function defaultFrontendBase() {
  return String(config.get('email.frontendUrl') || '').replace(/\/$/, '') || 'http://localhost:5173';
}

/**
 * Validate URL for store user site. Dev: http localhost OK. Production: https only, no localhost.
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
function validateAndNormalizeUserSiteUrl(input) {
  const isProd = process.env.NODE_ENV === 'production';
  if (input == null || (typeof input === 'string' && !String(input).trim())) {
    return { ok: true, value: null };
  }
  const s = String(input).trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'Enter a valid URL (e.g. https://goodgdragon.com)' };
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    return { ok: false, error: 'URL must start with http:// or https://' };
  }
  const host = (u.hostname || '').toLowerCase();
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost');
  if (isProd) {
    if (u.protocol !== 'https:') {
      return { ok: false, error: 'Production requires an https:// URL.' };
    }
    if (isLocal) {
      return { ok: false, error: 'Production cannot use localhost. Use your public store URL.' };
    }
  }
  // Non-production: allow http://localhost, https://, or any http/https for staging.
  const base = `${u.protocol}//${u.host}`;
  return { ok: true, value: base };
}

/**
 * Base URL for user-facing links for users of this store (emails, referrals).
 */
async function getResolvedUserSiteBaseUrl(storeCode) {
  const fallback = defaultFrontendBase();
  if (!storeCode || typeof storeCode !== 'string') return fallback;
  const norm = storeCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return fallback;
  const admin = await db.User.findOne({
    where: {
      role: ROLES.STORE_ADMIN,
      storeCode: norm,
      storeRoleId: null,
      isActive: true,
      deletedAt: null
    },
    attributes: ['userSiteUrl']
  });
  const raw = admin && admin.userSiteUrl ? String(admin.userSiteUrl).trim() : '';
  if (!raw) return fallback;
  const check = validateAndNormalizeUserSiteUrl(raw);
  if (!check.ok || !check.value) return fallback;
  return check.value.replace(/\/$/, '');
}

module.exports = {
  validateAndNormalizeUserSiteUrl,
  getResolvedUserSiteBaseUrl,
  defaultFrontendBase
};
