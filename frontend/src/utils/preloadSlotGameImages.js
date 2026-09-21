const warmedUrls = new Set();
const preloadedHrefs = new Set();
const inFlight = new Map();
const MAX_CONCURRENT = 12;

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

function shouldSkipWarm() {
  if (typeof navigator === 'undefined') return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return Boolean(connection?.saveData);
}

function addPreloadLink(src, fetchPriority) {
  if (!src || preloadedHrefs.has(src) || typeof document === 'undefined') return;
  preloadedHrefs.add(src);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  if (fetchPriority) link.fetchPriority = fetchPriority;
  document.head.appendChild(link);
}

function loadImageOnce(src, fetchPriority = 'low') {
  if (!src || warmedUrls.has(src)) return Promise.resolve();
  if (inFlight.has(src)) return inFlight.get(src);

  addPreloadLink(src, fetchPriority);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    if ('fetchPriority' in img) img.fetchPriority = fetchPriority;
    const finish = () => {
      warmedUrls.add(src);
      inFlight.delete(src);
      resolve();
    };
    img.onload = finish;
    img.onerror = finish;
    img.src = src;
  });

  inFlight.set(src, promise);
  return promise;
}

export function getSlotGameImageUrl(game) {
  const url = game?.image || (Array.isArray(game?.iconUrls) ? game.iconUrls[0] : '');
  return typeof url === 'string' && url.startsWith('http') ? url : '';
}

export function collectSlotPreviewImageUrls(categories, previewLimit = Infinity) {
  const urls = [];
  for (const category of categories || []) {
    const games = category.games || [];
    const limit = Number.isFinite(previewLimit) ? previewLimit : games.length;
    for (const game of games.slice(0, limit)) {
      const url = getSlotGameImageUrl(game);
      if (url) urls.push(url);
    }
  }
  return [...new Set(urls)];
}

export async function warmSlotGameImages(urls, { highCount } = {}) {
  if (shouldSkipWarm()) return;
  const mobile = isMobileViewport();
  const priorityCount = highCount ?? (mobile ? 16 : 32);
  const maxWarm = Math.max(priorityCount, mobile ? 16 : 32);
  const unique = [...new Set((urls || []).filter(Boolean))].slice(0, maxWarm);
  if (!unique.length) return;

  unique.slice(0, priorityCount).forEach((src) => addPreloadLink(src, 'high'));

  const pending = unique.filter((url) => !warmedUrls.has(url));
  if (!pending.length) return;

  let index = 0;
  async function worker() {
    while (index < pending.length) {
      const current = index;
      index += 1;
      await loadImageOnce(pending[current], current < priorityCount ? 'high' : 'low');
    }
  }

  const workers = Array.from(
    { length: Math.min(mobile ? 6 : MAX_CONCURRENT, pending.length) },
    () => worker()
  );
  await Promise.all(workers);
}
