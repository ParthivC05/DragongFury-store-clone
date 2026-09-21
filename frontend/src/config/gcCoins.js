import { STORE_CODE } from './site';

function normalizeStore(code) {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function isGcCoinsEnabled() {
  return normalizeStore(STORE_CODE) === 'dragonfury';
}

export function isGcPlayProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return value === 'onegamehub' || value === '1gamehub';
}

export function shouldPromptPlayCoin(provider) {
  if (!isGcCoinsEnabled()) return false;
  return isGcPlayProvider(provider);
}
