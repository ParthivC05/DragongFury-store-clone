/** Obfuscated lobby path so the URL does not name the provider. */
export const SCORPIO_GAMES_SLUG = 'p9w4x7c2jm';

export function getScorpioGamesPath() {
  return `/${SCORPIO_GAMES_SLUG}`;
}

export function isScorpioPlayProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'scorpio' || raw === 'scorpioplay' || raw === SCORPIO_GAMES_SLUG;
}

export function isScorpioHiddenPath(pathname = '', search = '') {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (path === `/${SCORPIO_GAMES_SLUG}`) return true;
  if (path.startsWith('/play/')) {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    return isScorpioPlayProvider(params.get('provider'));
  }
  return false;
}
