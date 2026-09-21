import { getRequest, postRequest } from '../services/request';

const API_BASE = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
  : '';

const BASE = `${API_BASE}/api/email-campaigns`;

export function getClaimPreview(token) {
  const qs = new URLSearchParams({ token: String(token || '') });
  return getRequest(`${BASE}/claim-preview?${qs}`);
}

export function claimOffer(token) {
  return postRequest(`${BASE}/claim`, { token });
}

export function applyDiscountCode(code) {
  return postRequest(`${BASE}/apply-code`, { code });
}

export function getAppliedDiscountCode() {
  return getRequest(`${BASE}/applied-code`);
}

export function removeDiscountCode() {
  return postRequest(`${BASE}/remove-code`, {});
}
