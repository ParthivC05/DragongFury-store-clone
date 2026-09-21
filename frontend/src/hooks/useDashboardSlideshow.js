import { useEffect, useState } from 'react';
import { getDashboardSlideshowPublic } from '../api/dashboardSlideshow';
import { STORE_CODE } from '../config/site';

const CMS_SLIDES_CACHE_KEY = 'pj-cms-slides';
const CMS_CASINO_SLIDES_CACHE_KEY = 'pj-cms-slides-casino';

/** Bundled marketing banners — never show these; admin CMS slides only. */
function isBundledFallbackUrl(url) {
  return /\/optimized\/m?[234]\.webp(?:\?|$)/i.test(String(url || ''));
}

function isAdminSlide(slide) {
  if (!slide?.src) return false;
  if (isBundledFallbackUrl(slide.src)) return false;
  if (slide.mobileSrc && isBundledFallbackUrl(slide.mobileSrc)) return false;
  return true;
}

function slidesSignature(list) {
  return (Array.isArray(list) ? list : [])
    .map((slide) => `${slide?.src || ''}|${slide?.mobileSrc || ''}|${slide?.link || ''}`)
    .join('||');
}

function readCachedFirstAdminUrl() {
  try {
    const key = window.matchMedia('(max-width: 767px)').matches ? 'pj-lcp-slide-m' : 'pj-lcp-slide-d';
    const url = localStorage.getItem(key);
    if (url && !isBundledFallbackUrl(url)) return url;
  } catch {
    /* ignore */
  }
  return '';
}

function cacheKeyForPlacement(placement) {
  return placement === 'casino' ? CMS_CASINO_SLIDES_CACHE_KEY : CMS_SLIDES_CACHE_KEY;
}

function readCachedCmsSlides(cacheKey = CMS_SLIDES_CACHE_KEY) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(cacheKey) || '');
    if (!Array.isArray(parsed)) return null;
    const adminOnly = parsed.filter(isAdminSlide);
    return adminOnly.length ? adminOnly : null;
  } catch {
    /* ignore */
  }
  return null;
}

function readInitialAdminSlides(placement = 'home') {
  const cached = readCachedCmsSlides(cacheKeyForPlacement(placement));
  if (cached) return cached;
  if (placement === 'casino') {
    const homeCached = readCachedCmsSlides(CMS_SLIDES_CACHE_KEY);
    if (homeCached) return homeCached;
  }
  if (placement !== 'home') return [];
  const url = readCachedFirstAdminUrl();
  return url ? [{ src: url, alt: 'Featured' }] : [];
}

function writeCachedCmsSlides(list, cacheKey = CMS_SLIDES_CACHE_KEY) {
  try {
    const adminOnly = (Array.isArray(list) ? list : []).filter(isAdminSlide);
    if (adminOnly.length) {
      sessionStorage.setItem(cacheKey, JSON.stringify(adminOnly));
    } else {
      sessionStorage.removeItem(cacheKey);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Admin CMS slides only. No bundled /optimized/2-4.webp placeholders.
 */
export function useDashboardSlideshow({ placement = 'home' } = {}) {
  const [slides, setSlides] = useState(() => readInitialAdminSlides(placement));

  useEffect(() => {
    let cancelled = false;

    function applySlides(next) {
      if (cancelled) return;
      const list = (Array.isArray(next) ? next : []).filter(isAdminSlide);
      writeCachedCmsSlides(list, cacheKeyForPlacement(placement));
      if (!list.length && placement === 'home') {
        try {
          localStorage.removeItem('pj-lcp-slide-m');
          localStorage.removeItem('pj-lcp-slide-d');
        } catch {
          /* ignore */
        }
        document.documentElement.classList.remove('pj-lcp-has-src');
        document.documentElement.classList.add('pj-lcp-takenover');
      }
      setSlides((prev) => (slidesSignature(prev) === slidesSignature(list) ? prev : list));
    }

    getDashboardSlideshowPublic(STORE_CODE, { placement })
      .then((remote) => applySlides(remote))
      .catch(() => {
        /* Keep cached admin slides if the live fetch fails. Never inject bundled fallbacks. */
      });

    return () => {
      cancelled = true;
    };
  }, [placement]);

  return { slides };
}
