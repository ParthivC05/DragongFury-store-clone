/** Obfuscated lobby path so the URL does not name the provider. */
export const WIN568_GAMES_SLUG = 'k7n2m9qx4h';

export function getWin568GamesPath() {
  return `/${WIN568_GAMES_SLUG}`;
}

export function isWin568PlayProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'win568' || raw === '568win' || raw === WIN568_GAMES_SLUG;
}

export function isWin568HiddenPath(pathname = '') {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  return path === `/${WIN568_GAMES_SLUG}`;
}
