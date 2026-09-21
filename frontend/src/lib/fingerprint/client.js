import FingerprintJS from '@fingerprintjs/fingerprintjs-pro';
import { STORE_CODE } from '../../config/site';

const PUBLIC_KEY = import.meta.env.VITE_FINGERPRINT_PUBLIC_API_KEY;
const REGION = import.meta.env.VITE_FINGERPRINT_REGION || 'us';
const ENFORCE_STORES = String(import.meta.env.VITE_FINGERPRINT_ENFORCE_STORES || 'dragonfury')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

let agentPromise;

export const DEVICE_SIGNUP_BLOCKED_MESSAGE =
  'An account has already been created on this device. Only one account is allowed per device.';

function normalizeStore(code) {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isFingerprintEnabled() {
  if (!PUBLIC_KEY?.trim()) return false;
  const store = normalizeStore(STORE_CODE);
  if (!store) return false;
  return ENFORCE_STORES.includes(store);
}

export function getFingerprintClientErrorMessage(error, fallback = 'Device verification failed. Please try again.') {
  if (!error) return fallback;
  const candidates = [
    error.message,
    error.error?.message,
    error.data?.error?.message,
    error.data?.message,
    typeof error.code === 'string' ? error.code : null,
    typeof error.error === 'string' ? error.error : null
  ];
  for (const value of candidates) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && trimmed !== '[object Object]') return trimmed;
    }
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}

function loadAgent() {
  if (!isFingerprintEnabled()) return null;
  if (!agentPromise) {
    agentPromise = FingerprintJS.load({
      apiKey: PUBLIC_KEY.trim(),
      region: REGION
    });
  }
  return agentPromise;
}

export async function getFingerprintIdentification() {
  const loader = loadAgent();
  if (!loader) return null;

  const agent = await loader;
  const result = await agent.get({ tag: { purpose: 'signup' } });
  if (!result?.requestId) {
    throw new Error('Device verification did not complete. Please try again.');
  }
  return {
    requestId: result.requestId,
    visitorId: result.visitorId
  };
}

export async function attachFingerprintToBody(body) {
  const next = { ...body };
  if (!isFingerprintEnabled()) return next;
  const fp = await getFingerprintIdentification();
  if (fp?.requestId) next.fingerprintRequestId = fp.requestId;
  return next;
}
