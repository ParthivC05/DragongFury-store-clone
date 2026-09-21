const PACKAGE_IMAGES = ['/optimized/P1.webp', '/optimized/P2.webp', '/optimized/P3.webp'];

const preloadedHrefs = new Set();
let preloadPromise = null;

/**
 * Pick a package card image from public/ by position within the section.
 * Cycles P1 → P2 → P3 for additional packages.
 */
export function getDepositPackageImage(index = 0) {
  const i = Number(index);
  const safeIndex = Number.isFinite(i) && i >= 0 ? i : 0;
  return PACKAGE_IMAGES[safeIndex % PACKAGE_IMAGES.length];
}

export function getDepositPackageImageUrls() {
  return PACKAGE_IMAGES;
}

export function getDepositPackageImageProps(index = 0, { eager = true } = {}) {
  return {
    src: getDepositPackageImage(index),
    width: 512,
    height: 512,
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    fetchPriority: eager ? 'high' : 'auto',
    draggable: false
  };
}

function addPreloadLink(src) {
  if (!src || preloadedHrefs.has(src) || typeof document === 'undefined') return;
  preloadedHrefs.add(src);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.fetchPriority = 'high';
  document.head.appendChild(link);
}

/** Decode P1–P3 into memory so package cards paint immediately. */
export function preloadDepositPackageImages() {
  if (preloadPromise) return preloadPromise;
  if (typeof window === 'undefined') return Promise.resolve();

  preloadPromise = Promise.all(
    PACKAGE_IMAGES.map((src) => new Promise((resolve) => {
      addPreloadLink(src);
      const img = new Image();
      img.decoding = 'async';
      if ('fetchPriority' in img) img.fetchPriority = 'high';
      const finish = () => {
        if (typeof img.decode === 'function') {
          img.decode().then(resolve, resolve);
        } else {
          resolve();
        }
      };
      img.onload = finish;
      img.onerror = resolve;
      img.src = src;
    }))
  );

  return preloadPromise;
}
