import { useEffect, useState } from 'react';

function useMobileSlideshowViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

/**
 * Prefer mobileSrc on small viewports when available.
 * @param {{ src?: string, mobileSrc?: string } | null | undefined} slide
 * @param {boolean} [isMobile]
 */
export function getSlideshowImageSrc(slide, isMobile = false) {
  if (!slide) return '';
  if (isMobile && typeof slide.mobileSrc === 'string' && slide.mobileSrc.trim()) {
    return slide.mobileSrc.trim();
  }
  return typeof slide.src === 'string' ? slide.src : '';
}

/**
 * Viewport helper for slideshow `src` vs `mobileSrc`.
 * Image loading is left to the LCP <img> (and nearby slides) so we do not
 * download every CMS banner up front or race a second Image() preload.
 */
export function useSlideshowImagePreload() {
  const isMobile = useMobileSlideshowViewport();
  return { isMobile };
}
