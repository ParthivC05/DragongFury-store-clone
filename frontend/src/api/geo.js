import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';

/** Definitive geo / security block codes from geoBlock middleware. */
export const GEO_BLOCK_CODES = new Set([
  3200, // GEO_BLOCKED
  3051, // GEO_BLOCKED_LOCATION
  3052, // VPN_OR_PROXY_DETECTED
  3053, // TOR_DETECTED
  3054, // VPN_DETECTED
  3055, // NON_US_COUNTRY_BLOCKED
  3056, // ANONYMIZED_CONNECTION_DETECTED
  3057, // CLOUD_PROVIDER_DETECTED
  3058 // KNOWN_ATTACKER_DETECTED
]);

export function getGeoBlockCode(error) {
  const raw = error?.code ?? error?.body?.code ?? null;
  return raw == null ? null : Number(raw);
}

/**
 * True only when the backend explicitly denied access for a geo/security reason.
 * Network errors and non-geo failures fail open.
 */
export function isGeoBlockError(error) {
  const status = error?.status;
  if (status !== 403 && status !== 406) return false;
  return GEO_BLOCK_CODES.has(getGeoBlockCode(error));
}

/**
 * The homepage LCP slideshow lives in index.html (#pj-lcp-boot), outside React.
 * Hide it as soon as geo-block replaces the app so the banner cannot sit on
 * top of GeoBlocker.
 */
export function hideHtmlLcpSlideshow() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.add('pj-lcp-takenover');
  document.documentElement.classList.remove('pj-lcp-has-src');
  const boot = document.getElementById('pj-lcp-boot');
  if (boot) {
    boot.hidden = true;
    boot.style.setProperty('display', 'none', 'important');
  }
}

/** Share one network call across StrictMode remounts / rapid remounts. */
const GEO_CHECK_OK_TTL_MS = 60_000;
let geoCheckInFlight = null;
let geoCheckOkCache = null;

/**
 * Call GET /api/geo/check with a plain fetch (no auth headers) so browsers skip
 * CORS preflight and failed checks never trigger session logout.
 * storeCode scopes the IP allowlist to this white-label deployment.
 */
export async function checkGeoAccess() {
  if (geoCheckOkCache && Date.now() - geoCheckOkCache.at < GEO_CHECK_OK_TTL_MS) {
    return geoCheckOkCache.body;
  }
  if (geoCheckInFlight) return geoCheckInFlight;

  geoCheckInFlight = performGeoCheck()
    .then((body) => {
      geoCheckOkCache = { at: Date.now(), body };
      return body;
    })
    .finally(() => {
      geoCheckInFlight = null;
    });

  return geoCheckInFlight;
}

async function performGeoCheck() {
  const params = new URLSearchParams();
  if (STORE_CODE) params.set('storeCode', STORE_CODE);
  const qs = params.toString();
  const url = `${API_BASE}/api/geo/check${qs ? `?${qs}` : ''}`;
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch (networkError) {
    const err = new Error(networkError?.message || 'Network error');
    err.status = 0;
    throw err;
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok) {
    const err = new Error(body?.message || 'Geo check failed');
    err.status = response.status;
    err.body = body;
    err.code = body?.code ?? null;
    throw err;
  }

  return body;
}
