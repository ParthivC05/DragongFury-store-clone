/** Fallback when the store has no configured slideshow images (LCP-optimized). */
export const DASHBOARD_SLIDES_DEFAULT = [
  { src: '/optimized/4.webp', mobileSrc: '/optimized/m4.webp', alt: 'Daily spin wheel' },
  { src: '/optimized/2.webp', mobileSrc: '/optimized/m2.webp', alt: 'Promo slide 2' },
  { src: '/optimized/3.webp', mobileSrc: '/optimized/m3.webp', alt: 'Promo slide 3' },
];

/** @deprecated Use DASHBOARD_SLIDES_DEFAULT */
export const DASHBOARD_SLIDES = DASHBOARD_SLIDES_DEFAULT;
