/**
 * Guest Link2Play catalog — static fallback when the admin API is empty/unavailable.
 *
 * Prefer admin-managed rows via GET /api/link2play (DragonFury).
 *
 * `status`: 'live' | 'soon'
 * `links.web|android|ios`: URL string to enable a play button; omit/empty → disabled.
 * `unavailable`: legacy — prefer omitting links instead.
 * `popular`: shows the hot ribbon on the card art (category "popular" from admin).
 */

function links(web, extras = {}) {
  const next = { web };
  if (extras.android) next.android = extras.android === true ? web : extras.android;
  if (extras.ios) next.ios = extras.ios === true ? web : extras.ios;
  return next;
}

export const LINK2PLAY_GAMES = [
  {
    id: 'goldendragon',
    name: 'Golden Dragon',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786379192288-fcbecb3ff24dabf6.webp',
    status: 'live',
    popular: true,
    links: links('https://www.playgd.mobi/SSLobby/m4488.0/web-mobile/index.html', {
      android: true,
      ios: true,
    }),
  },
  {
    id: 'firekirin',
    name: 'Firekirin',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381340419-e7a57f91948ce15b.webp',
    status: 'live',
    popular: true,
    links: links('https://start.firekirin.xyz:8580/index.html', { android: true, ios: true }),
  },
  {
    id: 'juwa',
    name: 'Juwa',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381357889-860bde7a0f84b829.webp',
    status: 'live',
    popular: true,
    links: links('https://dl.juwa777.com/', { android: true, ios: true }),
  },
  {
    id: 'vegasx',
    name: 'VegasX',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381387932-655ef319590f7a4f.webp',
    status: 'live',
    links: links('https://vegas-x.org/', { android: true, ios: true }),
  },
  {
    id: 'riversweeps',
    name: 'Riversweeps',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381403980-a56c71f69b404d5a.webp',
    status: 'live',
    links: links('https://river777.net/'),
  },
  {
    id: 'vblink',
    name: 'Vblink / Vpower',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381419710-1167697bc2ce3e08.webp',
    status: 'live',
    links: links('https://www.vblink777.club/', { android: true, ios: true }),
  },
  {
    id: 'ultrapanda',
    name: 'Ultra Panda',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381437894-4314095bfdc01c9c.webp',
    status: 'live',
    links: links('https://www.ultrapanda.mobi/', { android: true }),
    unavailable: ['ios'],
  },
  {
    id: 'orionstar',
    name: 'Orionstar',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381480228-bb79264ce2a5f735.webp',
    status: 'live',
    links: links('http://start.orionstars.vip:8580/index.html', { android: true, ios: true }),
  },
  {
    id: 'gamevault',
    name: 'Game Vault',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381521812-b1ddc7b22c24768b.webp',
    status: 'live',
    links: links('https://download.gamevault999.com/', { android: true }),
    unavailable: ['ios'],
  },
  {
    id: 'milkyway',
    name: 'Milkyway',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381533283-e0da8f86b3bc5346.webp',
    status: 'live',
    links: links('https://milkywayapp.xyz/', { android: true, ios: true }),
  },
  {
    id: 'egame',
    name: 'Egame',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381549638-9e8546a8abd8295e.webp',
    status: 'live',
    links: links('https://www.egame99.club/', { android: true, ios: true }),
  },
  {
    id: 'grandsweeps',
    name: 'Grand Sweeps',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381629676-e302153c3b7910b5.jpg',
    status: 'live',
    links: links('http://grandsweeps.xyz:8580/index.html', { android: true }),
    unavailable: ['ios'],
  },
  {
    id: 'pandamaster',
    name: 'Panda Master',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381650266-d0220aed2ec7aadb.jpg',
    status: 'live',
    links: links('https://pandamaster.vip:8888/index.html', { android: true, ios: true }),
  },
  {
    id: 'vegasweeps',
    name: 'Vegas Sweeps',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381682958-364a743b12eb2e37.png',
    status: 'live',
    links: links('https://m.lasvegassweeps.com/'),
  },
  {
    id: 'cashmachine',
    name: 'Cash Machine',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381566795-7530e6773bf2ac90.webp',
    status: 'live',
    links: links('https://www.cashmachine777.com/', { android: true, ios: true }),
  },
  {
    id: 'rivermonster',
    name: 'River Monster',
    image_url: 'https://partners-platforms.s3.us-east-1.amazonaws.com/link2play/1786381700055-e40d8baf5fb49b6b.jpg',
    status: 'live',
    links: links('https://www.rm777.net/', { android: true }),
    unavailable: ['ios'],
  },
];

/** Art gradient variants (cycled by game id hash). */
export const LINK2PLAY_ART_VARIANTS = 8;

export function getLink2PlayArtVariant(game) {
  const key = String(game?.id ?? game?.name ?? 'game');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) & 0xffff;
  }
  return (hash % LINK2PLAY_ART_VARIANTS) + 1;
}

/** Only allow http(s) external play links (blocks javascript:/data: etc.). */
export function isSafeExternalPlayUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
