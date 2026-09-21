import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest } from '../services/request';

const BASE = `${API_BASE}/api/dashboard-slideshow`;

function mapSlide(slide, index) {
  const mobileSrc =
    typeof slide.mobileSrc === 'string' && slide.mobileSrc.trim()
      ? slide.mobileSrc.trim()
      : typeof slide.mobile_src === 'string' && slide.mobile_src.trim()
        ? slide.mobile_src.trim()
        : undefined;
  const link =
    typeof slide.link === 'string' && slide.link.trim()
      ? slide.link.trim()
      : typeof slide.href === 'string' && slide.href.trim()
        ? slide.href.trim()
        : undefined;
  return {
    src: slide.src.trim(),
    ...(mobileSrc ? { mobileSrc } : {}),
    ...(link ? { link } : {}),
    alt:
      typeof slide.alt === 'string' && slide.alt.trim()
        ? slide.alt.trim()
        : `Slide ${index + 1}`,
  };
}

function parseSlides(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((slide) => slide && typeof slide.src === 'string' && slide.src.trim())
    .map(mapSlide);
}

function parseSlideshowPayload(res) {
  return {
    slides: parseSlides(res?.slides),
    casinoSlides: parseSlides(res?.casinoSlides ?? res?.casino_slides),
  };
}

function pickSlideshowSlides(payload, placement = 'home') {
  if (placement === 'casino' && payload.casinoSlides.length > 0) {
    return payload.casinoSlides;
  }
  return payload.slides;
}

function fetchSlideshow(storeCode, placement = 'home') {
  const params = storeCode ? { store_code: storeCode } : {};
  return getRequest(`${BASE}/public`, params).then((res) =>
    pickSlideshowSlides(parseSlideshowPayload(res), placement)
  );
}

/** Public slideshow slides. Casino falls back to homepage when casino slides are empty. */
export function getDashboardSlideshowPublic(
  storeCode = STORE_CODE,
  { placement = 'home' } = {}
) {
  const early =
    typeof window !== 'undefined' ? window.__DRAGONFURY_SLIDESHOW_PROMISE__ : null;
  if (early) {
    return Promise.resolve(early)
      .then((res) => pickSlideshowSlides(parseSlideshowPayload(res), placement))
      .catch(() => fetchSlideshow(storeCode, placement));
  }
  return fetchSlideshow(storeCode, placement);
}
