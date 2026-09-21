/**
 * API base URL for backend.
 * In dev, prefer relative /api so Vite proxy forwards to the backend (see vite.config.js).
 * Direct localhost:8080 calls are cross-origin and trigger a CORS preflight (OPTIONS) per endpoint.
 */
function resolveApiBase() {
  const configured = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (!import.meta.env.DEV) return configured;
  if (!configured) return '';

  try {
    const u = new URL(configured, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const isLocalBackend =
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '[::1]';
    if (isLocalBackend) return '';
  } catch {
    /* keep configured value */
  }
  return configured;
}

export const API_BASE = resolveApiBase();
