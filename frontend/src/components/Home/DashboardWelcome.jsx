import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getSlideshowImageSrc,
  useSlideshowImagePreload,
} from '../../hooks/useSlideshowImagePreload';
import { useDashboardSlideshow } from '../../hooks/useDashboardSlideshow';

export { DASHBOARD_SLIDES, DASHBOARD_SLIDES_DEFAULT } from '../../constants/dashboardSlides';

const SLIDE_INTERVAL_MS = 5000;
const SWIPE_THRESHOLD_PX = 48;

function shouldLoadSlideImage(index, activeIndex, neighborsReady) {
  if (index === activeIndex) return true;
  if (!neighborsReady) return false;
  const next = activeIndex + 1;
  const prev = activeIndex - 1;
  return index === next || index === prev;
}

function getSlideLink(slide) {
  if (!slide || typeof slide.link !== 'string') return '';
  return slide.link.trim();
}

function lcpSlideCacheKey() {
  return window.matchMedia('(max-width: 767px)').matches ? 'pj-lcp-slide-m' : 'pj-lcp-slide-d';
}

function isBundledFallbackUrl(url) {
  return /\/optimized\/m?[234]\.webp(?:\?|$)/i.test(String(url || ''));
}

function hideHtmlLcpHero(imageSrc) {
  if (!imageSrc || isBundledFallbackUrl(imageSrc)) return;
  try {
    localStorage.setItem(lcpSlideCacheKey(), imageSrc);
  } catch {
    /* ignore */
  }
  requestAnimationFrame(() => {
    document.documentElement.classList.add('pj-lcp-takenover');
  });
}

function openSlideDestination(navigate, link) {
  if (!link) return;
  if (/^https?:\/\//i.test(link)) {
    window.location.assign(link);
    return;
  }
  if (link.startsWith('/') && !link.startsWith('//')) {
    navigate(link);
  }
}

export function DashboardWelcome({ isAuthenticated, placement = 'home' }) {
  const navigate = useNavigate();
  const { slides } = useDashboardSlideshow({ placement });
  const [activeSlide, setActiveSlide] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const slideshowRef = useRef(null);
  const dragStartXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const activeSlideRef = useRef(0);
  const firstUrlRef = useRef('');
  const [loadedSlides, setLoadedSlides] = useState(() => new Set());
  const [neighborsReady, setNeighborsReady] = useState(false);

  const { isMobile } = useSlideshowImagePreload();
  const isHomeHero = placement === 'home';
  const firstSrc = getSlideshowImageSrc(slides[0], isMobile);
  const htmlBootEl = typeof document !== 'undefined' ? document.getElementById('pj-lcp-hero') : null;
  const htmlBootSrc = htmlBootEl?.currentSrc || htmlBootEl?.src || '';
  const bootCoversFirstSlide =
    isHomeHero &&
    isMobile &&
    Boolean(firstSrc) &&
    htmlBootSrc.includes(firstSrc) &&
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('pj-lcp-has-src') &&
    !document.documentElement.classList.contains('pj-lcp-takenover');
  const heroReady = Boolean(firstSrc && (loadedSlides.has(firstSrc) || bootCoversFirstSlide));
  const showPlaceholder = !heroReady && !bootCoversFirstSlide;
  const heroWidth = isMobile ? 1774 : 2172;
  const heroHeight = isMobile ? 887 : 724;

  activeSlideRef.current = activeSlide;

  useEffect(() => {
    if (firstUrlRef.current && firstUrlRef.current !== firstSrc) {
      setActiveSlide(0);
    }
    firstUrlRef.current = firstSrc;
  }, [firstSrc]);

  const markSlideLoaded = useCallback((url) => {
    if (!url) return;
    setLoadedSlides((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const hero = slideshowRef.current?.querySelector('img.dash-welcome-slide');
    if (hero && hero.complete && hero.naturalWidth > 0) {
      markSlideLoaded(firstSrc || hero.currentSrc || hero.src);
      if (isHomeHero) hideHtmlLcpHero(hero.currentSrc || hero.src);
    }
  }, [slides, firstSrc, markSlideLoaded, isHomeHero]);

  useEffect(() => {
    if (!isHomeHero) {
      document.documentElement.classList.add('pj-lcp-takenover');
    }
  }, [isHomeHero]);

  useEffect(() => {
    if (activeSlide === 0 && !isDragging) return undefined;
    document.documentElement.classList.add('pj-lcp-takenover');
    return undefined;
  }, [activeSlide, isDragging]);

  useEffect(() => {
    const start = () => setNeighborsReady(true);
    const idleId =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(start, { timeout: 2500 })
        : window.setTimeout(start, 1200);
    return () => {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, []);

  const goToSlide = useCallback(
    (index) => {
      const total = slides.length;
      if (!total) return;
      const next = ((index % total) + total) % total;
      setActiveSlide(next);
    },
    [slides.length],
  );

  const goNext = useCallback(() => {
    goToSlide(activeSlideRef.current + 1);
  }, [goToSlide]);

  const goPrev = useCallback(() => {
    goToSlide(activeSlideRef.current - 1);
  }, [goToSlide]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const id = setInterval(goNext, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [activeSlide, goNext, slides.length]);

  const finishDrag = useCallback(
    (clientX) => {
      if (!isDraggingRef.current) return;

      const delta = clientX - dragStartXRef.current;
      isDraggingRef.current = false;
      setIsDragging(false);
      setDragOffset(0);

      if (delta < -SWIPE_THRESHOLD_PX) {
        goNext();
      } else if (delta > SWIPE_THRESHOLD_PX) {
        goPrev();
      } else if (!isAuthenticated) {
        navigate('/register');
      } else {
        openSlideDestination(navigate, getSlideLink(slides[activeSlideRef.current]));
      }
    },
    [goNext, goPrev, isAuthenticated, navigate, slides],
  );

  const handlePointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    setIsDragging(true);
    setDragOffset(0);
    slideshowRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;
    setDragOffset(e.clientX - dragStartXRef.current);
  };

  const handlePointerUp = (e) => {
    if (!isDraggingRef.current) return;
    slideshowRef.current?.releasePointerCapture(e.pointerId);
    finishDrag(e.clientX);
  };

  const handlePointerCancel = (e) => {
    if (!isDraggingRef.current) return;
    slideshowRef.current?.releasePointerCapture(e.pointerId);
    finishDrag(e.clientX);
  };

  const trackStyle = {
    transform: `translateX(calc(-${activeSlide * 100}% + ${dragOffset}px))`,
    transition: isDragging ? 'none' : 'transform 0.4s ease',
  };

  const activeSlideLink = getSlideLink(slides[activeSlide]);
  const isSlideClickable = !isAuthenticated || Boolean(activeSlideLink);

  return (
    <section
      className="dash-welcome dash-welcome--slideshow"
      aria-label="Dashboard highlights"
      role="region"
    >
      <div
        ref={slideshowRef}
        className={`dash-welcome-slideshow${isDragging ? ' dash-welcome-slideshow--dragging' : ''}${
          showPlaceholder ? ' dash-welcome-slideshow--loading' : ''
        }`}
        style={isSlideClickable ? { cursor: 'pointer' } : undefined}
        role={isSlideClickable ? 'button' : undefined}
        aria-label={
          !isAuthenticated
            ? slides[activeSlide]?.alt || 'Sign up'
            : activeSlideLink
              ? slides[activeSlide]?.alt || 'Open linked page'
              : undefined
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={(e) => {
          if (isDraggingRef.current && !e.currentTarget.hasPointerCapture(e.pointerId)) {
            finishDrag(e.clientX);
          }
        }}
      >
        {showPlaceholder ? <span className="dash-welcome-slide-placeholder" aria-hidden /> : null}
        <div className="dash-welcome-slideshow-track" style={trackStyle}>
          {slides.map((slide, index) => {
            const imageSrc = getSlideshowImageSrc(slide, isMobile);
            const isHero = index === 0;
            const useHtmlBootHero = isHero && bootCoversFirstSlide;
            const loadImage =
              !useHtmlBootHero &&
              shouldLoadSlideImage(index, activeSlide, neighborsReady);

            return (
              <div key={`${slide.src}-${index}`} className="dash-welcome-slide-frame">
                {loadImage && imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={slide.alt}
                    className="dash-welcome-slide dash-welcome-slide--ready"
                    draggable={false}
                    decoding={isHero ? 'sync' : 'async'}
                    width={heroWidth}
                    height={heroHeight}
                    sizes="100vw"
                    loading={isHero ? 'eager' : 'lazy'}
                    fetchPriority={isHero ? 'high' : 'low'}
                    aria-hidden={index !== activeSlide}
                    onLoad={() => {
                      markSlideLoaded(imageSrc);
                      if (isHero && isHomeHero) hideHtmlLcpHero(imageSrc);
                    }}
                    onError={() => {
                      markSlideLoaded(imageSrc);
                    }}
                    ref={(node) => {
                      if (node && node.complete && node.naturalWidth > 0) {
                        markSlideLoaded(imageSrc);
                        if (isHero && isHomeHero) hideHtmlLcpHero(imageSrc);
                      }
                    }}
                  />
                ) : (
                  <div className="dash-welcome-slide dash-welcome-slide--ready" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
        {slides.length > 1 ? (
          <div
            className="dash-welcome-slideshow-dots"
            role="tablist"
            aria-label="Slide navigation"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {slides.map((slide, index) => (
              <button
                key={`${slide.src}-dot-${index}`}
                type="button"
                role="tab"
                aria-selected={index === activeSlide}
                aria-label={`Go to slide ${index + 1}: ${slide.alt}`}
                className={`dash-welcome-slideshow-dot${index === activeSlide ? ' dash-welcome-slideshow-dot--active' : ''}`}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
