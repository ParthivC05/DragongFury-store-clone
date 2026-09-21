import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest, postRequest, putRequest } from '../services/request';

const SPINWHEEL_BASE = `${API_BASE}/api/spinwheel`;

/** Get public wheel config (segments + colors for display). Pass store scope for guest landing. */
export function getSpinWheelConfig() {
  const query = STORE_CODE ? { store_code: STORE_CODE } : undefined;
  return getRequest(`${SPINWHEEL_BASE}/config`, query);
}

/** Get wheel config for the logged-in user's store (store users see their store's wheel). Requires auth. */
export function getSpinWheelConfigMe() {
  return getRequest(`${SPINWHEEL_BASE}/config/me`);
}

/** Get current user's spin status. Requires auth. */
export function getSpinWheelStatus() {
  return getRequest(`${SPINWHEEL_BASE}/status`);
}

/** Perform a spin. Requires auth. */
export function spinWheelSpin() {
  return postRequest(`${SPINWHEEL_BASE}/spin`);
}

/** Get full spin wheel settings (admin). Requires auth + admin. */
export function getSpinWheelSettings() {
  return getRequest(`${SPINWHEEL_BASE}/settings`);
}

/** Update spin wheel settings (admin). Requires auth + admin. */
export function updateSpinWheelSettings(payload) {
  return putRequest(`${SPINWHEEL_BASE}/settings`, payload);
}

/** Reset spin wheel to platform default for the store (store admin only). Requires auth + admin. */
export function resetSpinWheelSettingsToDefault() {
  return postRequest(`${SPINWHEEL_BASE}/settings/reset-to-default`, {});
}
