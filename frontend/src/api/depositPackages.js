import { API_BASE } from '../config/api';
import { getRequest } from '../services/request';
import { normalizePackageCatalog } from '../utils/depositPackageAvailability';

const BASE = `${API_BASE}/api/deposit-packages`;

export function getDepositPackagesCatalog() {
  return getRequest(`${BASE}/catalog`);
}

/**
 * Load + normalize catalog with retries (avoids intermittent empty package UI).
 */
export async function fetchNormalizedDepositPackagesCatalog({
  retries = 2,
  retryDelayMs = 400
} = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await getDepositPackagesCatalog();
      return normalizePackageCatalog(raw);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, retryDelayMs * (attempt + 1));
        });
      }
    }
  }
  if (lastErr) throw lastErr;
  return { enabled: false, groups: [] };
}
