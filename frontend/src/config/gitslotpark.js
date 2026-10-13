/**
 * GitSlotPark agent tokens, agent ids, and API base URLs live on the backend.
 * Do not put them in VITE_ — they are compiled into the public JS bundle.
 * The browser only names the provider.
 */

const PROVIDER_META = {
  pragmatic: { id: 'pragmatic', label: 'Pragmatic Play' },
  pgsoft: { id: 'pgsoft', label: 'PG Soft' },
  amatic: { id: 'amatic', label: 'Amatic' },
  amusnet: { id: 'amusnet', label: 'Amusnet' }
};

export const GIT_SLOTPARK_PROVIDERS = Object.keys(PROVIDER_META);

export function normalizeGitslotparkProvider(provider) {
  const normalized = String(provider || 'pragmatic').trim().toLowerCase();
  return GIT_SLOTPARK_PROVIDERS.includes(normalized) ? normalized : 'pragmatic';
}

export function getGitslotparkProviderMeta(provider = 'pragmatic') {
  return PROVIDER_META[normalizeGitslotparkProvider(provider)] || PROVIDER_META.pragmatic;
}

export function isGitslotparkConfigured() {
  return true;
}

export function isGitslotparkLaunchConfigured() {
  return true;
}

export function listConfiguredGitslotparkProviders() {
  return GIT_SLOTPARK_PROVIDERS;
}

export function getGitslotparkRequestHeaders(provider = 'pragmatic') {
  return {
    'X-GitSlotPark-Provider': normalizeGitslotparkProvider(provider)
  };
}

/** iframe (default) or tab — tab opens the provider URL in a new browser tab instead of the overlay. */
export function getGitslotparkLaunchMode() {
  const mode = String(import.meta.env.VITE_GIT_SLOTPARK_LAUNCH_MODE || 'iframe').trim().toLowerCase();
  return mode === 'tab' ? 'tab' : 'iframe';
}
