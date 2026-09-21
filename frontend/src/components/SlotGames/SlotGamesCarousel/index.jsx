import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { GAME_PLACEHOLDER } from '../../../utils/gitslotparkLandingGames';
import { isScorpioPlayProvider } from '../../../config/scorpio';
import { getSlotLobbyCategoryMeta, SlotLobbyIcon } from '../slotLobbyMeta';
import './slot-games-carousel.css';

function isOneGameHubProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return value === 'onegamehub' || value === '1gamehub';
}

function isPosterLobbyCategory(categoryId) {
  const id = String(categoryId || '').trim().toLowerCase();
  return id === 'others' || id === 'other' || id === 'buffalo-blast' || id === 'buffalo' || id === 'fishing';
}

const CAROUSEL_SKELETON_COUNT = 8;
const TOP_GAMES_COUNT = 10;
const EAGER_IMAGE_COUNT = 12;

function getCarouselIconCandidates(src, iconUrls) {
  const ordered = [...(Array.isArray(iconUrls) ? iconUrls : []), src]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url && url !== GAME_PLACEHOLDER && !url.toLowerCase().includes('gamevault'));

  return [...new Set(ordered)];
}

function CarouselGameImage({ src, iconUrls, alt, className, priority = false, blurFill = false }) {
  const candidates = getCarouselIconCandidates(src, iconUrls);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const imgSrc = (!failed && candidates[candidateIndex]) || GAME_PLACEHOLDER;
  const isLogo = imgSrc === GAME_PLACEHOLDER;

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [src, iconUrls]);

  const handleError = () => {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((index) => index + 1);
      return;
    }
    setFailed(true);
  };

  return (
    <>
      {isLogo || !blurFill ? null : (
        <img
          src={imgSrc}
          alt=""
          aria-hidden
          className={`${className} dash-slot-carousel-card-img--blur is-loaded`}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          draggable={false}
          onError={handleError}
        />
      )}
      <img
        src={imgSrc}
        alt={alt}
        className={`${className} is-loaded${isLogo ? ' dash-slot-carousel-card-img--logo' : ''}`}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
        onError={handleError}
      />
    </>
  );
}

function CarouselGameCardSkeleton({ ranked = false, guestInspo = false }) {
  if (guestInspo) {
    return (
      <div className="dash-guest-gcard dash-guest-gcard--skeleton" aria-hidden>
        <div className="dash-guest-gcard-art">
          <div className="dash-slot-carousel-card-skeleton" />
        </div>
        <div className="dash-guest-gcard-name dash-guest-gcard-name--skeleton" />
      </div>
    );
  }

  if (ranked) {
    return (
      <div className="dash-slot-carousel-ranked-unit dash-slot-carousel-card--skeleton" aria-hidden>
        <span className="dash-slot-carousel-card-rank dash-slot-carousel-card-rank--skeleton" data-rank="1">1</span>
        <div className="dash-slot-carousel-card dash-slot-carousel-card--ranked">
          <div className="dash-slot-carousel-card-art">
            <div className="dash-slot-carousel-card-skeleton" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-slot-carousel-card dash-slot-carousel-card--skeleton" aria-hidden>
      <div className="dash-slot-carousel-card-art">
        <div className="dash-slot-carousel-card-skeleton" />
      </div>
    </div>
  );
}

function CarouselGameCard({
  game,
  onPlay,
  onCardClick,
  playing = false,
  rank,
  priority = false,
  compact = false,
  cardVariant = 'default',
  overlayCta = 'Sign Up to Play',
  categoryId = null,
}) {
  const isRanked = rank != null;
  const isGuestInspo = cardVariant === 'guest-inspo';

  const handlePlay = useCallback(
    (event) => {
      if (playing || onCardClick?.(event)) return;
      onPlay?.(game);
    },
    [game, onCardClick, onPlay, playing]
  );

  const cardProps = {
    type: 'button',
    role: 'listitem',
    disabled: playing,
    draggable: false,
    onClick: handlePlay,
  };

  const isOneGameHub = isOneGameHubProvider(game.provider);
  const isScorpio = isScorpioPlayProvider(game.provider);
  const isOthers = isPosterLobbyCategory(categoryId);
  const sizeClass = isOneGameHub ? ' dash-slot-carousel-card--onegamehub' : '';
  const useBlurFill = isScorpio && !isOthers && !isGuestInspo;
  const cardFillClass = useBlurFill ? ' dash-slot-carousel-card--blur-fill' : ' dash-slot-carousel-card--cover';

  const art = (
    <span className={isGuestInspo ? 'dash-guest-gcard-art' : `dash-slot-carousel-card-art${cardFillClass}`}>
      <CarouselGameImage
        src={game.image}
        iconUrls={game.iconUrls}
        alt={game.title}
        className="dash-slot-carousel-card-img"
        priority={priority}
        blurFill={useBlurFill}
      />
    </span>
  );

  const meta = (
    <span className={isGuestInspo ? 'dash-guest-gcard-name' : 'dash-slot-carousel-card-meta'}>
      {isGuestInspo ? (
        game.title
      ) : (
        <span className="dash-slot-carousel-card-name">{game.title}</span>
      )}
    </span>
  );

  if (isGuestInspo) {
    const badge = getGuestInspoBadge(game, rank);
    return (
      <button
        {...cardProps}
        className={`dash-guest-gcard${playing ? ' dash-guest-gcard--playing' : ''}`}
        aria-label={`${overlayCta}: ${game.title}`}
      >
        {badge ? (
          <span className={`dash-guest-gcard-badge dash-guest-gcard-badge--${badge.type}`}>
            {badge.label}
          </span>
        ) : null}
        {art}
        <span className="dash-guest-gcard-ov" aria-hidden>
          <span className="dash-guest-gcard-ov-btn">{overlayCta}</span>
        </span>
        {meta}
      </button>
    );
  }

  if (isRanked) {
    return (
      <button
        {...cardProps}
        className="dash-slot-carousel-ranked-unit"
        aria-label={`Play ${game.title}, ranked ${rank}`}
      >
        <span
          className={`dash-slot-carousel-card-rank${Number(rank) >= 10 ? ' dash-slot-carousel-card-rank--wide' : ''}`}
          data-rank={rank}
          aria-hidden
        >
          {rank}
        </span>
        <span className={`dash-slot-carousel-card dash-slot-carousel-card--ranked${cardFillClass}${sizeClass}${playing ? ' dash-slot-carousel-card--playing' : ''}`}>
          {art}
          {meta}
        </span>
      </button>
    );
  }

  return (
    <button
      {...cardProps}
      className={`dash-slot-carousel-card${cardFillClass}${sizeClass}${compact ? ' dash-slot-carousel-card--compact' : ''}${playing ? ' dash-slot-carousel-card--playing' : ''}`}
      aria-label={`Play ${game.title}`}
    >
      {art}
      {meta}
    </button>
  );
}

function getGuestInspoBadge(game, index = 0) {
  const n = Number(index) || 0;
  if (n % 11 === 4 || n % 11 === 5) return { type: 'new', label: 'NEW' };
  if (n % 7 === 0 || n % 7 === 3) return { type: 'hot', label: 'HOT' };
  return { type: 'instant', label: 'INSTANT' };
}

export function SlotGamesCarousel({
  label,
  games,
  ariaLabel,
  loading = false,
  ranked = false,
  compact = false,
  categoryId = null,
  grid = false,
  gridClassName = 'dash-slot-grid',
  skeletonCount,
  onPlay,
  playingGameId = null,
  showAllHref = null,
  hideNav = false,
  cardVariant = 'default',
  overlayCta = 'Sign Up to Play',
}) {
  const visibleGames = games || [];
  const gamesKey = `${visibleGames.length}:${visibleGames[0]?.id || ''}:${visibleGames[visibleGames.length - 1]?.id || ''}`;
  const meta = getSlotLobbyCategoryMeta(categoryId, visibleGames.length);
  const scrollRef = useRef(null);
  const hasScrolledRef = useRef(false);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startScroll: 0,
    moved: false,
    captured: false,
    pointerId: null,
  });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = Math.max(0, Math.round(el.scrollLeft));

    if (left > 8) {
      hasScrolledRef.current = true;
    }

    setCanScrollLeft(left > 8);
    setCanScrollRight(maxScroll > 8 && left < maxScroll - 8);
  }, []);

  const resetCarouselScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    hasScrolledRef.current = false;
    el.scrollLeft = 0;
    setCanScrollLeft(false);

    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanScrollRight(maxScroll > 8);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    resetCarouselScroll();
    const rafId = requestAnimationFrame(updateScrollState);
    const measureId = window.setTimeout(updateScrollState, 120);

    const handleScroll = () => {
      updateScrollState();
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    const resizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });
    resizeObserver.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(measureId);
      el.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [gamesKey, loading, resetCarouselScroll, updateScrollState]);

  const scrollCarousel = useCallback(
    (direction) => {
      const el = scrollRef.current;
      if (!el) return;
      const amount = Math.max(el.clientWidth * 0.85, 280);
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      const nextLeft = Math.max(0, Math.min(maxScroll, el.scrollLeft + direction * amount));
      hasScrolledRef.current = nextLeft > 8;
      el.scrollTo({ left: nextLeft, behavior: 'smooth' });
      window.setTimeout(updateScrollState, 320);
    },
    [updateScrollState]
  );

  const handlePointerDown = useCallback((event) => {
    const el = scrollRef.current;
    if (!el || event.button !== 0) return;
    // Let the browser handle touch/pen natively so vertical swipes still scroll
    // the page; only do manual drag-to-scroll for mouse input.
    if (event.pointerType && event.pointerType !== 'mouse') return;

    // NOTE: we intentionally do NOT call setPointerCapture here. Capturing the
    // pointer on the scroll container makes the browser dispatch the follow-up
    // `click` to the container instead of the card button, which would swallow
    // the play action. Capture is engaged later, only once a real drag starts.
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startScroll: el.scrollLeft,
      moved: false,
      captured: false,
      pointerId: event.pointerId,
    };
  }, []);

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      const el = scrollRef.current;
      if (!drag.active || !el) return;

      const deltaX = event.clientX - drag.startX;
      if (Math.abs(deltaX) > 4) {
        drag.moved = true;
        event.preventDefault();
        // Engage capture only now (real drag) so tracking continues even if the
        // pointer leaves the strip. Plain clicks never reach this branch.
        if (!drag.captured) {
          drag.captured = true;
          try {
            el.setPointerCapture(drag.pointerId);
          } catch {
            void 0;
          }
          el.classList.add('dash-slot-carousel-scroll--dragging');
        }
      }
      el.scrollLeft = drag.startScroll - deltaX;
      updateScrollState();
    },
    [updateScrollState]
  );

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    const el = scrollRef.current;
    if (!drag.active || !el) return;

    drag.active = false;
    if (drag.captured && drag.pointerId != null) {
      try {
        el.releasePointerCapture(drag.pointerId);
      } catch {
        void 0;
      }
    }
    el.classList.remove('dash-slot-carousel-scroll--dragging');
    updateScrollState();

    if (drag.moved) {
      window.setTimeout(() => {
        dragRef.current.moved = false;
      }, 0);
    }
  }, [updateScrollState]);

  const handleCardClick = useCallback((event) => {
    if (dragRef.current.moved) {
      event.preventDefault();
      return true;
    }
    return false;
  }, []);

  if (grid) {
    const gridSkeletonCount = skeletonCount ?? CAROUSEL_SKELETON_COUNT;
    const guestInspo = cardVariant === 'guest-inspo';
    return (
      <div className="dash-slot-carousel-block" id={categoryId ? `slot-cat-${categoryId}` : undefined}>
        {label || showAllHref ? (
          <div className="dash-slot-carousel-head">
            {label ? (
              <div className="dash-slot-carousel-title-wrap">
                <span className="slot-lobby-badge" style={{ '--c': meta.color }}>
                  <SlotLobbyIcon name={meta.icon} />
                </span>
                <div>
                  <p className="dash-slot-carousel-label">{label}</p>
                  <div className="dash-slot-carousel-sub">{meta.subtitle}</div>
                </div>
              </div>
            ) : null}
            {showAllHref ? (
              <Link to={showAllHref} className="dash-slot-carousel-show-all">
                See all
              </Link>
            ) : null}
          </div>
        ) : null}
        <div
          className={gridClassName}
          role="list"
          aria-label={ariaLabel || label}
          aria-busy={loading}
        >
          {loading
            ? Array.from({ length: gridSkeletonCount }, (_, index) => (
                <CarouselGameCardSkeleton
                  key={`${label || 'grid'}-grid-skeleton-${index}`}
                  guestInspo={guestInspo}
                />
              ))
            : visibleGames.map((game, index) => (
                <CarouselGameCard
                  key={game.id ?? game.title}
                  game={game}
                  onPlay={onPlay}
                  playing={playingGameId != null && String(playingGameId) === String(game.gameid)}
                  priority={index < EAGER_IMAGE_COUNT}
                  cardVariant={cardVariant}
                  overlayCta={overlayCta}
                  rank={guestInspo ? index : undefined}
                  categoryId={categoryId}
                />
              ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dash-slot-carousel-block" id={categoryId ? `slot-cat-${categoryId}` : undefined}>
      <div className="dash-slot-carousel-head">
        <div className="dash-slot-carousel-title-wrap">
          <span className="slot-lobby-badge" style={{ '--c': meta.color }}>
            <SlotLobbyIcon name={meta.icon} />
          </span>
          <div>
            <p className="dash-slot-carousel-label">{label}</p>
            <div className="dash-slot-carousel-sub">{meta.subtitle}</div>
          </div>
        </div>
        {showAllHref ? (
          <Link to={showAllHref} className="dash-slot-carousel-show-all">
            See all
          </Link>
        ) : null}
        {hideNav ? null : (
          <div className="dash-slot-carousel-nav" aria-label={`${label} carousel navigation`}>
            <button
              type="button"
              className="dash-slot-carousel-btn dash-slot-carousel-btn--prev"
              onClick={() => scrollCarousel(-1)}
              aria-label={`Scroll ${label} left`}
              disabled={!canScrollLeft}
            >
              ‹
            </button>
            <button
              type="button"
              className="dash-slot-carousel-btn dash-slot-carousel-btn--next"
              onClick={() => scrollCarousel(1)}
              aria-label={`Scroll ${label} right`}
              disabled={!canScrollRight}
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="dash-slot-carousel-wrap">
        <div
          ref={scrollRef}
          className={`dash-slot-carousel-scroll${ranked ? ' dash-slot-carousel-scroll--ranked' : ''}${compact ? ' dash-slot-carousel-scroll--compact' : ''}`}
          role="list"
          aria-label={ariaLabel || label}
          aria-busy={loading}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {loading
            ? Array.from(
                { length: ranked ? TOP_GAMES_COUNT : compact ? 8 : CAROUSEL_SKELETON_COUNT },
                (_, index) => (
                  <CarouselGameCardSkeleton key={`${label}-skeleton-${index}`} ranked={ranked} />
                )
              )
            : visibleGames.map((game, index) => (
                <CarouselGameCard
                  key={game.id ?? game.title}
                  game={game}
                  onPlay={onPlay}
                  onCardClick={handleCardClick}
                  playing={playingGameId != null && String(playingGameId) === String(game.gameid)}
                  rank={ranked ? index + 1 : undefined}
                  compact={compact}
                  priority={index < EAGER_IMAGE_COUNT}
                  categoryId={categoryId}
                />
              ))}
        </div>
      </div>
    </div>
  );
}
